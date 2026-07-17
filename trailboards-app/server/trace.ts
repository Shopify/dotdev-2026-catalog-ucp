// Live agent-call trace ("stats for nerds"). The UCP transport records one row per logical tool
// call; the workspace drawer replays what's stored then tails new calls over SSE. Two moving parts:
//   1. an AsyncLocalStorage that carries the current boardId down through resolveIntent → searchCatalog
//      → callTool, so the transport can attribute a call without threading boardId through every arg.
//   2. a process-wide EventEmitter the SSE route subscribes to, filtered per board.
// Recording is best-effort and never in the request's critical path — a trace failure can't break commerce.
import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import { appendCall, capForWire, maxAgentCallSeq, type AgentCallRow } from './db.js';

const store = new AsyncLocalStorage<{ boardId: string }>();

// One emitter for the whole process; each open drawer adds a listener, so no cap.
export const traceBus = new EventEmitter();
traceBus.setMaxListeners(0);

// Monotonic id → listCalls' lexical `id > sinceId` tail holds within a run; created_at ordering
// covers replay across restarts. Seeded from the stored max so a restart continues past prior ids
// (a fresh counter would replay c…001 and hit the agent_calls.id UNIQUE constraint).
let seq = maxAgentCallSeq();
const nextId = () => `c${String((seq += 1)).padStart(12, '0')}`;

// Run `fn` with `boardId` in scope so any UCP call it makes is attributed to that board.
export function runWithBoard<T>(boardId: string, fn: () => Promise<T>): Promise<T> {
  return store.run({ boardId }, fn);
}

export function currentBoardId(): string | null {
  return store.getStore()?.boardId ?? null;
}

// Record one tool call. No-op outside a board scope (boardId unknown). request/response are capped
// for both storage and the wire so live and reopen render identically.
export function record(row: Omit<AgentCallRow, 'id' | 'boardId' | 'createdAt'>): void {
  const boardId = currentBoardId();
  if (!boardId) return;
  const full: AgentCallRow = { ...row, id: nextId(), boardId, createdAt: new Date().toISOString() };
  try {
    appendCall(full);
  } catch (err) {
    console.error('trace append', err);
  }
  traceBus.emit('call', { ...full, request: capForWire(full.request), response: capForWire(full.response) });
}
