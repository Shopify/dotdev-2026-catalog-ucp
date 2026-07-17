# Building Shopping into Any Surface with Catalog & UCP

Companion repo for the **DotDev 2026** workshop. Two runnable apps that show the same
idea from two angles: any everyday surface becomes shoppable when an agent handles
commerce underneath, using the **Universal Commerce Protocol (UCP)** and the Shopify
Catalog, Cart, and Checkout.

## The four calls

Every shoppable app walks the same path — *from prompt to purchase*:

**Agent → Catalog → Cart → Checkout**

- **Agent** — turns the shopper's context and intent into a shoppable query.
- **Catalog** — resolves that intent into real, buyable products.
- **Cart** — assembles the chosen variants into a real, merchant-owned cart with live totals.
- **Checkout** — hands off to a secure, pre-filled Shopify checkout, with orders flowing back.

## The two apps

| App | What it is | Run on |
| --- | --- | --- |
| [`trailboards-app`](./trailboards-app) | A visual trip planner whose canvas context drives real Shopify commerce — the pattern applied to a real product surface. | http://localhost:3100 |
| [`workshop-app`](./workshop-app) | A split-screen lab where you type the four UCP CLI calls yourself and watch a live commerce canvas react. | http://localhost:4242 |

## Prerequisites

- **Node 22+**
- **pnpm**
- **Shopify UCP CLI** (workshop-app only): `pnpm add -g @shopify/ucp-cli`

## Quick start

Each app is self-contained. Pick one:

```bash
# The trip-planner surface
cd trailboards-app && pnpm install && pnpm dev      # http://localhost:3100

# The hands-on CLI lab
cd workshop-app && pnpm install && pnpm dev         # http://localhost:4242
```

See each app's own README for details. Trailboards is keyless and clone-and-run;
the workshop lab drives the real UCP CLI.

## Resources

- [UCP Documentation](https://ucp.dev/)
- [Shopify Agentic Toolkit](https://shopify.dev/agents)
- Shopify agent APIs — [Catalog](https://shopify.dev/docs/agents/catalog) · [Cart](https://shopify.dev/docs/agents/carts-and-checkout) · [Checkout](https://shopify.dev/docs/agents/carts-and-checkout/checkout-mcp) · [Orders](https://shopify.dev/docs/agents/orders)
