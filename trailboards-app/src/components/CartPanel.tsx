// Right panel — the commerce surface. Two tabs over one collapsible aside: Recommendations (live
// resolveIntent output, each a RecommendationCard → PDP overlay) and Cart (per-merchant accordions with
// live Shopify totals). The collapsed rail shows a pulsing dot whenever the agent is mid-call and a
// count of what's staged. All the async rules live in CommerceProvider; this is presentation + local UI.
import { useMemo, useState } from 'react';
import type { Product } from '../types';
import { useCommerce, cartCount } from '../store/CommerceProvider';
import { RecommendationCard } from './RecommendationCard';
import { MerchantCart } from './MerchantCart';
import { PdpOverlay } from './PdpOverlay';
import { NudgeBanner, NeedsInputCard } from './AgentNudge';
import { SearchPanel } from './SearchPanel';

export function CartPanel() {
  const { state, resolve: _resolve, dismiss, own, addVariant, setQty, liftCap, removeLine, checkout, clearNotice } =
    useCommerce();
  const [collapsed, setCollapsed] = useState(true);
  const [tab, setTab] = useState<'recs' | 'cart' | 'search'>('recs');
  const [pdp, setPdp] = useState<Product | null>(null);
  const [dismissedNudge, setDismissedNudge] = useState<string | null>(null);

  const recs = useMemo(
    () => state.recs.filter((r) => !state.dismissed.includes(r.product.id)),
    [state.recs, state.dismissed],
  );
  const groups = Object.values(state.groups);
  const count = cartCount(state);

  const pending = state.status === 'resolving' || groups.some((g) => g.state === 'pending');
  const errored = groups.some((g) => g.state === 'error');

  // provenance + owned flag for the open PDP product
  const pdpReasons = pdp ? (state.recs.find((r) => r.product.id === pdp.id)?.reasons ?? []) : [];
  const pdpOwned = pdp ? pdp.variants.some((v) => state.owned.includes(v.id)) : false;

  const railClass = errored ? 'rdot err' : pending ? 'rdot live' : 'rdot';
  const cartClass = `cart${collapsed ? ' collapsed' : ''}${tab === 'cart' ? ' tab-cart' : ''}${tab === 'search' ? ' tab-search' : ''}`;

  // Collapsed rail number: real cart count when the cart has lines, else how many picks are waiting on
  // the Recommendations tab (styled `.picks` in magenta so a non-zero count over an empty cart reads as
  // "recommendations to review", not "0 items"). Tooltip spells it out for either case.
  const railCount = count > 0 ? count : recs.length;
  const railIsPicks = count === 0 && recs.length > 0;
  const railTitle =
    count > 0 ? `${count} in cart` : recs.length > 0 ? `${recs.length} recommendation${recs.length > 1 ? 's' : ''} to review` : 'nothing yet';

  return (
    <>
      <aside className={cartClass}>
        <div
          className="cart-rail"
          role="button"
          tabIndex={0}
          aria-label="Expand cart"
          onClick={() => setCollapsed(false)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setCollapsed(false)}
        >
          <span className={railClass} />
          <span className="rlabel">Shop</span>
          <span
            className={`rcount${errored ? ' err' : ''}${railIsPicks ? ' picks' : ''}`}
            title={railTitle}
          >
            {railCount}
          </span>
        </div>

        <div className="cart-full">
          <div className="cart-head">
            <div className="ptabs">
              <button
                type="button"
                className={tab === 'recs' ? 'ptab-btn on' : 'ptab-btn'}
                onClick={() => setTab('recs')}
              >
                Recommendations
                {recs.length > 0 && <span className="tb-badge">{recs.length}</span>}
              </button>
              <button
                type="button"
                className={tab === 'search' ? 'ptab-btn on' : 'ptab-btn'}
                onClick={() => setTab('search')}
              >
                Search
              </button>
              <button
                type="button"
                className={tab === 'cart' ? 'ptab-btn on' : 'ptab-btn'}
                onClick={() => setTab('cart')}
              >
                Cart
                {count > 0 && <span className="tb-badge">{count}</span>}
              </button>
            </div>
            <button type="button" className="collapse-btn" aria-label="Collapse cart" onClick={() => setCollapsed(true)}>
              <svg viewBox="0 0 24 24">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>

          {state.notice && (
            <div className={`co-notice ${state.notice.kind}`} role="status">
              <svg viewBox="0 0 24 24">
                {state.notice.kind === 'ok' ? (
                  <path d="M20 6L9 17l-5-5" />
                ) : (
                  <>
                    <path d="M12 8v5M12 16h.01" />
                    <circle cx="12" cy="12" r="9" />
                  </>
                )}
              </svg>
              <span>{state.notice.text}</span>
              <button type="button" className="co-x" aria-label="Dismiss" onClick={clearNotice}>
                <svg viewBox="0 0 24 24">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}

          {/* Recommendations */}
          <div className="pane pane-recs">
            {state.clarify && <NeedsInputCard question={state.clarify} />}
            {state.nudge && state.nudge !== dismissedNudge && (
              <NudgeBanner text={state.nudge} onDismiss={() => setDismissedNudge(state.nudge ?? null)} />
            )}
            {recs.length > 0 ? (
              <div className="items">
                {recs.map((rec) => (
                  <RecommendationCard key={rec.product.id} rec={rec} onChoose={setPdp} onDismiss={dismiss} />
                ))}
              </div>
            ) : state.clarify ? null : (
              <div className="empty">
                <p>
                  {state.status === 'resolving'
                    ? 'Reading your board…'
                    : state.status === 'error'
                      ? `Couldn’t reach the catalog — ${state.error ?? 'try again'}.`
                      : 'Add stays, hikes and notes — matched gear appears here from the live catalog.'}
                </p>
              </div>
            )}
          </div>

          {/* Cart */}
          <div className="pane pane-cart">
            {groups.length > 0 ? (
              <>
                <div className="cart-note">
                  Each merchant is its own <b>create_cart</b> — subtotals stream live from Shopify <b>totals[]</b>, and{' '}
                  <b>Checkout</b> opens the real <b>continue_url</b>.
                </div>
                <div className="mcarts">
                  {groups.map((g) => (
                    <MerchantCart
                      key={g.seller.id}
                      group={g}
                      onSetQty={(variantId, q) => setQty(g.seller.id, variantId, q)}
                      onLiftCap={(variantId) => liftCap(g.seller.id, variantId)}
                      onRemove={(variantId) => removeLine(g.seller.id, variantId)}
                      onCheckout={() => checkout(g.seller.id)}
                      onRetry={() => {
                        const first = g.lines[0];
                        if (first) setQty(g.seller.id, first.variantId, first.quantity);
                      }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="empty">
                <p>Nothing staged yet. Choose options on a recommendation to add it here.</p>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="pane pane-search">
            <SearchPanel onChoose={setPdp} />
          </div>
        </div>
      </aside>

      {pdp && (
        <PdpOverlay
          product={pdp}
          reasons={pdpReasons}
          owned={pdpOwned}
          onClose={() => setPdp(null)}
          onAdd={(product, variant) => {
            addVariant(product, variant, 1);
            setPdp(null);
            setTab('cart');
            setCollapsed(false);
          }}
          onOwn={(variantId) => {
            own(variantId);
            setPdp(null);
          }}
        />
      )}
    </>
  );
}
