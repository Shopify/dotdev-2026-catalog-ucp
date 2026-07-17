// The commerce connector — the file attendees edit for Parts 1 & 2 (LLD §5). It composes catalog
// and cart arguments, calls the provided UCP transport, and normalizes the result. resolveIntent
// (§7) is the provided orchestration: agent for guidance (getIntent), APIs for truth (searchCatalog),
// deterministic ranking + attributable reasons. On early branches the two leg bodies are replaced
// by the stubs in §13; everything else is identical across branches.
import { callTool, callMerchant, toProduct, catalogConfig, type SearchInput, type CatalogFilters } from './ucp.js';
import { getIntent, type IntentResult } from '../agent/intent.js';
import { record } from '../trace.js';
import { weatherTerms, type WxLike } from '../../src/lib/weatherRules.js';
import type {
  Product,
  Cart,
  Factor,
  TrailboardContext,
  Recommendation,
  RecommendationSet,
} from '../../src/types.js';

// Buyer identity + localization the cart accepts (personalizes estimates, pre-fills checkout).
export interface CartBuyer {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
}
export interface CartContext {
  address_country?: string;
  address_region?: string;
  postal_code?: string;
}

// ── PART 1 (Leg 1) — attendee writes this body ──────────────────
export async function searchCatalog(input: SearchInput): Promise<{ products: Product[]; cursor: string | null }> {
  const limit = input.limit ?? 6;
  const catalog: Record<string, unknown> = {};
  if (input.like?.length) catalog.like = input.like; // like wins; query + like are exclusive
  else if (input.query) catalog.query = input.query;
  if (input.filters) catalog.filters = input.filters;
  catalog.pagination = input.cursor ? { limit, cursor: input.cursor } : { limit };

  const sc = await callTool('search_catalog', catalog);
  const products = (Array.isArray(sc?.products) ? sc.products : []).slice(0, limit).map(toProduct);
  return { products, cursor: sc?.pagination?.cursor ?? null };
}

// ── PART 2 (Leg 2) — attendee writes this body ──────────────────
export async function createCart(
  shopDomain: string,
  lineItems: { variantId: string; quantity: number }[],
  buyerIp?: string,
  buyer?: CartBuyer,
  context?: CartContext,
): Promise<Cart> {
  const line_items = lineItems.map((li) => ({
    item: { id: li.variantId.startsWith('gid://') ? li.variantId : `gid://shopify/ProductVariant/${li.variantId}` },
    quantity: li.quantity ?? 1,
  }));
  const cart: Record<string, unknown> = { line_items };
  if (buyer && Object.keys(buyer).length) cart.buyer = buyer;
  if (context && Object.keys(context).length) cart.context = context;

  const sc = await callMerchant(
    shopDomain,
    'create_cart',
    { meta: { 'ucp-agent': { profile: catalogConfig.profile } }, cart },
    buyerIp,
  );
  return normalizeCart(shopDomain, sc?.cart ?? sc ?? {});
}

// ── PROVIDED (all branches) ─────────────────────────────────────
export async function getProduct(id: string, selected?: { name: string; label: string }[]): Promise<Product | null> {
  const catalog: Record<string, unknown> = { id };
  if (selected?.length) catalog.selected = selected;
  const sc = await callTool('get_product', catalog);
  return sc?.product ? toProduct(sc.product) : null;
}

export async function lookupCatalog(ids: string[]): Promise<Product[]> {
  if (!ids.length) return [];
  const sc = await callTool('lookup_catalog', { ids: ids.slice(0, 50) });
  return (Array.isArray(sc?.products) ? sc.products : []).map(toProduct);
}

// ── Orchestration (provided, LLD §7) ────────────────────────────
export async function resolveIntent(ctx: TrailboardContext): Promise<RecommendationSet> {
  const intent = await getIntent(ctx);
  const ships = resolveShipsTo(ctx);
  const filters = buildFilters(ctx, ships);
  const wx = dayWeather(ctx);
  const terms = weatherTerms(wx);
  const base = [intent.query, ...terms].filter(Boolean).join(' ').trim();

  // Image present, but only treated as a visual-search seed when the agent didn't classify it as a
  // scene/landmark photo (query and like[] are mutually exclusive catalog modes — ucp.ts) — a scene
  // photo instead informs `intent.query` via contextDigest, so its content still shapes the text search.
  const hasImage = ctx.images.length > 0;
  const usedImage = hasImage && intent.imageRole !== 'scene';
  const search: SearchInput = usedImage
    ? { like: [{ image: { content_type: ctx.images[0].contentType, data: ctx.images[0].data } }], filters, limit: 6 }
    : { query: base, filters, limit: 6 };

  // Trace the intent step (agent-for-guidance) BEFORE the catalog call it drives, so the drawer reads
  // top-down: context → intent → search. Shows exactly what query/filters are being fired and whether
  // the model (or the deterministic stub) produced them.
  recordIntent(ctx, intent, terms, base, usedImage, filters);

  const { products, cursor } = await searchCatalog(search);

  const fresh = products.filter(
    (p) => !ctx.recommendedIds.includes(p.id) && !p.variants.some((v) => ctx.owned.includes(v.id)),
  );
  const ranked = rerankByWeatherFit(fresh, terms);

  const items: Recommendation[] = [];
  for (const p of ranked) {
    const reasons = attributeReasons(p, ctx, terms, usedImage, ships);
    if (!reasons.length) continue; // traceability: never recommend what we can't explain
    items.push({ product: p, confidence: scoreConfidence(p, reasons), reasons });
  }

  return {
    boardId: ctx.boardId,
    items,
    nudge: intent.nudge,
    clarify: intent.clarify,
    needsInput: intent.needsInput,
    status: items.length ? 'ok' : 'empty',
    cursor,
  };
}

// ── Helpers (provided) ──────────────────────────────────────────

// Record the intent-resolution step to the trace as an 'agent' call: the board signals it read, and
// the shopping intent it produced (the actual query/filters that get fired at the catalog next). A
// fallback (model errored) is flagged with status 'error' + the reason, so a misconfigured key shows
// up here rather than only in the server log.
function recordIntent(
  ctx: TrailboardContext,
  intent: IntentResult,
  terms: string[],
  base: string,
  usedImage: boolean,
  filters: CatalogFilters,
): void {
  const image = ctx.images[0];
  const request = {
    destination: ctx.destination?.name ?? null,
    dateRange: ctx.dateRange ?? null,
    activities: ctx.activities,
    transport: ctx.transport,
    notes: ctx.notes,
    travelers: ctx.travelers.length,
    weather: [...new Set(ctx.days.map((d) => d.weather?.label).filter(Boolean))],
    hasImage: Boolean(image),
    owned: ctx.owned.length,
  };
  const response = {
    source: intent.source, // 'agent' | 'stub' | 'fallback'
    error: intent.error,
    mode: usedImage ? 'image (like[])' : image ? 'scene (text)' : 'text',
    imageCaption: image?.description || null,
    imageRole: intent.imageRole ?? null,
    intentQuery: intent.query,
    weatherTerms: terms,
    searchQuery: usedImage ? null : base,
    filters,
    nudge: intent.nudge ?? null,
    clarify: intent.clarify ?? null,
  };
  record({
    tool: 'resolve_intent',
    backend: 'agent',
    request,
    response,
    status: intent.error ? 'error' : 'ok',
    latencyMs: intent.latencyMs,
  });
}

// Ships-to source of truth: the account's home address wins by default — most gear gets bought
// to pack for the trip, not to receive at the destination. Falls back to the board destination
// only when the profile has no ships-to set.
function resolveShipsTo(ctx: TrailboardContext): { country?: string; source: 'profile' | 'destination' | null } {
  const pf = ctx.profileFilters;
  if (pf?.shipsToCountry) return { country: pf.shipsToCountry, source: 'profile' };
  if (ctx.destination?.country) return { country: ctx.destination.country, source: 'destination' };
  return { source: null };
}

// Board + profile → catalog filters. Weather is folded into the QUERY (rule table), never here.
// Subtlety: gender-ambiguity restraint — if any traveler is 'unspecified', omit Target gender.
function buildFilters(ctx: TrailboardContext, ships: ReturnType<typeof resolveShipsTo>): CatalogFilters {
  const pf = ctx.profileFilters;
  const filters: CatalogFilters = { available: true, condition: pf?.condition ?? ['new'] };

  if (ships.country) filters.ships_to = { country: ships.country };

  if (pf?.priceMaxCents) filters.price = { max: pf.priceMaxCents };
  if (pf?.ratingMin != null) filters.rating = { variant: { min: pf.ratingMin } };

  const attributes: { name: string; values: string[] }[] = [];
  const sizes = distinctSizes(ctx);
  if (sizes.length) attributes.push({ name: 'Size', values: sizes });

  const genders = targetGenders(ctx);
  if (genders.length) attributes.push({ name: 'Target gender', values: genders });

  if (attributes.length) filters.attributes = attributes;
  return filters;
}

function distinctSizes(ctx: TrailboardContext): string[] {
  const set = new Set<string>();
  for (const t of ctx.travelers) {
    for (const v of Object.values(t.sizes ?? {})) if (v) set.add(v);
  }
  return [...set];
}

// Map definite lanes to taxonomy values. Any 'unspecified' traveler → don't guess (omit filter).
function targetGenders(ctx: TrailboardContext): string[] {
  if (!ctx.travelers.length) return [];
  if (ctx.travelers.some((t) => (t.genderLane ?? 'unspecified') === 'unspecified')) return [];
  const set = new Set<string>();
  for (const t of ctx.travelers) {
    if (t.genderLane === 'mens') set.add('Male');
    else if (t.genderLane === 'womens') set.add('Female');
  }
  return [...set];
}

function dayWeather(ctx: TrailboardContext): WxLike[] {
  return ctx.days.map((d) => d.weather).filter((w): w is NonNullable<typeof w> => !!w).map((w) => ({ code: w.code, lo: w.lo }));
}

// Lowercased searchable text for deterministic term matching.
function productText(p: Product): string {
  return [p.title, ...p.highlights, p.specs ?? ''].join(' ').toLowerCase();
}

// Deterministic re-rank: products hitting more weather terms come first (stable for ties).
function rerankByWeatherFit(products: Product[], terms: string[]): Product[] {
  if (!terms.length) return products;
  const fit = (p: Product) => {
    const text = productText(p);
    return terms.reduce((n, t) => (text.includes(t.toLowerCase()) ? n + 1 : n), 0);
  };
  return products
    .map((p, i) => ({ p, i, score: fit(p) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.p);
}

// Attributable factors — the "why" behind every card (§7). An item with none is dropped upstream.
function attributeReasons(
  p: Product,
  ctx: TrailboardContext,
  terms: string[],
  usedImage: boolean,
  ships: ReturnType<typeof resolveShipsTo>,
): Factor[] {
  const reasons: Factor[] = [];
  const text = productText(p);

  const wxHit = terms.find((t) => text.includes(t.toLowerCase()));
  if (wxHit) reasons.push({ kind: 'WEATHER', label: `Rated for ${wxHit} conditions` });

  if (ships.country && p.variants.some((v) => v.available)) {
    if (ships.source === 'profile') {
      const place = ctx.profileFilters?.shipsToLabel ?? 'your saved address';
      reasons.push({ kind: 'PROFILE', label: `Ships to ${place}` });
    } else if (ctx.destination) {
      reasons.push({ kind: 'BOARD', label: `Ships to ${ctx.destination.name}` });
    }
  }
  const activity = ctx.activities.find((a) => {
    const key = a.trim().split(/\s+/)[0]?.toLowerCase();
    return key && key.length > 3 && text.includes(key);
  });
  if (activity) reasons.push({ kind: 'BOARD', label: `Matches your ${activity} plans` });

  const hasSizes = ctx.travelers.some((t) => Object.keys(t.sizes ?? {}).length > 0);
  if (hasSizes && p.options.some((o) => /size/i.test(o.name))) {
    reasons.push({ kind: 'PROFILE', label: 'Sized for your travelers' });
  }

  if (usedImage) reasons.push({ kind: 'IMAGE', label: 'Visually similar to your photo' });

  if (p.rating && p.rating.count > 0) {
    reasons.push({ kind: 'CATALOG', label: `${p.rating.value.toFixed(1)}★ (${p.rating.count})` });
  }

  return reasons;
}

// Confidence rises with STRONG factors (board/weather/profile/image); catalog presence alone stays
// muted (< 0.4) so weak matches never auto-add (§7 confidence-visible rule).
function scoreConfidence(p: Product, reasons: Factor[]): number {
  const strong = reasons.filter((r) => r.kind !== 'CATALOG').length;
  const raw = 0.3 + 0.16 * strong + (p.rating && p.rating.count > 0 ? 0.05 : 0);
  return Math.round(Math.min(0.95, Math.max(0, raw)) * 100) / 100;
}

// Merchant cart → normalized Cart (field names per the UCP create_cart response).
function normalizeCart(shopDomain: string, raw: any): Cart {
  return {
    id: String(raw.id ?? ''),
    shopDomain,
    currency: String(raw.currency ?? 'USD'),
    continueUrl: raw.continue_url ?? null,
    totals: Array.isArray(raw.totals)
      ? raw.totals.map((t: any) => ({ type: String(t?.type ?? ''), amount: Number(t?.amount) || 0, text: String(t?.display_text ?? '') }))
      : [],
    messages: Array.isArray(raw.messages)
      ? raw.messages.map((m: any) => ({ type: String(m?.type ?? ''), code: String(m?.code ?? ''), content: String(m?.content ?? '') }))
      : [],
    expiresAt: raw.expires_at ?? null,
  };
}
