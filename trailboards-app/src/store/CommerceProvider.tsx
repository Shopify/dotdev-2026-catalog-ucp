// Commerce context: owns the commerce reducer and the async orchestration around it — resolve board
// context to recommendations, eager-add a variant into its merchant's create_cart, adjust quantity,
// remove lines, and hand off to checkout. Components stay presentational; the rules live here.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { Product, Seller, TrailboardContext, Variant } from '../types';
import { resolveBoard, createMerchantCart, removeMerchantCart, type CartLineInput } from '../api/commerce';
import type { CartLineRow } from '../api/boards';
import { openCheckout, type CheckoutPrefill } from '../commerce/checkout';
import {
  cartCount,
  commerceReducer,
  hydrateGroups,
  initialCommerce,
  QTY_CAP,
  type CartLine,
  type CommerceState,
  type MerchantGroup,
} from './commerceStore';
import { variantSummary } from '../lib/price';
import { useBoard } from './BoardProvider';
import { useProfile } from './useProfile';
import { deriveBuyerInfo, type BuyerInfo } from '../lib/profile';

// create_cart's buyer/context are separate objects on the wire; Checkout Kit's prefill is a flat
// record — same BuyerInfo, three shapes.
function toCartBuyer(info: BuyerInfo): Record<string, string> {
  const out: Record<string, string> = {};
  if (info.first_name) out.first_name = info.first_name;
  if (info.last_name) out.last_name = info.last_name;
  if (info.email) out.email = info.email;
  if (info.phone) out.phone_number = info.phone;
  return out;
}
function toCartContext(info: BuyerInfo): Record<string, string> {
  const out: Record<string, string> = {};
  if (info.country) out.address_country = info.country;
  if (info.province) out.address_region = info.province;
  if (info.postalCode) out.postal_code = info.postalCode;
  return out;
}
function toCheckoutPrefill(info: BuyerInfo): CheckoutPrefill {
  const out: CheckoutPrefill = {};
  if (info.email) out.email = info.email;
  if (info.first_name) out.first_name = info.first_name;
  if (info.last_name) out.last_name = info.last_name;
  if (info.address1) out.address1 = info.address1;
  if (info.city) out.city = info.city;
  if (info.province) out.province = info.province;
  if (info.postalCode) out.zip = info.postalCode;
  if (info.country) out.country = info.country;
  return out;
}

interface CommerceContextValue {
  state: CommerceState;
  shoppingEnabled: boolean;
  setShoppingEnabled: (enabled: boolean) => void;
  resolve: (ctx: TrailboardContext) => Promise<void>;
  dismiss: (productId: string) => void;
  own: (variantId: string) => void;
  addVariant: (product: Product, variant: Variant, quantity?: number) => Promise<void>;
  setQty: (shopGid: string, variantId: string, quantity: number) => Promise<void>;
  liftCap: (shopGid: string, variantId: string) => Promise<void>;
  removeLine: (shopGid: string, variantId: string) => Promise<void>;
  checkout: (shopGid: string) => Promise<void>;
  clearNotice: () => void;
}

const Ctx = createContext<CommerceContextValue | null>(null);

// Seller a variant carts under — R5 puts it per-variant; fall back to the product's shop.
function sellerOf(product: Product, variant: Variant) {
  if (variant.seller?.domain) return variant.seller;
  if (product.seller?.domain) return { name: product.seller.name, id: product.seller.domain, domain: product.seller.domain };
  return null;
}

// Each input carries the persistence snapshot so a refresh can rebuild the group without re-fetching
// product detail. The catalog call itself only reads variantId/quantity server-side.
function toInputs(seller: Seller, lines: CartLine[]): CartLineInput[] {
  return lines.map((l) => ({
    variantId: l.variantId,
    quantity: l.quantity,
    snapshot: { seller, productId: l.productId, title: l.title, variant: l.variant, capLifted: l.capLifted, image: l.image },
  }));
}

export function CommerceProvider({
  children,
  initialCartLines,
  initialShoppingEnabled,
}: {
  children: ReactNode;
  initialCartLines?: CartLineRow[];
  initialShoppingEnabled?: boolean;
}) {
  const { state: board } = useBoard();
  const boardId = board.id;
  const [profile] = useProfile();
  const buyerInfo = useMemo(() => deriveBuyerInfo(profile), [profile]);
  const [state, dispatch] = useReducer(commerceReducer, initialCommerce);
  const stateRef = useRef(state);
  stateRef.current = state;
  const hydrated = useRef(false);

  // Off by default — "just Trailboards" until switched on, unless the board was reopened with it
  // already on. A ref mirror keeps `resolve`'s gate fresh even when a caller flips the flag and calls
  // resolve() in the same tick (state updates are async).
  const shoppingEnabledRef = useRef(Boolean(initialShoppingEnabled));
  const [shoppingEnabled, setShoppingEnabledState] = useState(Boolean(initialShoppingEnabled));
  const setShoppingEnabled = useCallback((v: boolean) => {
    shoppingEnabledRef.current = v;
    setShoppingEnabledState(v);
  }, []);

  const resolve = useCallback(async (ctx: TrailboardContext) => {
    if (!shoppingEnabledRef.current) return;
    dispatch({ type: 'resolving' });
    try {
      const set = await resolveBoard(ctx);
      dispatch({ type: 'resolved', set });
    } catch (e) {
      dispatch({ type: 'resolveError', message: e instanceof Error ? e.message : 'resolve failed' });
    }
  }, []);

  const dismiss = useCallback((productId: string) => dispatch({ type: 'dismiss', productId }), []);
  const own = useCallback((variantId: string) => dispatch({ type: 'own', variantId }), []);

  // Recompute a merchant group's lines, then re-run create_cart so totals stay live. Empty → drop the
  // group locally AND clear its persisted lines so the removal survives a reload.
  const syncGroup = useCallback(
    async (group: MerchantGroup) => {
      if (!group.lines.length) {
        dispatch({ type: 'removeGroup', shopGid: group.seller.id });
        try {
          await removeMerchantCart({ boardId, shopDomain: group.seller.domain });
        } catch {
          /* best-effort: the group is already gone client-side */
        }
        return;
      }
      dispatch({ type: 'groupPending', seller: group.seller, lines: group.lines });
      try {
        const cart = await createMerchantCart({
          shopDomain: group.seller.domain,
          boardId,
          items: toInputs(group.seller, group.lines),
          buyer: toCartBuyer(buyerInfo),
          context: toCartContext(buyerInfo),
        });
        dispatch({ type: 'groupResolved', shopGid: group.seller.id, cart });
      } catch (e) {
        dispatch({ type: 'groupError', shopGid: group.seller.id, message: e instanceof Error ? e.message : 'cart failed' });
      }
    },
    [boardId, buyerInfo],
  );

  // On first mount, rebuild persisted merchant groups and replay create_cart per group so the reopened
  // board shows the same carts with fresh totals/continue_url. Runs once; new sessions with no saved
  // lines are a no-op.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const rows = initialCartLines ?? [];
    if (!rows.length) return;
    const groups = hydrateGroups(rows);
    if (!Object.keys(groups).length) return;
    dispatch({ type: 'hydrate', groups, owned: stateRef.current.owned });
    for (const group of Object.values(groups)) void syncGroup(group);
  }, [initialCartLines, syncGroup]);

  const addVariant = useCallback(
    async (product: Product, variant: Variant, quantity = 1) => {
      const seller = sellerOf(product, variant);
      if (!seller) return;
      const group = stateRef.current.groups[seller.id];
      const existing = group?.lines ?? [];
      const prior = existing.find((l) => l.variantId === variant.id);
      const capLifted = prior?.capLifted ?? false;
      const rawQty = (prior?.quantity ?? 0) + quantity;
      const qty = capLifted ? rawQty : Math.min(QTY_CAP, rawQty);
      const line: CartLine = {
        variantId: variant.id,
        productId: product.id,
        title: product.title,
        variant,
        quantity: qty,
        capLifted,
        image: variant.image ?? product.image ?? null,
      };
      const lines = prior
        ? existing.map((l) => (l.variantId === variant.id ? line : l))
        : [...existing, line];
      await syncGroup({ seller, lines, cart: group?.cart ?? null, state: 'pending' });
    },
    [syncGroup],
  );

  const mutateLine = useCallback(
    async (shopGid: string, variantId: string, mutate: (l: CartLine) => CartLine | null) => {
      const group = stateRef.current.groups[shopGid];
      if (!group) return;
      const lines = group.lines.map((l) => (l.variantId === variantId ? mutate(l) : l)).filter(Boolean) as CartLine[];
      await syncGroup({ ...group, lines });
    },
    [syncGroup],
  );

  const setQty = useCallback(
    (shopGid: string, variantId: string, quantity: number) =>
      mutateLine(shopGid, variantId, (l) => {
        if (quantity <= 0) return null;
        const cap = l.capLifted ? quantity : Math.min(QTY_CAP, quantity);
        return { ...l, quantity: cap };
      }),
    [mutateLine],
  );

  const liftCap = useCallback(
    (shopGid: string, variantId: string) =>
      mutateLine(shopGid, variantId, (l) => ({ ...l, capLifted: true, quantity: l.quantity + 1 })),
    [mutateLine],
  );

  const removeLine = useCallback(
    (shopGid: string, variantId: string) => mutateLine(shopGid, variantId, () => null),
    [mutateLine],
  );

  // Leg 3: hand the merchant's live continue_url to Checkout Kit (embedded popup, else redirect). On a
  // completed order, drop the group locally + clear its persisted lines and raise an "order placed"
  // banner; on Kit error, surface a non-blocking failure notice (the cart is untouched, buyer can retry).
  const checkout = useCallback(
    async (shopGid: string) => {
      const group = stateRef.current.groups[shopGid];
      if (!group?.cart?.continueUrl) return;
      const { id, name, domain } = group.seller;
      await openCheckout(group.cart.continueUrl, toCheckoutPrefill(buyerInfo), {
        onComplete: () => {
          dispatch({ type: 'checkoutComplete', shopGid: id, shopName: name });
          void removeMerchantCart({ boardId, shopDomain: domain }).catch(() => {});
        },
        onError: () => dispatch({ type: 'checkoutFailed', shopName: name, message: 'checkout error' }),
      });
    },
    [boardId, buyerInfo],
  );

  const clearNotice = useCallback(() => dispatch({ type: 'clearNotice' }), []);

  const value = useMemo(
    () => ({
      state,
      shoppingEnabled,
      setShoppingEnabled,
      resolve,
      dismiss,
      own,
      addVariant,
      setQty,
      liftCap,
      removeLine,
      checkout,
      clearNotice,
    }),
    [
      state,
      shoppingEnabled,
      setShoppingEnabled,
      resolve,
      dismiss,
      own,
      addVariant,
      setQty,
      liftCap,
      removeLine,
      checkout,
      clearNotice,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCommerce(): CommerceContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCommerce must be used within CommerceProvider');
  return ctx;
}

// exported for the cart badge (avoids importing the store module in components)
export { cartCount, variantSummary };
