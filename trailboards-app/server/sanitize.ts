// Boundary guards for untrusted client input (lifted from scout/src/server.ts 39–58).
// Nothing the browser sends about buyer identity is trusted: whitelist keys, coerce to
// trimmed strings, cap length. Returns undefined when nothing usable survives so we never
// forward an empty object upstream.

export type CartBuyer = Partial<
  Record<'first_name' | 'last_name' | 'email' | 'phone_number', string>
>;
export type CartContext = Partial<
  Record<'address_country' | 'address_region' | 'postal_code', string>
>;

function pickStrings<T extends string>(
  raw: unknown,
  keys: readonly T[],
): Partial<Record<T, string>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const out: Partial<Record<T, string>> = {};
  for (const key of keys) {
    const v = src[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, 256);
  }
  return Object.keys(out).length ? out : undefined;
}

const BUYER_KEYS = ['first_name', 'last_name', 'email', 'phone_number'] as const;
const CONTEXT_KEYS = ['address_country', 'address_region', 'postal_code'] as const;

export function sanitizeBuyer(raw: unknown): CartBuyer | undefined {
  return pickStrings(raw, BUYER_KEYS);
}
export function sanitizeContext(raw: unknown): CartContext | undefined {
  return pickStrings(raw, CONTEXT_KEYS);
}

// shopDomain decides which host we POST the cart to — pin it to *.myshopify.com (anti-SSRF).
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
export function isValidShopDomain(shopDomain: unknown): shopDomain is string {
  return typeof shopDomain === 'string' && SHOP_DOMAIN.test(shopDomain);
}

// Client-generated board ids reach the store via path segments — pin the shape.
const ID_SHAPE = /^[a-z0-9-]{6,64}$/i;
export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && ID_SHAPE.test(id);
}

// Behind a proxy this is the real buyer; locally it's loopback (accepted by the endpoint).
export function buyerIpFrom(fwd: unknown, remote?: string): string {
  const first = typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : '';
  return first || remote || '127.0.0.1';
}
