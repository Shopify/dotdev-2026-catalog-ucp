// Shared domain types (LLD §3). Imported by BOTH planes (browser + server).
// Keep dependency-free: no `node:` and no DOM imports.

// ── normalized commerce shapes (from scout ucp.ts) ─────────────
export interface Money {
  amount: number; // minor units (cents)
  currency: string;
  formatted: string;
}

// Merchant policy link (privacy/terms/refund/shipping). `type` is the UCP link kind.
export interface SellerLink {
  type: string;
  url: string;
}

export interface Seller {
  name: string;
  id: string; // Shop GID — the cart accordion grouping key
  domain: string;
  url?: string | null; // merchant storefront
  links?: SellerLink[]; // policy links, shown above Checkout
}

export interface Variant {
  id: string;
  title: string;
  options: { name: string; label: string }[];
  price: Money | null;
  available: boolean;
  url: string | null;
  image: string | null; // variant-specific media, when the catalog carries it
  seller?: Seller | null; // R5: per-variant seller (was product-level only)
}

export interface ProductOption {
  name: string;
  values: { label: string; available: boolean; exists: boolean }[]; // grey-out logic in PDP
}

export interface Product {
  id: string;
  title: string;
  description: string;
  image: string | null; // primary image (first gallery frame) — used by recs + cart lines
  images: string[]; // full product-level gallery, in catalog order
  rating: { value: number; count: number } | null;
  price: Money | null;
  priceRange: { min: Money; max: Money } | null;
  url: string | null;
  checkoutUrl: string | null;
  seller: { name: string; domain: string } | null;
  options: ProductOption[]; // R5: option values carry available/exists
  highlights: string[];
  specs: string | null;
  variants: Variant[];
}

export interface Cart {
  id: string;
  shopDomain: string;
  currency: string;
  continueUrl: string | null;
  totals: { type: string; amount: number; text: string }[];
  messages: { type: string; code: string; content: string }[];
  expiresAt: string | null;
}

// Persisted per-line cart snapshot (LLD §9): enough to rebuild a merchant group on reopen without
// re-fetching product detail. Live totals/continueUrl aren't stored — they're re-materialized by
// replaying create_cart when the board opens (also refreshes price/stock).
export interface CartLineSnapshot {
  seller: Seller;
  productId: string;
  title: string;
  variant: Variant;
  capLifted: boolean;
  image?: string | null; // line thumbnail resolved at add-time (variant media, else product primary)
}

// ── canvas / board (net-new) ───────────────────────────────────
export type ElementType =
  | 'pin'
  | 'day'
  | 'stay'
  | 'activity'
  | 'transport'
  | 'traveler'
  | 'note'
  | 'image';

export interface BoardElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  payload: Record<string, unknown>; // type-specific (LLD §8 discriminants)
  createdAt: string;
}

export interface TripMeta {
  destination?: { name: string; lat: number; lng: number; country?: string };
  dateRange?: { start: string; end: string }; // ISO
}

export type ThemeName = 'field' | 'night' | 'blueprint';

// ── account profile (net-new) ──────────────────────────────────
// Travelers + account-wide shopping defaults. Persisted client-side (localStorage); the defaults
// derive `profileFilters` that fold into every catalog search, before any board exists.
export interface PersonSizes {
  apparel: string;
  shoe: string;
  jacket: string;
  fit: string;
}
export interface ProfilePerson {
  id: string;
  name: string;
  role: string; // 'owner' for you; free label for companions (partner, friend…)
  email?: string; // shown for you
  note?: string; // companion meta line ("travels on most trips")
  you?: boolean; // the account owner — one per profile
  sizes: PersonSizes;
}
export interface ShoppingDefaults {
  currency: string; // 'USD $' — display label
  shipsTo: string; // free text; a leading country name maps to filters.ships_to
  address1: string; // street — checkout prefill only, never sent to the catalog
  city: string; // checkout prefill only
  province: string; // state/province code — checkout prefill + create_cart's address_region
  postalCode: string; // checkout prefill + create_cart's postal_code
  phone: string; // create_cart's buyer.phone_number
  budgetMax: number; // dollars per item → filters.price.max
  units: string; // 'Metric · °C' — app + weather display
  condition: string; // 'New only' | 'New or refurbished' | 'Secondhand ok' → filters.condition
  rating: string; // 'any' | '3★ and up' | … → filters.rating
}
export interface Profile {
  people: ProfilePerson[];
  defaults: ShoppingDefaults;
}

export interface BoardState {
  id: string;
  title: string;
  theme: ThemeName;
  trip: TripMeta;
  elements: BoardElement[];
  demoMode: boolean;
  shoppingEnabled: boolean;
}

export interface BoardMeta {
  id: string;
  title: string;
  trip: TripMeta;
  theme: ThemeName;
  updatedAt: string;
}

// ── context → recommendations (net-new) ────────────────────────
export interface WeatherChip {
  date: string;
  code: number;
  hi: number;
  lo: number;
  label: string;
  typical?: boolean; // true = prior-year normals (date beyond the live forecast horizon), not a forecast
}

export interface Traveler {
  id: string;
  sizes?: Record<string, string>;
  genderLane?: 'mens' | 'womens' | 'unspecified';
}

export interface TrailboardContext {
  boardId: string;
  destination?: TripMeta['destination'];
  dateRange?: TripMeta['dateRange'];
  days: { date: string; weather?: WeatherChip }[];
  activities: string[];
  transport: string[];
  notes: string[];
  travelers: Traveler[];
  images: { id: string; contentType: string; data: string; description: string }[]; // base64 for like[]
  owned: string[]; // variant GIDs marked "already own"
  recommendedIds: string[]; // dedupe guard (product GIDs already shown)
  // Account-wide shopping defaults, pre-derived to catalog primitives (LLD §7). The profile's
  // ships-to country wins over the board destination by default (packing for a trip ships to
  // home, not to the destination) — see resolveShipsTo in connector.ts.
  profileFilters?: {
    shipsToCountry?: string;
    shipsToLabel?: string; // human-readable form of shipsToCountry, for the recommendation reason text
    priceMaxCents?: number;
    condition?: string[];
    ratingMin?: number;
  };
  hash: string; // idempotency key (LLD §8)
}

export type FactorKind = 'BOARD' | 'WEATHER' | 'PROFILE' | 'IMAGE' | 'CATALOG';
export interface Factor {
  kind: FactorKind;
  label: string;
}

export interface Recommendation {
  product: Product;
  reasons: Factor[];
  confidence: number; // 0..1
}

export interface RecommendationSet {
  boardId: string;
  items: Recommendation[];
  nudge?: string; // one gentle, non-interrupting suggestion (agent-authored, guardrail-scrubbed)
  clarify?: string; // a decision to make before sizing/styling — rendered as the needs-input card
  needsInput?: boolean;
  status: 'ok' | 'empty' | 'stub'; // 'stub' = leg not implemented (branch < N)
  cursor: string | null;
}

// One recorded UCP/tool call, streamed to the trace drawer (systems own truth). request/response
// are already capped server-side; over-cap payloads arrive as { truncated: true, bytes }.
export interface AgentCall {
  id: string;
  boardId: string;
  tool: string;
  backend: 'catalog' | 'merchant' | 'weather' | 'agent';
  request: unknown;
  response: unknown;
  status: string;
  latencyMs: number;
  createdAt?: string;
}
