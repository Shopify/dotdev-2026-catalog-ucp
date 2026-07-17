import { config } from 'dotenv';
config({ override: true }); // trailboards/.env wins over ambient ANTHROPIC_* shell vars
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BoardState, BoardElement, CartLineSnapshot, TrailboardContext } from '../src/types.js';
import { isValidId, isValidShopDomain, sanitizeBuyer, sanitizeContext, buyerIpFrom } from './sanitize.js';
import {
  listBoards,
  getBoard,
  saveBoard,
  deleteBoard,
  upsertRecommendations,
  saveCartGroup,
  deleteCartGroup,
  listCalls,
  getLastResolvedHash,
  setLastResolvedHash,
  type CartLineRow,
  type AgentCallRow,
} from './db.js';
import { resolveIntent, createCart, getProduct, lookupCatalog, searchCatalog } from './commerce/connector.js';
import type { CatalogFilters } from './commerce/ucp.js';
import { describeImage } from './agent/describe.js';
import { traceBus, runWithBoard, record } from './trace.js';

// Stub mode until P7 wires the real provider: the app runs the full narrative on
// fixtures when no key is present. Browse → cart → checkout never needs a key.
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
const mode: 'live' | 'demo' = hasKey ? 'live' : 'demo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, '..', 'client'); // vite build output (dist/client)

process.on('unhandledRejection', (reason) => console.error('unhandledRejection', reason));
process.on('uncaughtException', (err) => console.error('uncaughtException', err));

const app = express();
app.use(express.json({ limit: '12mb' })); // base64 image context for visual search
app.use(express.static(CLIENT_DIR));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode });
});

// Optional image captioning for the inspiration element. Returns { available:false } with no key so
// the client asks the shopper to describe it; any model error degrades to the same manual path.
app.post('/api/describe-image', async (req, res) => {
  const { contentType, data } = (req.body ?? {}) as { contentType?: unknown; data?: unknown };
  if (typeof contentType !== 'string' || typeof data !== 'string' || !data) {
    return res.status(400).json({ error: 'contentType and data required' });
  }
  try {
    res.json(await describeImage(contentType, data));
  } catch (err) {
    console.error('describe.error', message(err));
    res.json({ available: false });
  }
});

// ─── Boards CRUD ──────────────────────────────────────────────
app.get('/api/boards', (_req, res) => {
  try {
    res.json({ boards: listBoards() });
  } catch (err) {
    res.status(500).json({ error: message(err) });
  }
});

app.get('/api/boards/:id', (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'invalid board id' });
  try {
    const bundle = getBoard(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'not found' });
    res.json(bundle);
  } catch (err) {
    res.status(500).json({ error: message(err) });
  }
});

app.put('/api/boards/:id', (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'invalid board id' });
  try {
    const body = (req.body ?? {}) as Partial<BoardState>;
    const elements = Array.isArray(body.elements) ? (body.elements as BoardElement[]) : [];
    const state: BoardState = {
      id: req.params.id,
      title: typeof body.title === 'string' ? body.title.slice(0, 200) : 'Untitled trip',
      theme: (body.theme ?? 'field') as BoardState['theme'],
      trip: body.trip ?? {},
      elements,
      demoMode: Boolean(body.demoMode),
      shoppingEnabled: Boolean(body.shoppingEnabled),
    };
    saveBoard(state);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: message(err) });
  }
});

app.delete('/api/boards/:id', (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'invalid board id' });
  try {
    deleteBoard(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: message(err) });
  }
});

// ─── Commerce (keyless UCP) ───────────────────────────────────
// Board context → recommendations. Persists the current rec set for reopen re-materialization.
app.post('/api/resolve', async (req, res) => {
  const ctx = (req.body?.context ?? {}) as TrailboardContext;
  if (!isValidId(ctx.boardId)) return res.status(400).json({ error: 'invalid board id' });
  try {
    // Reopening/remounting a board re-sends the same context — skip an identical resolve_intent +
    // search_catalog call and serve the already-persisted recs instead. A trace row still lands so
    // the drawer shows why nothing new fired, rather than looking silent.
    if (ctx.hash && ctx.hash === getLastResolvedHash(ctx.boardId)) {
      const items = getBoard(ctx.boardId)?.recommendations ?? [];
      await runWithBoard(ctx.boardId, async () =>
        record({
          tool: 'resolve_intent',
          backend: 'agent',
          request: { hash: ctx.hash },
          // Carry the current intent mode so the header pill reflects capability even on a skip
          // (no fresh agent/stub row is produced when the context is unchanged). hasKey is constant
          // per process, so this is the mode a real resolve would use right now.
          response: { skipped: true, reason: 'context unchanged since last resolve', source: hasKey ? 'agent' : 'stub' },
          status: 'skipped',
          latencyMs: 0,
        }),
      );
      return res.json({ boardId: ctx.boardId, items, status: items.length ? 'ok' : 'empty', cursor: null });
    }

    const result = await runWithBoard(ctx.boardId, () => resolveIntent(ctx));
    try {
      upsertRecommendations(ctx.boardId, result.items);
      if (ctx.hash) setLastResolvedHash(ctx.boardId, ctx.hash);
    } catch (e) {
      console.error('persist recs', e);
    }
    res.json(result);
  } catch (err) {
    // A stubbed leg (early branch) surfaces as an on-brand empty state, never a stack trace.
    if (/stub/i.test(message(err))) {
      return res.json({ boardId: ctx.boardId, items: [], status: 'stub', cursor: null });
    }
    res.status(500).json({ error: message(err) });
  }
});

// Create a single-merchant cart and return live totals. shopDomain is pinned to *.myshopify.com
// (anti-SSRF); buyer/context are sanitized; the real Shopify-Buyer-IP is derived server-side.
app.post('/api/cart', async (req, res) => {
  const body = (req.body ?? {}) as {
    shopDomain?: unknown;
    boardId?: unknown;
    items?: { variantId: string; quantity: number; snapshot?: CartLineSnapshot }[];
    buyer?: unknown;
    context?: unknown;
  };
  const shopDomain = body.shopDomain;
  if (!isValidShopDomain(shopDomain)) return res.status(400).json({ error: 'invalid shop domain' });
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return res.status(400).json({ error: 'no items' });

  const buyerIp = buyerIpFrom(req.headers['x-forwarded-for'], req.socket.remoteAddress);
  const boardId = body.boardId;
  try {
    // create_cart only needs variant + qty; the snapshot rides along solely for persistence.
    const cartItems = items.map((it) => ({ variantId: it.variantId, quantity: it.quantity }));
    const run = () => createCart(shopDomain, cartItems, buyerIp, sanitizeBuyer(body.buyer), sanitizeContext(body.context));
    const cart = isValidId(boardId) ? await runWithBoard(boardId, run) : await run();
    if (isValidId(boardId)) {
      const lines: CartLineRow[] = items.map((it) => ({
        id: `${boardId}:${shopDomain}:${it.variantId}`,
        boardId,
        shopDomain,
        variantGid: it.variantId,
        quantity: it.quantity ?? 1,
        snapshot: it.snapshot ?? null,
      }));
      try {
        saveCartGroup(boardId, shopDomain, lines);
      } catch (e) {
        console.error('persist cart', e);
      }
    }
    res.json({ cart });
  } catch (err) {
    if (/stub/i.test(message(err))) return res.status(501).json({ error: 'stub:cart' });
    res.status(500).json({ error: message(err) });
  }
});

// Persist a merchant group's removal (last line taken out) so it stays gone after a reload.
app.post('/api/cart/remove', (req, res) => {
  const body = (req.body ?? {}) as { boardId?: unknown; shopDomain?: unknown };
  if (!isValidId(body.boardId)) return res.status(400).json({ error: 'invalid board id' });
  if (!isValidShopDomain(body.shopDomain)) return res.status(400).json({ error: 'invalid shop domain' });
  try {
    deleteCartGroup(body.boardId, body.shopDomain);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: message(err) });
  }
});

// Single product, optionally with a variant pre-selected (grey-out logic in the PDP).
app.get('/api/product/:id', async (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const board = req.query.board;
  try {
    const run = () => getProduct(id, parseSelected(req.query.selected));
    const product = isValidId(board) ? await runWithBoard(board, run) : await run();
    res.json({ product });
  } catch (err) {
    res.status(500).json({ error: message(err) });
  }
});

// Re-materialize saved products at current price/availability on reopen (≤50 ids).
app.post('/api/lookup', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((x) => typeof x === 'string') : [];
  const board = req.body?.boardId;
  try {
    const run = () => lookupCatalog(ids as string[]);
    const products = isValidId(board) ? await runWithBoard(board, run) : await run();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: message(err) });
  }
});

// Manual free-text catalog search (no agent involved) — the Search tab's own results, independent
// of resolveIntent's recommendations. Filters are limited to the account's saved defaults; unlike
// resolveIntent's fuller buildFilters, there's no traveler-attribute/destination inference to apply
// to a query the shopper typed themselves.
app.post('/api/search', async (req, res) => {
  const body = (req.body ?? {}) as {
    query?: unknown;
    boardId?: unknown;
    profileFilters?: TrailboardContext['profileFilters'];
  };
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return res.status(400).json({ error: 'query required' });
  try {
    const run = () => searchCatalog({ query, filters: filtersFromProfile(body.profileFilters), limit: 24 });
    const result = isValidId(body.boardId) ? await runWithBoard(body.boardId, run) : await run();
    res.json(result);
  } catch (err) {
    if (/stub/i.test(message(err))) return res.json({ products: [], cursor: null });
    res.status(500).json({ error: message(err) });
  }
});

// ─── Trace (SSE) ──────────────────────────────────────────────
// Per-board agent-call stream: replay everything stored (oldest→newest, already capped) then tail
// new calls live. One listener per open drawer; cleaned up on disconnect.
app.get('/api/trace/:boardId', (req, res) => {
  const boardId = req.params.boardId;
  if (!isValidId(boardId)) return res.status(400).json({ error: 'invalid board id' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  for (const row of listCalls(boardId)) res.write(`data: ${JSON.stringify(row)}\n\n`);

  const onCall = (row: AgentCallRow) => {
    if (row.boardId === boardId) res.write(`data: ${JSON.stringify(row)}\n\n`);
  };
  traceBus.on('call', onCall);

  const heartbeat = setInterval(() => res.write(': hb\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    traceBus.off('call', onCall);
  });
});

// SPA fallback — any non-API path serves the client shell (client-side routing).
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

// Mirrors connector.ts's buildFilters() field mapping, minus the traveler-attribute/destination
// inference a manual search doesn't need — just the account's own saved shopping defaults.
function filtersFromProfile(pf: TrailboardContext['profileFilters'] | undefined): CatalogFilters {
  const filters: CatalogFilters = { available: true, condition: pf?.condition ?? ['new'] };
  if (pf?.shipsToCountry) filters.ships_to = { country: pf.shipsToCountry };
  if (pf?.priceMaxCents) filters.price = { max: pf.priceMaxCents };
  if (pf?.ratingMin != null) filters.rating = { variant: { min: pf.ratingMin } };
  return filters;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

// `selected` arrives as a JSON string of [{name,label}] on the product query.
function parseSelected(raw: unknown): { name: string; label: string }[] | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return undefined;
    return arr
      .filter((s) => s && typeof s.name === 'string' && typeof s.label === 'string')
      .map((s) => ({ name: String(s.name), label: String(s.label) }));
  } catch {
    return undefined;
  }
}

const PORT = Number(process.env.PORT) || 3100;
const server = app.listen(PORT, () => {
  console.log(`\nTrailboards`);
  console.log(`  Local: http://localhost:${PORT}`);
  console.log(`  Mode:  ${mode === 'live' ? 'live' : 'demo (no API key — add one to .env)'}\n`);
});

// Graceful shutdown: open trace SSE streams (long-lived responses + heartbeat intervals) keep the
// event loop alive, so without this a restart signal would hang until `tsx watch` force-kills at 5s.
// Close idle keep-alive + live SSE connections so the process exits promptly and the port frees.
let closing = false;
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    if (closing) return;
    closing = true;
    server.closeAllConnections?.();
    server.close(() => process.exit(0));
    // Backstop in case a connection refuses to drain.
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
