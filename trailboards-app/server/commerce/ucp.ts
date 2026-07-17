// Server-side client for the global commerce catalog over UCP (Universal Commerce Protocol).
// Adapted directly from scout/src/commerce/ucp.ts — identical on all branches, attendees never
// edit it. Two changes vs scout, both from R5 (DESIGN.md normalizer gaps):
//   1. toProduct captures per-option-value `available` + `exists` (PDP grey-out).
//   2. toProduct captures per-variant `seller` {name,id,domain} (cart accordion key), not just [0].
//
// The catalog is a public, MCP-compatible JSON-RPC endpoint. Every call identifies the agent by a
// publicly-reachable profile URL (meta.ucp-agent.profile). No access token is required for global
// catalog search/lookup. Prices come back in MINOR units (cents); we format once, here.
import type { Product, Variant, ProductOption, Money } from '../../src/types.js';
import { record } from '../trace.js';

const CATALOG_URL = (process.env.UCP_CATALOG_URL ?? 'https://catalog.shopify.com/api/ucp/mcp').trim();
const AGENT_PROFILE = (
  process.env.UCP_AGENT_PROFILE ??
  'https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json'
).trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Search inputs ──────────────────────────────────────────────────────────────
// `query` (text) and `like` (a photo or reference product) are mutually exclusive modes.
export type Like = { id: string } | { image: { content_type: string; data: string } };

// Mirrors the live search_catalog filters schema. `attributes` are Shopify taxonomy filters —
// supported names include "Target gender", "Size", "Color".
export interface CatalogFilters {
  available?: boolean;
  price?: { min?: number; max?: number }; // minor units (cents)
  category?: string;
  ships_to?: { country: string; region?: string; postal_code?: string };
  shop_ids?: string[];
  attributes?: { name: string; values: string[] }[]; // AND across entries, OR within
  condition?: string[]; // 'new' | 'secondhand'
  rating?: { variant?: { min?: number; min_count?: number } };
}

export interface SearchInput {
  query?: string;
  like?: Like[];
  filters?: CatalogFilters;
  limit?: number;
  cursor?: string;
}

// ─── Money helpers ──────────────────────────────────────────────────────────────
function money(raw: { amount?: number; currency?: string } | null | undefined): Money | null {
  if (!raw || typeof raw.amount !== 'number') return null;
  const currency = raw.currency || 'USD';
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(raw.amount / 100);
  } catch {
    formatted = `${(raw.amount / 100).toFixed(2)} ${currency}`;
  }
  return { amount: raw.amount, currency, formatted };
}

// media arrays (product- or variant-level) → clean list of image URLs, in order.
function mediaUrls(media: unknown): string[] {
  if (!Array.isArray(media)) return [];
  return media.map((m: any) => (typeof m?.url === 'string' ? m.url : null)).filter((u): u is string => Boolean(u));
}

// top_features / tech_specs arrive as newline-joined strings; split into clean lines.
function lines(text: unknown): string[] {
  if (typeof text !== 'string') return [];
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// Derive product-level options from the variants when the catalog omits a top-level `options`
// array. Distinct labels per option name, in first-seen order; a value is `available` if any
// variant carrying it is available. The Shopify single-variant default ("Title" / "Default Title")
// is treated as no options at all.
function optionsFromVariants(variants: Variant[]): ProductOption[] {
  const order: string[] = [];
  const byName = new Map<string, Map<string, boolean>>();
  for (const v of variants) {
    for (const o of v.options) {
      if (!o.name || o.name === 'Title' || o.label === 'Default Title') continue;
      if (!byName.has(o.name)) {
        byName.set(o.name, new Map());
        order.push(o.name);
      }
      const vals = byName.get(o.name)!;
      vals.set(o.label, (vals.get(o.label) ?? false) || v.available);
    }
  }
  return order.map((name) => ({
    name,
    values: [...byName.get(name)!.entries()].map(([label, available]) => ({ label, available, exists: true })),
  }));
}

// ─── Normalizer (R5-extended) ─────────────────────────────────────────────────────
export function toProduct(raw: any): Product {
  const variants: Variant[] = Array.isArray(raw?.variants)
    ? raw.variants.map((v: any) => ({
        id: String(v?.id ?? ''),
        title: String(v?.title ?? raw?.title ?? ''),
        options: Array.isArray(v?.options)
          ? v.options.map((o: any) => ({ name: String(o?.name ?? ''), label: String(o?.label ?? '') }))
          : [],
        price: money(v?.price),
        available: Boolean(v?.availability?.available),
        url: v?.url ?? null,
        image: mediaUrls(v?.media)[0] ?? null,
        // R5: per-variant seller (was raw.variants[0].seller only), incl. storefront + policy links
        seller: v?.seller
          ? {
              name: String(v.seller.name ?? ''),
              id: String(v.seller.id ?? ''),
              domain: String(v.seller.domain ?? ''),
              url: v.seller.url ?? null,
              links: Array.isArray(v.seller.links)
                ? v.seller.links
                    .filter((l: any) => l?.type && l?.url)
                    .map((l: any) => ({ type: String(l.type), url: String(l.url) }))
                : [],
            }
          : null,
      }))
    : [];

  const first = variants[0];
  const meta = raw?.metadata ?? {};
  const highlights = [
    ...(Array.isArray(meta.unique_selling_points) ? meta.unique_selling_points.map(String) : []),
    ...lines(meta.top_features),
  ];

  // R5: per-option-value available/exists (was values.map(label) only)
  const rawOptions: ProductOption[] = Array.isArray(raw?.options)
    ? raw.options.map((o: any) => ({
        name: String(o?.name ?? ''),
        values: Array.isArray(o?.values)
          ? o.values.map((val: any) => ({
              label: String(val?.label ?? val),
              available: val?.available !== false, // default true when absent
              exists: val?.exists !== false,
            }))
          : [],
      }))
    : [];
  // Some catalog entries expose options only on their variants (no top-level `options`), which
  // makes the PDP show options for a beat and then blank once get_product replaces the search
  // result. Derive them from the variants so option chips stay put. The Shopify default
  // single-variant marker ("Title" / "Default Title") is skipped — that's a no-option product.
  const options = rawOptions.some((o) => o.values.length) ? rawOptions : optionsFromVariants(variants);

  // Gallery = product media first, then any variant image not already in that list. Deduped, ordered.
  const images: string[] = [];
  const seenImg = new Set<string>();
  for (const u of [...mediaUrls(raw?.media), ...variants.map((v) => v.image)]) {
    if (u && !seenImg.has(u)) {
      seenImg.add(u);
      images.push(u);
    }
  }

  return {
    id: String(raw?.id ?? ''),
    title: String(raw?.title ?? ''),
    description: String(raw?.description?.plain ?? raw?.description ?? ''),
    image: images[0] ?? null,
    images,
    rating: raw?.rating ? { value: Number(raw.rating.value) || 0, count: Number(raw.rating.count) || 0 } : null,
    price: money(raw?.price_range?.min) ?? first?.price ?? null,
    priceRange: raw?.price_range
      ? (() => {
          const min = money(raw.price_range.min);
          const max = money(raw.price_range.max);
          return min && max ? { min, max } : null;
        })()
      : null,
    url: first?.url ?? null,
    checkoutUrl: raw?.variants?.[0]?.checkout_url ?? null,
    seller: raw?.variants?.[0]?.seller
      ? { name: String(raw.variants[0].seller.name ?? ''), domain: String(raw.variants[0].seller.domain ?? '') }
      : null,
    options,
    highlights,
    specs: typeof meta.tech_specs === 'string' ? meta.tech_specs : null,
    variants,
  };
}

// ─── JSON-RPC transport ─────────────────────────────────────────────────────────
// Public entry: time the whole logical call (retries included) and record it to the trace,
// then re-throw so callers see the same errors as before. The raw recursive fetch is below.
export async function callTool(name: string, catalog: Record<string, unknown>): Promise<any> {
  const t0 = Date.now();
  try {
    const out = await callToolRaw(name, catalog);
    record({ tool: name, backend: 'catalog', request: catalog, response: out, status: 'ok', latencyMs: Date.now() - t0 });
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    record({ tool: name, backend: 'catalog', request: catalog, response: { error: msg }, status: 'error', latencyMs: Date.now() - t0 });
    throw err;
  }
}

async function callToolRaw(name: string, catalog: Record<string, unknown>, attempt = 0): Promise<any> {
  const res = await fetch(CATALOG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: { meta: { 'ucp-agent': { profile: AGENT_PROFILE } }, catalog } },
    }),
  });

  if (!res.ok) {
    if (res.status >= 500 && attempt < 2) {
      await sleep(400 * (attempt + 1));
      return callToolRaw(name, catalog, attempt + 1);
    }
    throw new Error(`catalog ${name} failed: HTTP ${res.status}`);
  }

  const json: any = await res.json();
  if (json.error) throw new Error(`catalog ${name} error: ${json.error.message ?? 'unknown'}`);

  const result = json.result;
  if (result?.isError) {
    const msg = result.content?.map((c: any) => c?.text).filter(Boolean).join(' ') || 'tool error';
    if (/service error|try again/i.test(msg) && attempt < 2) {
      await sleep(400 * (attempt + 1));
      return callToolRaw(name, catalog, attempt + 1);
    }
    throw new Error(`catalog ${name} error: ${msg}`);
  }

  return result?.structuredContent;
}

// Per-merchant transport for cart ops. Cart lives on the merchant's own endpoint
// (https://{shop}/api/ucp/mcp), not the global catalog. Keyless like catalog search — the only
// extra requirement is a non-empty Shopify-Buyer-IP header (missing → 422); loopback is accepted.
// `args` is the full JSON-RPC arguments object (meta + cart), passed through as-is.
export async function callMerchant(
  shopDomain: string,
  name: string,
  args: Record<string, unknown>,
  buyerIp?: string,
): Promise<any> {
  const t0 = Date.now();
  try {
    const out = await callMerchantRaw(shopDomain, name, args, buyerIp);
    record({ tool: name, backend: 'merchant', request: { shopDomain, ...args }, response: out, status: 'ok', latencyMs: Date.now() - t0 });
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    record({ tool: name, backend: 'merchant', request: { shopDomain, ...args }, response: { error: msg }, status: 'error', latencyMs: Date.now() - t0 });
    throw err;
  }
}

async function callMerchantRaw(
  shopDomain: string,
  name: string,
  args: Record<string, unknown>,
  buyerIp?: string,
  attempt = 0,
): Promise<any> {
  const res = await fetch(`https://${shopDomain}/api/ucp/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Shopify-Buyer-IP': buyerIp || '127.0.0.1',
      'User-Agent': 'trailboards/0.1',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } }),
  });

  if (!res.ok) {
    if (res.status >= 500 && attempt < 2) {
      await sleep(400 * (attempt + 1));
      return callMerchantRaw(shopDomain, name, args, buyerIp, attempt + 1);
    }
    throw new Error(`cart ${name} failed: HTTP ${res.status}`);
  }

  const json: any = await res.json();
  if (json.error) throw new Error(`cart ${name} error: ${json.error.message ?? 'unknown'}`);

  const result = json.result;
  if (result?.isError) {
    const msg = result.content?.map((c: any) => c?.text).filter(Boolean).join(' ') || 'tool error';
    if (/service error|try again/i.test(msg) && attempt < 2) {
      await sleep(400 * (attempt + 1));
      return callMerchantRaw(shopDomain, name, args, buyerIp, attempt + 1);
    }
    throw new Error(`cart ${name} error: ${msg}`);
  }

  // structuredContent when present; some merchant tools return content[0].text as a JSON string.
  let content = result?.structuredContent ?? result?.content?.[0]?.text;
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
    } catch {
      /* leave as-is */
    }
  }
  return content;
}

export const catalogConfig = { url: CATALOG_URL, profile: AGENT_PROFILE };
export type { Product, Variant, Cart, ProductOption, Seller, Money } from '../../src/types.js';
