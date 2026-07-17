// Pure price + variant helpers shared by the recommendation cards, cart lines, and PDP overlay.
import type { Product, Variant } from '../types';

// "from $44" when a product spans a price range, else the single formatted price, else "".
export function priceLabel(p: Product): string {
  if (p.priceRange && p.priceRange.min.amount !== p.priceRange.max.amount) {
    return `from ${p.priceRange.min.formatted}`;
  }
  return p.price?.formatted ?? p.priceRange?.min.formatted ?? '';
}

export type Selection = Record<string, string>; // option name → chosen value label

// First value that exists+available per option — the overlay's opening selection.
export function defaultSelection(p: Product): Selection {
  const sel: Selection = {};
  for (const opt of p.options) {
    const first = opt.values.find((v) => v.exists && v.available) ?? opt.values.find((v) => v.exists);
    if (first) sel[opt.name] = first.label;
  }
  return sel;
}

// Every option has a chosen value (mockup `gate()`) — doesn't check the matched variant is in
// stock; see isAddable for the full Add-to-cart gate.
export function isComplete(p: Product, sel: Selection): boolean {
  return p.options.every((opt) => Boolean(sel[opt.name]));
}

// The variant whose option labels match the current selection (order-independent).
export function findVariant(p: Product, sel: Selection): Variant | null {
  return (
    p.variants.find((v) =>
      v.options.every((o) => sel[o.name] === undefined || sel[o.name] === o.label),
    ) ?? null
  );
}

// Add is allowed only once every option is chosen AND the resulting variant is actually in stock —
// a fully-chosen combination can still resolve to an unavailable variant (e.g. every value was
// individually available in isolation, but not together).
export function isAddable(p: Product, sel: Selection): boolean {
  if (!isComplete(p, sel)) return false;
  const v = findVariant(p, sel);
  return Boolean(v?.available);
}

// Price to show for the current selection: the matched variant's price, else the product label.
export function selectionPriceLabel(p: Product, sel: Selection): string {
  const v = findVariant(p, sel);
  return v?.price?.formatted ?? priceLabel(p);
}

// Option labels a single-variant catalog fills with placeholder noise — never worth showing.
const NOISE = new Set(['Default Title', 'Title', 'default title', '']);

// Human variant summary for a cart line, e.g. "Size M · Charcoal". Drops single-variant placeholder
// options ("Default Title"); falls back to the variant's own title, else empty (caller hides the row).
export function variantSummary(v: Variant): string {
  const parts = v.options.map((o) => o.label?.trim()).filter((l): l is string => Boolean(l) && !NOISE.has(l));
  if (parts.length) return parts.join(' · ');
  const t = v.title?.trim();
  return t && !NOISE.has(t) ? t : '';
}

// Format minor-unit money (cents) in a currency, for client-side subtotal fallbacks.
export function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}
