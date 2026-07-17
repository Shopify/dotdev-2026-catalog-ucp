// Typed fetch wrappers for the keyless commerce routes (LLD §10). Same-origin JSON.
import type { Cart, CartLineSnapshot, Product, RecommendationSet, TrailboardContext } from '../types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// Board context → recommendation set (the agent-for-guidance / APIs-for-truth call).
export async function resolveBoard(context: TrailboardContext): Promise<RecommendationSet> {
  // Note: RecommendationSet has no `source` — the live/stub signal rides the trace stream
  // (resolve_intent.response.source), read by useTrace / IntentModeChip.
  return json<RecommendationSet>(
    await fetch('/api/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context }),
    }),
  );
}

export interface CartLineInput {
  variantId: string;
  quantity: number;
  snapshot?: CartLineSnapshot; // persisted so the group rebuilds on reload
}

// One create_cart per merchant. shopDomain is pinned to *.myshopify.com server-side. The snapshot on
// each item is stored (not sent to the catalog) so the cart survives a refresh.
export async function createMerchantCart(input: {
  shopDomain: string;
  boardId: string;
  items: CartLineInput[];
  buyer?: Record<string, string>;
  context?: Record<string, string>;
}): Promise<Cart> {
  const { cart } = await json<{ cart: Cart }>(
    await fetch('/api/cart', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
  return cart;
}

// Persist a merchant group's removal so the empty group stays gone after a reload.
export async function removeMerchantCart(input: { boardId: string; shopDomain: string }): Promise<void> {
  await json<{ ok: true }>(
    await fetch('/api/cart/remove', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

// Single product with option available/exists flags — powers the PDP overlay grey-out.
// `boardId` (optional) attributes the get_product call to the board's trace.
export async function getProductById(
  id: string,
  selected?: { name: string; label: string }[],
  boardId?: string,
): Promise<Product | null> {
  const params = new URLSearchParams();
  if (selected?.length) params.set('selected', JSON.stringify(selected));
  if (boardId) params.set('board', boardId);
  const q = params.toString() ? `?${params}` : '';
  const { product } = await json<{ product: Product | null }>(
    await fetch(`/api/product/${encodeURIComponent(id)}${q}`),
  );
  return product;
}

// Re-materialize saved products at current price/availability on reopen (≤50 ids).
export async function lookupProducts(ids: string[], boardId?: string): Promise<Product[]> {
  if (!ids.length) return [];
  const { products } = await json<{ products: Product[] }>(
    await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids, boardId }),
    }),
  );
  return products;
}

// Manual free-text catalog search for the Search tab — no agent involved, filtered only by the
// account's saved shopping defaults.
export async function searchProducts(
  query: string,
  profileFilters: TrailboardContext['profileFilters'],
  boardId?: string,
): Promise<{ products: Product[]; cursor: string | null }> {
  return json<{ products: Product[]; cursor: string | null }>(
    await fetch('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, profileFilters, boardId }),
    }),
  );
}
