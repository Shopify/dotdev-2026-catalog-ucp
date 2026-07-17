# Trailboards

A visual travel-itinerary planner whose canvas context drives **real Shopify
commerce**. Sketch a trip — destination, dates, stays, activities, travelers — and a
shopping agent reads that context to recommend real gear from the Shopify Catalog,
build a real per-merchant cart with live totals, and hand off to a real Shopify
checkout.

Built for the **DotDev 2026** workshop *Building Shopping into Any Surface with
Catalog & UCP*. Keyless and clone-and-run — this is the complete app with all four
commerce calls wired up end to end.

## The thesis

Four actors, one loop:

- **Agent for guidance** — reads board context and produces a shopping *intent*. It never emits prices, stock, or URLs; those aren't its to know.
- **APIs for truth** — the Shopify Catalog returns real products; each merchant's `create_cart` returns live totals, stock messages, and policy links.
- **State machine for safety** — the cart owns the guardrails: quantity caps, "already own," inline clarification before sizing.
- **Checkout Kit for conversion** — the last mile is a genuine Shopify checkout, embedded or redirect.

The canvas stays commerce-free; commerce lives only in the Recommendations/Cart
column and the Trace drawer. Every recommendation is attributable — the Provenance
strip shows which board, weather, or profile signal produced it.

## Run

Prereqs: **Node 22+** and **pnpm**.

```bash
git clone https://github.com/Shopify/dotdev-2026-catalog-ucp.git
cd dotdev-2026-catalog-ucp/trailboards-app
pnpm install
pnpm dev       # http://localhost:3100
```

**Keyless by default** — the agent runs a deterministic stub and the catalog is the
public UCP demo store, so no API keys are required to clone and run. To switch the
agent to a live model, set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_BASE_URL`)
in `.env` (copy `.env.example`).

## The commerce spine

The whole shopping journey is four real calls, wired across two connector files:

| Step | File | Function | What it makes real |
| --- | --- | --- | --- |
| **Search** | `server/commerce/connector.ts` | `searchCatalog` | recommendations, from a live catalog search |
| **Cart** | `server/commerce/connector.ts` | `createCart` | a per-merchant cart with Shopify's live totals |
| **Checkout** | `src/commerce/checkout.ts` | `openCheckout` | hand-off to a real Shopify checkout |

`getProduct` and `lookupCatalog` back the PDP overlay and cart re-materialization.

## Stack

React 19 + Vite + TypeScript (client) · Node + Express + `node:sqlite` + SSE (server) ·
MapLibre GL (keyless topo map) · Open-Meteo (keyless weather + geocoding) · Shopify
UCP Catalog + Cart + Checkout Kit.
