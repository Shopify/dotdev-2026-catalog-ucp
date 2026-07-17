# From Prompt to Purchase — Split-Screen UCP Lab

A local lab for learning the commerce spine behind an agentic shopping journey:

```text
context → intent → Catalog → merchant capabilities → cart → checkout → buyer handoff
```

The **left** side is a browser terminal where you type real UCP CLI commands. The
**right** side is a live commerce canvas that renders each command's output into
product cards, cart state, checkout state, and reference notes.

You type every command yourself — nothing is autocompleted. A one-time guided tour
(replayable from the **↺ tour** button, top-right) points out the terminal, the canvas,
the References tray, and the spine breadcrumb.

## Prerequisites

- Node 22+
- pnpm
- Shopify UCP CLI: `pnpm add -g @shopify/ucp-cli`

## Run

```bash
git clone https://github.com/Shopify/dotdev-2026-catalog-ucp.git
cd dotdev-2026-catalog-ucp/workshop-app
pnpm install
pnpm dev          # http://localhost:4242
```

## How it works

The terminal sends typed commands to a local Node server that allows only
workshop-safe commands — there's no general shell. It runs each allowlisted command
via `child_process.spawn`, streams stdout/stderr back to the browser, saves UCP JSON
under `runs/latest/`, and updates the canvas. Allowlisted:

`ucp ...` · `pnpm reset` · `cat contexts/trip.json` · `clear` · `help` · `reference`

The canvas reacts as you type:

- **Journey stepper** — marks the spine **Agent → Catalog → Cart → Checkout → Orders** as done / active / upcoming; the active step is what to run next.
- **Command explainer** — one line under each response saying what it did (and calling out commands that aren't part of the guided flow).
- **JSON tree** — JSON output renders as a collapsible tree with expand / collapse all, so you can drill into nested fields.
- **Reference tray** — click `reference` in the terminal titlebar for every command below with `copy` / `run` buttons and a `docs ↗` link into [Shopify/ucp-cli](https://github.com/Shopify/ucp-cli). `run` sends the command as-is, so fill in any `<placeholder>` first.

## Placeholders

The commands use placeholders you fill from earlier responses — nothing is hard-coded
to a specific merchant:

| Placeholder | Where it comes from |
| --- | --- |
| `<your-name>` | you |
| `<product-id>` · `<variant-gid>` | the catalog search response |
| `<merchant-domain>` | the merchant behind the product you picked |
| `<cart-id>` | `result.id` from `cart create` |
| `<checkout-id>` | `result.id` from `checkout create` |
| `<order-id>` | the completed order |

## Guided flow

The commerce spine, in order. These mirror the in-app **Reference tray** exactly.

### 1. Set up the agent

```bash
ucp profile init --name <your-name>
ucp doctor
```

→ *Setup* turns done; an agent block appears. `doctor` confirms the CLI is reachable before any commerce call.

### 2. Pull context → intent

```bash
cat contexts/trip.json
```

Turn the context into a shoppable query, e.g.:

> packable waterproof rain jacket in a bright colour for a rainy Vancouver Island coastal hike under $75

→ *Intent* turns done; a block summarizes destination, season, and query.

### 3. Search the Catalog

```bash
ucp catalog search \
  --set /query='packable waterproof rain jacket in a bright colour for a rainy Vancouver Island coastal hike under $75' \
  --set /context/address_country=CA \
  --set /filters/available=true \
  --format json
```

→ *Catalog* turns done; product cards render and the terminal shows a JSON tree. Copy a `<product-id>` from the response for the next step.

### 4. Inspect a product

```bash
ucp catalog get_product <product-id> --format json
```

→ Resolves the product to full detail, including the `<variant-gid>` you need to build a cart, and the `<merchant-domain>` that sells it.

### 5. Discover the merchant

```bash
ucp discover --business https://<merchant-domain> --format json
```

→ *Discover* turns done; a block lists what the merchant actually advertises — inspect capabilities, don't assume them.

### 6. Create a cart

```bash
ucp cart create --business https://<merchant-domain> \
  --set /line_items/0/item/id='<variant-gid>' \
  --set /line_items/0/quantity=1 \
  --set /context/address_country=CA \
  --format json
```

→ *Cart* turns done; a block shows the cart ID and total. State now lives on the merchant. Grab `result.id` — that's your `<cart-id>`.

### 7. Read the cart back

```bash
ucp cart get <cart-id> --business https://<merchant-domain> --format json
```

→ Reads the cart straight from the merchant to confirm what was actually stored.

### 8. Create checkout

```bash
ucp checkout create --business https://<merchant-domain> \
  --input '{"cart_id":"<cart-id>","line_items":[]}' \
  --format json
```

→ *Checkout* turns done. Most workshop merchants return `requires_escalation` with a `continue_url` — that's the buyer-action boundary, not a broken demo:

```text
status:       requires_escalation
message:      delivery_address_required — A destination address is required in order to continue.
continue_url: https://<merchant-domain>/cart/c/<cart-id>?key=<key>
```

The canvas shows a *Buyer handoff* card linking to `continue_url`. Handoff options: [Embedded Commerce Protocol (ECP)](https://shopify.dev/docs/agents/carts-and-checkout/ecp) · [Checkout Kit](https://shopify.dev/docs/agents/carts-and-checkout/checkout-kit).

### 9. Complete checkout — *only if not escalated*

```bash
ucp checkout complete <checkout-id> --business https://<merchant-domain> --format json
```

Run this **only when `checkout create` returns `requires_escalation = false`**. Most
merchants require buyer authentication to complete, so they escalate instead — in that
case skip this and hand the buyer off via `continue_url` above.

### 10. Track the order

Once an order exists (the buyer finishes the handoff, or you already have an order id):

```bash
ucp order get <order-id> --business https://<merchant-domain> --format json
```

→ *Orders* turns done (5 of 5), closing the loop from intent to purchase. In the escalation path the CLI doesn't place an order, so you may not have an `<order-id>` to run this live — that's expected.

## Schema-first diagnostics

Agents should inspect live schemas and state, not guess harder. Any command takes
`--input-schema`:

```bash
ucp catalog search --input-schema
ucp catalog lookup --input-schema
ucp cart update --input-schema --business https://<merchant-domain>
ucp checkout create --input-schema --business https://<merchant-domain>
ucp checkout update --input-schema --business https://<merchant-domain>
```

## Hand it to an agent

```bash
ucp skills add
```

Then prompt:

> Read contexts/trip.json. Use Shopify UCP tools to find one useful item for this trip, create a cart, create checkout, and explain the next buyer action. Do not invent price, inventory, cart state, or checkout state.

## Reset

Click **reset** in the terminal titlebar, or:

```bash
pnpm reset
clear
```

## Themes

Pick a surface from the theme picker in the top-right header:

- **Field** — light field notebook
- **Blueprint** — architectural cyan, with magenta preserved as the agent signature

Both use contrast-checked text tokens across the header, terminal, canvas, controls, badges, and reference tray.
