// Commerce state = pure reducer (mirrors boardStore.ts). Recommendations come from /api/resolve;
// adding a variant assembles a per-merchant cart grouped by seller.id (the "universal cart" is these
// groups assembled client-side). Live totals stream back from each merchant's create_cart.
import type { Cart, Recommendation, RecommendationSet, Seller, Variant } from '../types';
import type { CartLineRow } from '../api/boards';

export const QTY_CAP = 2; // subtlety rule (LLD §7): never auto-stack beyond 2 without confirmation

export type GroupState = 'pending' | 'ok' | 'error';

export interface CartLine {
  variantId: string;
  productId: string;
  title: string;
  variant: Variant;
  quantity: number;
  capLifted: boolean; // set once the buyer confirms "more than 2"
  image: string | null; // line thumbnail — variant media, else product primary
}

// Post-checkout banner: order placed with a merchant (ok) or the hand-off failed (err).
export interface CheckoutNotice {
  kind: 'ok' | 'err';
  shopName: string;
  text: string;
}

// One merchant group, keyed by seller.id (Shop GID). shopDomain drives the create_cart call.
export interface MerchantGroup {
  seller: Seller;
  lines: CartLine[];
  cart: Cart | null; // live totals / continue_url from create_cart
  state: GroupState;
  error?: string;
}

export type ResolveStatus = 'idle' | 'resolving' | 'ok' | 'empty' | 'stub' | 'error';

export interface CommerceState {
  status: ResolveStatus;
  recs: Recommendation[];
  nudge?: string;
  clarify?: string;
  needsInput?: boolean;
  error?: string;
  dismissed: string[]; // product ids — won't suggest again
  owned: string[]; // variant ids — "I already own this"
  groups: Record<string, MerchantGroup>; // key = seller.id
  notice?: CheckoutNotice | null; // transient post-checkout banner
}

export const initialCommerce: CommerceState = {
  status: 'idle',
  recs: [],
  dismissed: [],
  owned: [],
  groups: {},
};

export type CommerceAction =
  | { type: 'resolving' }
  | { type: 'resolved'; set: RecommendationSet }
  | { type: 'resolveError'; message: string }
  | { type: 'dismiss'; productId: string }
  | { type: 'own'; variantId: string }
  | { type: 'groupPending'; seller: Seller; lines: CartLine[] }
  | { type: 'groupResolved'; shopGid: string; cart: Cart }
  | { type: 'groupError'; shopGid: string; message: string }
  | { type: 'removeGroup'; shopGid: string }
  | { type: 'checkoutComplete'; shopGid: string; shopName: string }
  | { type: 'checkoutFailed'; shopName: string; message: string }
  | { type: 'clearNotice' }
  | { type: 'hydrate'; groups: Record<string, MerchantGroup>; owned: string[] };

export function commerceReducer(state: CommerceState, action: CommerceAction): CommerceState {
  switch (action.type) {
    case 'resolving':
      return { ...state, status: 'resolving', error: undefined };
    case 'resolved':
      return {
        ...state,
        status: action.set.status === 'ok' && !action.set.items.length ? 'empty' : action.set.status,
        recs: action.set.items,
        nudge: action.set.nudge,
        clarify: action.set.clarify,
        needsInput: action.set.needsInput,
        error: undefined,
      };
    case 'resolveError':
      return { ...state, status: 'error', error: action.message };
    case 'dismiss':
      return {
        ...state,
        dismissed: state.dismissed.includes(action.productId)
          ? state.dismissed
          : [...state.dismissed, action.productId],
      };
    case 'own':
      return {
        ...state,
        owned: state.owned.includes(action.variantId) ? state.owned : [...state.owned, action.variantId],
      };
    case 'groupPending':
      return {
        ...state,
        notice: null, // any new cart activity clears a stale post-checkout banner
        groups: {
          ...state.groups,
          [action.seller.id]: {
            seller: action.seller,
            lines: action.lines,
            cart: state.groups[action.seller.id]?.cart ?? null,
            state: 'pending',
          },
        },
      };
    case 'groupResolved': {
      const g = state.groups[action.shopGid];
      if (!g) return state;
      return { ...state, groups: { ...state.groups, [action.shopGid]: { ...g, cart: action.cart, state: 'ok', error: undefined } } };
    }
    case 'groupError': {
      const g = state.groups[action.shopGid];
      if (!g) return state;
      return { ...state, groups: { ...state.groups, [action.shopGid]: { ...g, state: 'error', error: action.message } } };
    }
    case 'removeGroup': {
      const next = { ...state.groups };
      delete next[action.shopGid];
      return { ...state, groups: next };
    }
    case 'checkoutComplete': {
      const next = { ...state.groups };
      delete next[action.shopGid]; // order placed → the merchant's cart is spent
      return {
        ...state,
        groups: next,
        notice: { kind: 'ok', shopName: action.shopName, text: `Order placed with ${action.shopName}.` },
      };
    }
    case 'checkoutFailed':
      return {
        ...state,
        notice: { kind: 'err', shopName: action.shopName, text: `Checkout with ${action.shopName} didn’t complete.` },
      };
    case 'clearNotice':
      return { ...state, notice: null };
    case 'hydrate':
      return { ...state, groups: action.groups, owned: action.owned };
    default:
      return state;
  }
}

// Total line count across all merchant groups — the Cart tab badge.
export function cartCount(state: CommerceState): number {
  return Object.values(state.groups).reduce((n, g) => n + g.lines.reduce((m, l) => m + l.quantity, 0), 0);
}

// Rebuild merchant groups from persisted cart lines (reopen). Each row's snapshot carries enough to
// reconstruct the CartLine + seller; groups start 'pending' with no live cart — the provider replays
// create_cart per group to re-materialize totals/continue_url at current price/stock.
export function hydrateGroups(rows: CartLineRow[]): Record<string, MerchantGroup> {
  const groups: Record<string, MerchantGroup> = {};
  for (const row of rows) {
    const snap = row.snapshot;
    if (!snap) continue; // pre-snapshot rows can't be rebuilt — skip rather than render a blank line
    const line: CartLine = {
      variantId: row.variantGid,
      productId: snap.productId,
      title: snap.title,
      variant: snap.variant,
      quantity: row.quantity,
      capLifted: snap.capLifted,
      image: snap.image ?? snap.variant.image ?? null,
    };
    const key = snap.seller.id;
    const existing = groups[key];
    if (existing) existing.lines.push(line);
    else groups[key] = { seller: snap.seller, lines: [line], cart: null, state: 'pending' };
  }
  return groups;
}
