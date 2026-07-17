// Checkout hand-off (Leg 3, LLD §5). Presents Shopify's hosted checkout via the web Checkout Kit
// popup when it's available, else falls back to opening the real `continue_url` in a new tab. Either
// path lands the buyer on a genuine Shopify checkout — the component just makes it feel embedded and
// lets us react to completion. Checkout Kit is alpha; we import it by a *variable* specifier so the
// build never hard-depends on it (keeps deps identical across the four workshop branches).

export interface CheckoutHandlers {
  onComplete?: (detail: { order?: unknown }) => void;
  onClose?: () => void;
  onError?: (detail: { error?: unknown }) => void;
}

export type CheckoutPath = 'kit' | 'redirect' | 'none';

// Flat buyer prefill (email + shipping address) appended to the checkout permalink.
export type CheckoutPrefill = Partial<
  Record<
    'email' | 'first_name' | 'last_name' | 'address1' | 'address2' | 'city' | 'province' | 'country' | 'zip',
    string
  >
>;

const KIT_MODULE = '@shopify/checkout-kit'; // variable specifier → not resolved at build time

let element: (HTMLElement & { target?: string; src?: string; open?: () => void }) | null = null;
let loading: Promise<unknown> | null = null;
let current: CheckoutHandlers = {};

// Import the Checkout Kit module (registers <shopify-checkout>) exactly once. true when defined.
async function ensureComponent(): Promise<boolean> {
  if (customElements.get('shopify-checkout')) return true;
  if (!loading) loading = import(/* @vite-ignore */ KIT_MODULE).catch(() => null);
  await loading;
  return Boolean(customElements.get('shopify-checkout'));
}

// Checkout URLs are Shopify permalinks; unknown query params are ignored, so buyer prefill is safe.
export function prefillUrl(url: string, prefill?: CheckoutPrefill): string {
  if (!url || !prefill || !Object.keys(prefill).length) return url;
  try {
    const u = new URL(url);
    const map: Record<string, string> = {
      email: 'checkout[email]',
      first_name: 'checkout[shipping_address][first_name]',
      last_name: 'checkout[shipping_address][last_name]',
      address1: 'checkout[shipping_address][address1]',
      address2: 'checkout[shipping_address][address2]',
      city: 'checkout[shipping_address][city]',
      province: 'checkout[shipping_address][province]',
      country: 'checkout[shipping_address][country]',
      zip: 'checkout[shipping_address][zip]',
    };
    for (const [key, param] of Object.entries(map)) {
      const v = prefill[key as keyof CheckoutPrefill];
      if (v) u.searchParams.set(param, v);
    }
    return u.toString();
  } catch {
    return url; // malformed URL — hand it back untouched
  }
}

function fallbackRedirect(url: string): void {
  window.open(url, '_blank', 'noopener');
}

// Present checkout for one continue_url. Returns which path ran so the caller can react.
export async function openCheckout(
  url: string | null,
  prefill?: CheckoutPrefill,
  handlers: CheckoutHandlers = {},
): Promise<CheckoutPath> {
  if (!url) return 'none';
  const target = prefillUrl(url, prefill);

  const ok = await ensureComponent();
  if (!ok) {
    fallbackRedirect(target);
    return 'redirect';
  }

  if (!element) {
    element = document.createElement('shopify-checkout');
    element.target = 'popup';
    element.addEventListener('ec.complete', (e) => current.onComplete?.((e as CustomEvent).detail ?? {}));
    element.addEventListener('ec.close', () => current.onClose?.());
    element.addEventListener('ec.error', (e) => current.onError?.((e as CustomEvent).detail ?? {}));
    document.body.appendChild(element);
  }
  current = handlers;
  element.src = target;
  element.open?.();
  return 'kit';
}
