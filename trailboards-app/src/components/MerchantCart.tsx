// One merchant's cart (.mcart accordion). Each group is its own create_cart, so the subtotal, the
// messages[] (e.g. "only 2 left"), and the Checkout continue_url all come straight from Shopify — the
// "universal cart" is just these groups assembled client-side. The qty stepper enforces the subtlety
// cap: + stops at QTY_CAP and the next tap lifts the cap (confirm more) rather than silently stacking.
import type { MerchantGroup } from '../store/commerceStore';
import { QTY_CAP } from '../store/commerceStore';
import { variantSummary, formatMoney } from '../lib/price';

// Merchant policy links (straight from the seller) shown above Checkout, so the buyer sees the real
// store's terms before the Shopify hand-off. Only the four known kinds render, in a fixed order.
const POLICY_LABELS: Record<string, string> = {
  privacy_policy: 'Privacy',
  terms_of_service: 'Terms',
  refund_policy: 'Refunds',
  shipping_policy: 'Shipping',
};
const POLICY_ORDER = Object.keys(POLICY_LABELS);

function policyLinks(seller: MerchantGroup['seller']) {
  return (seller.links ?? [])
    .filter((l) => l.url && POLICY_LABELS[l.type])
    .sort((a, b) => POLICY_ORDER.indexOf(a.type) - POLICY_ORDER.indexOf(b.type));
}

// Subtotal text. Format the merchant's own total (amount is minor units; `text` is a label like
// "Total", never money); then a client sum of line prices (so the buyer always sees a number, not a
// bare "live"); else a pending tick.
function subtotal(group: MerchantGroup): string {
  const totals = group.cart?.totals ?? [];
  const total =
    totals.find((t) => t.type === 'total') ??
    totals.find((t) => t.type === 'subtotal') ??
    totals[totals.length - 1];
  if (total && group.cart) return formatMoney(total.amount, group.cart.currency);
  const priced = group.lines.filter((l) => l.variant.price);
  if (priced.length) {
    const currency = group.cart?.currency ?? priced[0].variant.price!.currency;
    const sum = priced.reduce((n, l) => n + l.variant.price!.amount * l.quantity, 0);
    return formatMoney(sum, currency);
  }
  return group.state === 'pending' ? '…' : '';
}

export function MerchantCart({
  group,
  onSetQty,
  onLiftCap,
  onRemove,
  onCheckout,
  onRetry,
}: {
  group: MerchantGroup;
  onSetQty: (variantId: string, quantity: number) => void;
  onLiftCap: (variantId: string) => void;
  onRemove: (variantId: string) => void;
  onCheckout: () => void;
  onRetry: () => void;
}) {
  const sub = subtotal(group);
  const policies = policyLinks(group.seller);
  const errored = group.state === 'error';
  const pending = group.state === 'pending';

  return (
    <details className="mcart" open>
      <summary>
        <svg className="mcaret" viewBox="0 0 24 24">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="mcart-name">{group.seller.name}</span>
        <span className="mcart-sub">
          {sub}
          {group.state === 'ok' && <span className="live-tick">· live</span>}
        </span>
      </summary>
      <div className="mcart-body">
        {group.lines.map((line) => {
          const atCap = !line.capLifted && line.quantity >= QTY_CAP;
          return (
            <div className="cline" key={line.variantId}>
              <div className="thumb">
                {line.image ? (
                  <img src={line.image} alt="" loading="lazy" />
                ) : (
                  <svg viewBox="0 0 24 24">
                    <path d="M9 2h6v3l1 2v13H8V7l1-2z" />
                    <path d="M8 11h8" />
                  </svg>
                )}
              </div>
              <div className="cline-main">
                <div className="cline-top">
                  <div>
                    <div className="cline-name">{line.title}</div>
                    <div className="cline-var">{variantSummary(line.variant)}</div>
                  </div>
                  <button
                    type="button"
                    className="rm"
                    title="remove"
                    aria-label={`Remove ${line.title}`}
                    onClick={() => onRemove(line.variantId)}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                    </svg>
                  </button>
                </div>
                <div className="cline-bot">
                  <span className="price">{line.variant.price?.formatted ?? ''}</span>
                  <div className="qty">
                    <button type="button" aria-label="Decrease quantity" onClick={() => onSetQty(line.variantId, line.quantity - 1)}>
                      −
                    </button>
                    <span className="n">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={atCap ? 'Confirm more than the cap' : 'Increase quantity'}
                      title={atCap ? `max ${QTY_CAP} — tap to confirm more` : undefined}
                      onClick={() => (atCap ? onLiftCap(line.variantId) : onSetQty(line.variantId, line.quantity + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {group.cart?.messages?.map((m, i) => (
          <div className="mcart-msg" key={`${m.code}-${i}`}>
            <svg viewBox="0 0 24 24">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
            {m.content}
          </div>
        ))}

        {errored ? (
          <>
            <div className="errline">
              <svg viewBox="0 0 24 24">
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
              {group.error ?? 'This merchant’s cart failed to update.'}
            </div>
            <div className="retry">
              <button type="button" className="r1" onClick={onRetry}>
                Retry
              </button>
            </div>
          </>
        ) : (
          <>
            {policies.length > 0 && (
              <div className="mcart-policies">
                {policies.map((l) => (
                  <a key={l.type} href={l.url} target="_blank" rel="noopener noreferrer">
                    {POLICY_LABELS[l.type]}
                  </a>
                ))}
              </div>
            )}
            <button type="button" className="mcart-go" disabled={pending || !group.cart?.continueUrl} onClick={onCheckout}>
              Checkout{sub ? ` · ${sub}` : ''}
              <svg viewBox="0 0 24 24">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </>
        )}
      </div>
    </details>
  );
}
