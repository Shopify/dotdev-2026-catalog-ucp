import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  BoardState,
  BoardMeta,
  BoardElement,
  CartLineSnapshot,
  Recommendation,
} from '../src/types.js';

// Zero-dependency persistence on Node's built-in SQLite (node:sqlite `DatabaseSync`).
// One file at trailboards/data/trailboards.db (gitignored). Unlike scout's single-blob
// conversations table, boards are normalized into child tables (LLD §9) so agent_calls
// can stream and recs/cart re-materialize cheaply on reopen.
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'trailboards.db');
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY, title TEXT, trip_meta TEXT,
    theme TEXT, demo_mode INTEGER, shopping_enabled INTEGER, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS elements (
    id TEXT PRIMARY KEY, board_id TEXT, type TEXT, payload TEXT,
    x REAL, y REAL, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY, board_id TEXT, product_gid TEXT,
    snapshot TEXT, reasons TEXT, confidence REAL, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS cart_lines (
    id TEXT PRIMARY KEY, board_id TEXT, shop_domain TEXT, variant_gid TEXT,
    quantity INTEGER, snapshot TEXT, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS agent_calls (
    id TEXT PRIMARY KEY, board_id TEXT, tool TEXT, backend TEXT,
    request TEXT, response TEXT, status TEXT, latency_ms INTEGER, created_at TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_calls_board ON agent_calls(board_id, created_at);
`);

// Migration for DBs created before last_resolved_hash existed — CREATE TABLE IF NOT EXISTS above
// won't add a column to an already-existing boards table.
try {
  db.exec('ALTER TABLE boards ADD COLUMN last_resolved_hash TEXT');
} catch {
  /* column already exists */
}

// Migration for DBs created before shopping_enabled existed.
try {
  db.exec('ALTER TABLE boards ADD COLUMN shopping_enabled INTEGER');
} catch {
  /* column already exists */
}

// ── shapes ─────────────────────────────────────────────────────
export interface CartLineRow {
  id: string;
  boardId: string;
  shopDomain: string;
  variantGid: string;
  quantity: number;
  snapshot: CartLineSnapshot | null;
}

export interface AgentCallRow {
  id: string;
  boardId: string;
  tool: string;
  backend: 'catalog' | 'merchant' | 'weather' | 'agent';
  request: unknown;
  response: unknown;
  status: string;
  latencyMs: number;
  createdAt?: string;
}

const CALLS_PER_BOARD = 200; // R-Q5 retention
const JSON_CAP = 32 * 1024; // R-Q5 cap; big enough for a typical 6-product search_catalog response

function parse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// search_catalog/lookup_catalog responses are dominated by their `products` array — trim it from
// the tail until the payload fits, instead of discarding the whole response. A discarded response
// used to look identical to a search that returned nothing, which is misleading in the trace drawer.
function dropProductsToFit(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Record<string, unknown>).products)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const original = obj.products as unknown[];
  const products = [...original];
  while (products.length > 0) {
    const candidate = { ...obj, products, productsShown: products.length, productsTotal: original.length };
    if (JSON.stringify(candidate).length <= JSON_CAP) return candidate;
    products.pop();
  }
  return { ...obj, products: [], productsShown: 0, productsTotal: original.length };
}

// Hard-cap over-JSON_CAP payloads so a giant base64 image context can't bloat the trace store or
// the wire. Live SSE and reopen-replay both run values through this, so the two views stay
// identical. Prefers trimming a products array over nuking the whole payload (see above).
export function capForWire(value: unknown): unknown {
  const s = JSON.stringify(value ?? null);
  if (s.length <= JSON_CAP) return value;
  return dropProductsToFit(value) ?? { truncated: true, bytes: s.length };
}
function capJson(value: unknown): string {
  return JSON.stringify(capForWire(value));
}

// ── boards ─────────────────────────────────────────────────────
export function listBoards(): BoardMeta[] {
  const rows = db
    .prepare('SELECT id, title, trip_meta, theme, updated_at FROM boards ORDER BY updated_at DESC')
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    trip: parse(r.trip_meta, {}),
    theme: (String(r.theme) || 'field') as BoardMeta['theme'],
    updatedAt: String(r.updated_at ?? ''),
  }));
}

export interface BoardBundle {
  board: BoardState;
  recommendations: Recommendation[];
  cartLines: CartLineRow[];
}

export function getBoard(id: string): BoardBundle | null {
  const r = db.prepare('SELECT * FROM boards WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;

  const elementRows = db
    .prepare('SELECT * FROM elements WHERE board_id = ? ORDER BY created_at')
    .all(id) as Record<string, unknown>[];
  const elements: BoardElement[] = elementRows.map((e) => ({
    id: String(e.id),
    type: String(e.type) as BoardElement['type'],
    x: Number(e.x) || 0,
    y: Number(e.y) || 0,
    payload: parse(e.payload, {}),
    createdAt: String(e.created_at ?? ''),
  }));

  const recRows = db
    .prepare('SELECT * FROM recommendations WHERE board_id = ? ORDER BY created_at')
    .all(id) as Record<string, unknown>[];
  const recommendations: Recommendation[] = recRows.map((rec) => ({
    product: parse(rec.snapshot, null as never),
    reasons: parse(rec.reasons, []),
    confidence: Number(rec.confidence) || 0,
  }));

  const lineRows = db
    .prepare('SELECT * FROM cart_lines WHERE board_id = ? ORDER BY created_at')
    .all(id) as Record<string, unknown>[];
  const cartLines: CartLineRow[] = lineRows.map((l) => ({
    id: String(l.id),
    boardId: String(l.board_id),
    shopDomain: String(l.shop_domain ?? ''),
    variantGid: String(l.variant_gid ?? ''),
    quantity: Number(l.quantity) || 1,
    snapshot: parse(l.snapshot, null),
  }));

  const board: BoardState = {
    id: String(r.id),
    title: String(r.title ?? ''),
    theme: (String(r.theme) || 'field') as BoardState['theme'],
    trip: parse(r.trip_meta, {}),
    elements,
    demoMode: Number(r.demo_mode) === 1,
    shoppingEnabled: Number(r.shopping_enabled) === 1,
  };
  return { board, recommendations, cartLines };
}

export function saveBoard(state: BoardState): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO boards (id, title, trip_meta, theme, demo_mode, shopping_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       trip_meta = excluded.trip_meta,
       theme = excluded.theme,
       demo_mode = excluded.demo_mode,
       shopping_enabled = excluded.shopping_enabled,
       updated_at = excluded.updated_at`,
  ).run(
    state.id,
    state.title.slice(0, 200),
    JSON.stringify(state.trip ?? {}),
    state.theme,
    state.demoMode ? 1 : 0,
    state.shoppingEnabled ? 1 : 0,
    now,
    now,
  );
  replaceElements(state.id, state.elements);
}

// Idempotency guard (LLD §8): lets /api/resolve skip an identical resolve_intent + search_catalog
// call when a board is reopened/remounted with nothing salient changed since the last resolve.
export function getLastResolvedHash(boardId: string): string | null {
  const r = db.prepare('SELECT last_resolved_hash FROM boards WHERE id = ?').get(boardId) as
    | { last_resolved_hash?: string | null }
    | undefined;
  return r?.last_resolved_hash ?? null;
}

export function setLastResolvedHash(boardId: string, hash: string): void {
  db.prepare('UPDATE boards SET last_resolved_hash = ? WHERE id = ?').run(hash, boardId);
}

export function deleteBoard(id: string): void {
  db.prepare('DELETE FROM boards WHERE id = ?').run(id);
  db.prepare('DELETE FROM elements WHERE board_id = ?').run(id);
  db.prepare('DELETE FROM recommendations WHERE board_id = ?').run(id);
  db.prepare('DELETE FROM cart_lines WHERE board_id = ?').run(id);
  db.prepare('DELETE FROM agent_calls WHERE board_id = ?').run(id);
}

export function replaceElements(boardId: string, els: BoardElement[]): void {
  db.prepare('DELETE FROM elements WHERE board_id = ?').run(boardId);
  const stmt = db.prepare(
    `INSERT INTO elements (id, board_id, type, payload, x, y, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const e of els) {
    stmt.run(
      e.id,
      boardId,
      e.type,
      JSON.stringify(e.payload ?? {}),
      e.x,
      e.y,
      e.createdAt || new Date().toISOString(),
    );
  }
}

export function upsertRecommendations(boardId: string, recs: Recommendation[]): void {
  db.prepare('DELETE FROM recommendations WHERE board_id = ?').run(boardId);
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO recommendations (id, board_id, product_gid, snapshot, reasons, confidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  recs.forEach((rec, i) => {
    stmt.run(
      `${boardId}:${rec.product.id}`,
      boardId,
      rec.product.id,
      JSON.stringify(rec.product),
      JSON.stringify(rec.reasons ?? []),
      rec.confidence,
      `${now}:${String(i).padStart(3, '0')}`,
    );
  });
}

// Persist one merchant group's lines. Scoped to (board, shop) so adding to merchant B never
// clobbers merchant A's saved lines — the whole-board carts survive a reload intact.
export function saveCartGroup(boardId: string, shopDomain: string, lines: CartLineRow[]): void {
  db.prepare('DELETE FROM cart_lines WHERE board_id = ? AND shop_domain = ?').run(boardId, shopDomain);
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO cart_lines (id, board_id, shop_domain, variant_gid, quantity, snapshot, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const l of lines) {
    stmt.run(l.id, boardId, l.shopDomain, l.variantGid, l.quantity, JSON.stringify(l.snapshot ?? null), now);
  }
}

// Drop a merchant group entirely (buyer emptied it) so the removal persists across reloads.
export function deleteCartGroup(boardId: string, shopDomain: string): void {
  db.prepare('DELETE FROM cart_lines WHERE board_id = ? AND shop_domain = ?').run(boardId, shopDomain);
}

// ── agent_calls (trace) ────────────────────────────────────────
export function appendCall(row: AgentCallRow): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO agent_calls (id, board_id, tool, backend, request, response, status, latency_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.boardId,
    row.tool,
    row.backend,
    capJson(row.request),
    capJson(row.response),
    row.status,
    row.latencyMs,
    now,
  );
  // Retention: keep only the most recent CALLS_PER_BOARD rows for this board.
  db.prepare(
    `DELETE FROM agent_calls WHERE board_id = ? AND id NOT IN (
       SELECT id FROM agent_calls WHERE board_id = ? ORDER BY created_at DESC LIMIT ?
     )`,
  ).run(row.boardId, row.boardId, CALLS_PER_BOARD);
}

// Largest stored call sequence (ids are `c` + 12-digit zero-padded, so lexical max = numeric max).
// The trace seeds its in-memory counter from this at startup so ids never collide with rows from a
// previous run — the counter is process-local and would otherwise restart at 1 after a restart.
export function maxAgentCallSeq(): number {
  const r = db.prepare("SELECT id FROM agent_calls WHERE id LIKE 'c%' ORDER BY id DESC LIMIT 1").get() as
    | { id?: string }
    | undefined;
  if (!r?.id) return 0;
  const n = Number.parseInt(r.id.slice(1), 10);
  return Number.isFinite(n) ? n : 0;
}

export function listCalls(boardId: string, sinceId?: string): AgentCallRow[] {
  const rows = (
    sinceId
      ? db
          .prepare(
            'SELECT * FROM agent_calls WHERE board_id = ? AND id > ? ORDER BY created_at',
          )
          .all(boardId, sinceId)
      : db
          .prepare('SELECT * FROM agent_calls WHERE board_id = ? ORDER BY created_at')
          .all(boardId)
  ) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    boardId: String(r.board_id),
    tool: String(r.tool ?? ''),
    backend: String(r.backend ?? '') as AgentCallRow['backend'],
    request: parse(r.request, null),
    response: parse(r.response, null),
    status: String(r.status ?? ''),
    latencyMs: Number(r.latency_ms) || 0,
    createdAt: String(r.created_at ?? ''),
  }));
}
