// Typed fetch wrappers for the boards CRUD surface (LLD §10). Same-origin JSON.
import type { BoardMeta, BoardState, Cart, CartLineSnapshot, Recommendation } from '../types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// getBoard returns the board plus its re-materializable children (recs/cart) — LLD §9.
// Mirrors server db.ts CartLineRow so the wire contract is one shape end to end.
export interface CartLineRow {
  id: string;
  boardId: string;
  shopDomain: string;
  variantGid: string;
  quantity: number;
  snapshot: CartLineSnapshot | null;
}
export interface BoardBundle {
  board: BoardState;
  recommendations: Recommendation[];
  cartLines: CartLineRow[];
}

export async function listBoards(): Promise<BoardMeta[]> {
  const { boards } = await json<{ boards: BoardMeta[] }>(await fetch('/api/boards'));
  return boards;
}

export async function fetchBoard(id: string): Promise<BoardBundle> {
  return json<BoardBundle>(await fetch(`/api/boards/${encodeURIComponent(id)}`));
}

export async function putBoard(state: BoardState): Promise<void> {
  await json<{ ok: true }>(
    await fetch(`/api/boards/${encodeURIComponent(state.id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    }),
  );
}

export async function removeBoard(id: string): Promise<void> {
  await json<{ ok: true }>(
    await fetch(`/api/boards/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
}

// Cart type is imported so downstream commerce hooks share one wire contract.
export type { Cart };
