import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const runDir = path.join(root, 'runs', 'latest');
const port = Number(process.env.PORT || 4242);

fs.mkdirSync(runDir, { recursive: true });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  if (req.method === 'GET' && url.pathname === '/api/state') {
    sendJson(res, readState());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/run') {
    const body = await readBody(req);
    let command = '';
    try { command = JSON.parse(body).command ?? ''; } catch {}
    await runCommand(command, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/reset') {
    resetRuns();
    sendJson(res, readState());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/open') {
    const body = await readBody(req);
    let target = '';
    try { target = JSON.parse(body).path ?? ''; } catch {}
    const result = openPath(target);
    sendJson(res, result, result.ok ? 200 : 400);
    return;
  }

  serveStatic(url.pathname, res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Split-screen UCP lab running at http://127.0.0.1:${port}`);
});

function serveStatic(pathname, res) {
  const resolved = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(publicDir, resolved));
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  res.setHeader('content-type', contentType(filePath));
  fs.createReadStream(filePath).pipe(res);
}

async function runCommand(rawCommand, res) {
  const command = normalizeCommand(rawCommand);
  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff'
  });

  const emit = (event) => res.write(`${JSON.stringify(event)}\n`);

  if (!command) {
    emit({ type: 'error', data: 'No command entered.' });
    res.end();
    return;
  }

  if (command === 'clear') {
    emit({ type: 'clear' });
    emit({ type: 'state', data: readState() });
    res.end();
    return;
  }

  if (command === 'help') {
    emit({ type: 'stdout', data: helpText() });
    emit({ type: 'state', data: readState() });
    res.end();
    return;
  }

  if (command === 'reference') {
    emit({ type: 'stdout', data: referenceText() });
    emit({ type: 'state', data: readState() });
    res.end();
    return;
  }

  let parsed;
  try { parsed = parseCommand(command); }
  catch (error) {
    emit({ type: 'error', data: error.message });
    res.end();
    return;
  }

  const validation = validateCommand(parsed);
  if (!validation.ok) {
    emit({ type: 'error', data: validation.message });
    emit({ type: 'stdout', data: '\nAllowed commands: ucp ..., pnpm reset, cat contexts/trip.json, help, reference, clear. The titlebar reset button also clears generated runs.\n' });
    res.end();
    return;
  }

  emit({ type: 'start', command });

  if (parsed.cmd === 'pnpm' && parsed.args[0] === 'reset') {
    resetRuns();
    emit({ type: 'stdout', data: 'Cleared generated workshop outputs under runs/.\n' });
    emit({ type: 'state', data: readState() });
    emit({ type: 'exit', code: 0 });
    res.end();
    return;
  }

  const child = spawn(parsed.cmd, parsed.args, { cwd: root, env: process.env, shell: false });
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', chunk => {
    const text = chunk.toString();
    stdout += text;
    emit({ type: 'stdout', data: text });
  });

  child.stderr.on('data', chunk => {
    const text = chunk.toString();
    stderr += text;
    emit({ type: 'stderr', data: text });
  });

  child.on('error', error => {
    if (error.code === 'ENOENT' && parsed.cmd === 'ucp') {
      emit({ type: 'error', data: 'ucp CLI not found on PATH. Install it with: pnpm add -g @shopify/ucp-cli' });
    } else {
      emit({ type: 'error', data: error.message });
    }
    res.end();
  });

  child.on('close', code => {
    const capture = captureCommand(command, parsed, stdout, stderr, code);
    if (capture.note) emit({ type: 'note', data: `\n${capture.note}\n` });
    emit({ type: 'state', data: readState() });
    emit({ type: 'exit', code });
    res.end();
  });
}

function captureCommand(command, parsed, stdout, stderr, code) {
  fs.mkdirSync(runDir, { recursive: true });
  const fullText = stdout || stderr;

  if (parsed.cmd === 'cat') {
    if (code === 0) updateIntentFromText(command, fullText);
    return {};
  }

  if (parsed.cmd !== 'ucp') return {};

  const parsedJson = parseMaybeJson(fullText);
  const base = { command, code, createdAt: new Date().toISOString() };

  const family = parsed.args[0];
  const action = parsed.args[1];
  const name = family && action ? `${family}-${action}` : family;
  if (!name) return {};

  const fileBase = `${Date.now()}-${name}`;
  fs.writeFileSync(path.join(runDir, `${fileBase}.raw.txt`), fullText);
  const skipCheckoutState = family === 'checkout' && shouldSkipCheckoutState(parsed);

  if (parsedJson) {
    fs.writeFileSync(path.join(runDir, `${fileBase}.json`), JSON.stringify({ ...base, response: parsedJson }, null, 2) + '\n');
    let note = `Saved ${path.relative(root, path.join(runDir, `${fileBase}.json`))}`;
    if (!skipCheckoutState) {
      try {
        updateStateFromUcp(family, action, command, parsedJson);
      } catch (error) {
        note += ` (canvas update skipped: ${error.message})`;
      }
    }
    return { note };
  }

  fs.writeFileSync(path.join(runDir, `${fileBase}.json`), JSON.stringify({ ...base, raw: fullText }, null, 2) + '\n');
  if (!skipCheckoutState) updateStateFromText(family, action, command, fullText);
  return { note: `Saved raw output under ${path.relative(root, runDir)}` };
}

function shouldSkipCheckoutState(parsed) {
  if (parsed.args.includes('--input-schema')) return true;
  const inputIndex = parsed.args.indexOf('--input');
  if (inputIndex === -1) return false;
  try {
    const input = JSON.parse(parsed.args[inputIndex + 1]);
    return !input?.cart_id;
  } catch {
    return false;
  }
}

function updateIntentFromText(command, text) {
  const state = readState();
  state.lastCommand = command;
  state.updatedAt = new Date().toISOString();
  state.intent = { status: 'pulled', lastCommand: command, responseSummary: summarize(text) };
  writeState(state);
}

function updateStateFromUcp(family, action, command, response) {
  const state = readState();
  state.lastCommand = command;
  state.updatedAt = new Date().toISOString();

  if (family === 'profile' || command.includes(' doctor')) {
    const info = extractProfileInfo(family, response, state.profile ?? {});
    const agent = readAgentCapabilities(info.name);
    state.profile = {
      status: 'checked',
      lastCommand: command,
      responseSummary: summarize(response),
      name: info.name ?? agent?.name ?? null,
      profileUrl: info.profileUrl,
      profileDir: agent?.dir ?? state.profile?.profileDir ?? null,
      capabilities: agent
        ? { ids: agent.ids, schemaLinks: agent.schemaLinks }
        : (state.profile?.capabilities ?? { ids: [], schemaLinks: [] })
    };
  }

  if (family === 'discover') {
    state.discovery = { command, response, capabilities: extractCapabilities(response) };
  }

  if (family === 'catalog' && action === 'search') {
    state.catalog = { command, products: collectProducts(response, command), response };
  }

  if (family === 'catalog' && (action === 'get_product' || action === 'lookup')) {
    state.product = { command, summary: summarizeProduct(response), response };
  }

  if (family === 'cart' && action === 'get') {
    state.cartRead = { command, summary: summarizeCart(response), response };
  } else if (family === 'cart') {
    state.cart = { command, summary: summarizeCart(response), response };
  }

  // `checkout complete` almost always escalates (buyer auth/payment the CLI can't provide), so it
  // isn't a guided step or a card — and it must not overwrite the create card. Only create/update
  // feed the checkout card.
  if (family === 'checkout' && action !== 'complete') {
    state.checkout = { command, summary: summarizeCheckout(response), response };
  }

  writeState(state);
}

function updateStateFromText(family, action, command, text) {
  const state = readState();
  state.lastCommand = command;
  state.updatedAt = new Date().toISOString();
  const responseSummary = summarize(text);

  if (family === 'profile' || command.includes(' doctor')) {
    const agent = readAgentCapabilities(state.profile?.name);
    state.profile = {
      status: 'checked',
      lastCommand: command,
      responseSummary,
      name: state.profile?.name ?? agent?.name ?? null,
      profileUrl: state.profile?.profileUrl ?? null,
      profileDir: agent?.dir ?? state.profile?.profileDir ?? null,
      capabilities: agent
        ? { ids: agent.ids, schemaLinks: agent.schemaLinks }
        : (state.profile?.capabilities ?? { ids: [], schemaLinks: [] })
    };
  }

  if (family === 'discover') {
    state.discovery = { command, response: { raw: text }, capabilities: extractCapabilitiesFromText(text) };
  }

  if (family === 'cart') {
    const summary = { messages: text ? [text.slice(0, 280)] : [] };
    if (action === 'get') state.cartRead = { command, summary, response: { raw: text } };
    else state.cart = { command, summary, response: { raw: text } };
  }

  if (family === 'checkout' && action !== 'complete') {
    state.checkout = { command, summary: { status: responseSummary, continueUrl: findFirstUrl(text), messages: [] }, response: { raw: text } };
  }

  writeState(state);
}

function readState() {
  const statePath = path.join(runDir, 'state.json');
  const context = readJsonFile(path.join(root, 'contexts', 'trip.json'));
  if (!fs.existsSync(statePath)) {
    return { context, updatedAt: null, catalog: null, product: null, discovery: null, cart: null, cartRead: null, checkout: null, profile: null, intent: null };
  }
  const state = readJsonFile(statePath);
  return { context, ...state };
}

function writeState(state) {
  const { context, ...rest } = state;
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify(rest, null, 2) + '\n');
}

function resetRuns() {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  for (const entry of fs.readdirSync(path.join(root, 'runs'))) {
    if (entry === '.gitkeep') continue;
    fs.rmSync(path.join(root, 'runs', entry), { recursive: true, force: true });
  }
  fs.mkdirSync(runDir, { recursive: true });
}

// A UCP `catalog search` response is `result.products[]`, and each product carries a
// `variants[]` array. Crucially, the merchant (`seller.domain`, the API-addressable handle)
// lives on the VARIANT, not the product — one Catalog product aggregates offers from several
// sellers. So we group variants under each product and keep merchant + variant GID per variant.
function collectProducts(payload, command = '') {
  const nodes = findProductArray(payload);
  let products = nodes.map(toProduct).filter(Boolean);

  // Fallback for shapes with no clear product array: one product per node that owns a variant
  // GID, single variant each — keeps something on the canvas for non-standard responses.
  if (!products.length) products = collectProductsFallback(payload);

  // The API sometimes returns variants that contradict `--set /filters/available=…`. Honor the
  // requested filter here: drop variants whose availability is the opposite boolean (unknown
  // availability is kept — we can't prove it violates the filter), then drop emptied products.
  const wantAvailable = parseAvailabilityFilter(command);
  if (wantAvailable !== null) {
    products = products
      .map(product => filterVariantsByAvailability(product, wantAvailable))
      .filter(Boolean);
  }

  const seen = new Set();
  return products.filter(product => {
    const key = product.productId ?? `${product.title}|${product.variantId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

// Reads the requested availability from the command, whether set as `--set /filters/available=…`
// or embedded in a `--input` JSON filters block. Returns true/false, or null when unspecified.
function parseAvailabilityFilter(command) {
  if (typeof command !== 'string') return null;
  const set = command.match(/\/filters\/available\s*=\s*(true|false)/i);
  if (set) return set[1].toLowerCase() === 'true';
  const json = command.match(/"filters"\s*:\s*\{[^{}]*"available"\s*:\s*(true|false)/i);
  if (json) return json[1].toLowerCase() === 'true';
  return null;
}

function filterVariantsByAvailability(product, wantAvailable) {
  const variants = product.variants.filter(variant => variant.available !== !wantAvailable);
  if (!variants.length) return null;
  return { ...product, variants, variantId: variants[0].id, merchant: variants[0].merchant ?? product.merchant };
}

function findProductArray(payload) {
  const direct = payload?.result?.products ?? payload?.products;
  if (Array.isArray(direct) && direct.length) return direct;
  let found = null;
  walk(payload, node => {
    if (found) return;
    if (Array.isArray(node) && node.some(item => item && typeof item === 'object' && Array.isArray(item.variants))) {
      found = node;
    }
  });
  return found ?? [];
}

function toProduct(node) {
  if (!node || typeof node !== 'object') return null;
  const list = Array.isArray(node.variants) ? node.variants : Array.isArray(node.variant_options) ? node.variant_options : [];
  const variants = list.map(toVariant).filter(Boolean).slice(0, 8);
  if (!variants.length) {
    // Product with no structured variants — recover a single variant GID from its subtree.
    const id = findFirstString(node, text => text.startsWith('gid://shopify/ProductVariant/'));
    if (id) variants.push({ id, title: null, price: null, available: null, merchant: findMerchant(node) });
  }
  if (!variants.length) return null;
  return {
    title: firstString(node, ['title', 'name', 'product_title']) ?? findNearbyString(node, ['title', 'name']) ?? 'Untitled product',
    productId: findFirstString(node, text => text.startsWith('gid://shopify/p/') || text.startsWith('gid://shopify/Product/')),
    price: formatPriceRange(node) ?? findPrice(node),
    url: productUrl(node),
    image: findImage(node),
    // First variant's identity, kept flat for backward compatibility with single-variant callers.
    variantId: variants[0].id,
    merchant: variants[0].merchant ?? findMerchant(node),
    variants,
    // Product-level option space (Color/Size + their values). Catalog search returns only one
    // matched variant per product, so this is the real source of breadth for the tree.
    options: toOptions(node)
  };
}

// Normalize a product's `options[]` into `[{ name, values: [label] }]`, dropping empties.
function toOptions(node) {
  if (!Array.isArray(node.options)) return [];
  return node.options.map(option => {
    const name = firstString(option, ['name', 'title', 'label']);
    const rawValues = Array.isArray(option.values) ? option.values : [];
    const values = rawValues.map(value => (typeof value === 'string' ? value : firstString(value, ['label', 'value', 'name']))).filter(Boolean);
    if (!name || !values.length) return null;
    return { name, values };
  }).filter(Boolean);
}

function toVariant(variant) {
  if (!variant || typeof variant !== 'object') return null;
  const id = findFirstString(variant, text => text.startsWith('gid://shopify/ProductVariant/'));
  if (!id) return null;
  return {
    id,
    title: variantTitle(variant),
    price: formatMoney(variant.price) ?? findPrice(variant),
    available: readAvailability(variant),
    merchant: sellerDomain(variant)
  };
}

// A variant's own `title` usually just echoes the product title, so the distinguishing label is
// the option combination (e.g. "High Rise Grey · 3 liter"). Fall back to explicit title fields.
function variantTitle(variant) {
  if (Array.isArray(variant.options)) {
    const labels = variant.options.map(option => firstString(option, ['label', 'value'])).filter(Boolean);
    if (labels.length) return labels.join(' · ');
  }
  return firstString(variant, ['variant_title', 'option_title', 'title', 'name', 'option1']);
}

// The API-addressable handle for `--business` is `seller.domain`; `seller.url` is the
// buyer-facing storefront (may not be API-addressable), so prefer domain and fall back.
function sellerDomain(variant) {
  const seller = (variant.seller && typeof variant.seller === 'object') ? variant.seller : variant;
  const domain = firstString(seller, ['domain', 'seller_domain']) ?? firstString(variant, ['seller_domain', 'domain']);
  if (domain && looksLikeDomain(domain)) return stripProtocol(domain);
  const url = firstString(seller, ['url']);
  if (url && looksLikeDomain(url)) return stripProtocol(url);
  return findMerchant(variant);
}

function collectProductsFallback(payload) {
  const products = [];
  walk(payload, node => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const variantId = findFirstString(node, text => text.startsWith('gid://shopify/ProductVariant/'));
    if (!variantId) return;
    const merchant = findMerchant(node);
    if (!merchant) return;
    products.push({
      title: firstString(node, ['title', 'name', 'product_title']) ?? findNearbyString(node, ['title', 'name']) ?? 'Untitled product',
      productId: findFirstString(node, text => text.startsWith('gid://shopify/p/') || text.startsWith('gid://shopify/Product/')),
      price: findPrice(node),
      url: findUrl(node),
      image: findImage(node),
      variantId,
      merchant,
      variants: [{ id: variantId, title: null, price: findPrice(node), available: findAvailability(node), merchant }]
    });
  });
  return products;
}

function productUrl(node) {
  const url = firstString(node, ['url', 'pdp', 'link']);
  if (url && /^https?:\/\//.test(url) && !looksLikeImage(url)) return url;
  return findUrl(node);
}

function formatPriceRange(node) {
  const range = node.price_range ?? node.priceRange;
  if (range && typeof range === 'object') {
    const min = formatMoney(range.min);
    const max = formatMoney(range.max);
    if (min && max && min !== max) return `${min} – ${max}`;
    return min ?? max ?? null;
  }
  return formatMoney(node.price);
}

// Catalog money is `{ amount, currency }` with amount in minor units (2795 = $27.95),
// except zero-decimal currencies (JPY, KRW, …) which are already in major units.
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'XAF', 'XOF']);

function formatMoney(money) {
  if (!money || typeof money !== 'object') return null;
  const amount = money.amount ?? money.value;
  if (amount == null) return null;
  const number = Number(amount);
  if (!Number.isFinite(number)) return null;
  const currency = (money.currency ?? money.currency_code ?? money.currencyCode ?? '').toUpperCase();
  const zeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency);
  // UCP amounts are in minor units (2795 = $27.95) except zero-decimal currencies, which already
  // arrive in major units. Convert to major units, then render with the currency's own symbol.
  const value = zeroDecimal ? number : number / 100;
  if (currency) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
    } catch {
      // Non-ISO/unknown currency code — Intl throws; fall back to a plain value + code.
    }
    return `${zeroDecimal ? String(value) : value.toFixed(2)} ${currency}`;
  }
  return zeroDecimal ? String(value) : value.toFixed(2);
}

function readAvailability(variant) {
  const availability = variant.availability;
  if (availability && typeof availability === 'object' && typeof availability.available === 'boolean') return availability.available;
  return findAvailability(variant);
}

function findAvailability(object) {
  if (!object || typeof object !== 'object') return null;
  for (const key of ['available', 'availableForSale', 'available_for_sale', 'inStock', 'in_stock', 'is_available']) {
    if (typeof object[key] === 'boolean') return object[key];
  }
  return null;
}

function summarizeCart(payload) {
  const data = payload?.result ?? payload;
  const currency = typeof data?.currency === 'string' ? data.currency : findValueByKey(data, 'currency');
  const totals = collectTotals(data, currency);
  return {
    id: findFirstString(data, (text, parts) => text.includes('Cart') && (parts.at(-1)?.toLowerCase() === 'id' || text.startsWith('gid://shopify/Cart/'))),
    currency,
    lineItems: collectLineItems(data, currency),
    totals,
    total: grandTotal(totals),
    messages: collectResultMessages(data),
    continueUrl: typeof data?.continue_url === 'string' ? data.continue_url : findContinueUrl(data),
    cta: payload?.cta ?? null
  };
}

function summarizeCheckout(payload) {
  const data = payload?.result ?? payload;
  const currency = typeof data?.currency === 'string' ? data.currency : findValueByKey(data, 'currency');
  const totals = collectTotals(data, currency);
  return {
    id: findFirstString(data, (text, parts) => text.includes('Checkout') && (parts.at(-1)?.toLowerCase() === 'id' || text.startsWith('gid://shopify/Checkout/'))),
    status: typeof data?.status === 'string' ? data.status : findValueByKey(data, 'status'),
    currency,
    lineItems: collectLineItems(data, currency),
    totals,
    total: grandTotal(totals),
    messages: collectResultMessages(data),
    continueUrl: typeof data?.continue_url === 'string' ? data.continue_url : findContinueUrl(data),
    cta: payload?.cta ?? null
  };
}

// `catalog get_product` returns a single `result.product` node with the same variant/option/media
// shape as a search product, so reuse toProduct to get the full detail (variant id + option space).
function summarizeProduct(payload) {
  const data = payload?.result ?? payload;
  const node = (data && typeof data.product === 'object' && data.product) ? data.product
    : Array.isArray(data?.products) ? data.products[0]
    : data;
  return toProduct(node);
}

// Cart/checkout line items: `{ item: { title, price (minor units), image_url }, quantity }`.
function collectLineItems(data, currency) {
  const lines = Array.isArray(data?.line_items) ? data.line_items : [];
  return lines.map(line => {
    const item = (line?.item && typeof line.item === 'object') ? line.item : {};
    const quantity = Number(line?.quantity);
    return {
      title: firstString(item, ['title', 'name']) ?? 'Item',
      quantity: Number.isFinite(quantity) ? quantity : 1,
      price: money(item.price, currency),
      image: firstString(item, ['image_url', 'image'])
    };
  }).slice(0, 8);
}

// `totals[]` is `{ type, amount (minor units), display_text }` — subtotal, tax, total, etc.
function collectTotals(data, currency) {
  const totals = Array.isArray(data?.totals) ? data.totals : [];
  return totals.map(entry => ({
    label: firstString(entry, ['display_text', 'label']) ?? firstString(entry, ['type']) ?? 'Total',
    type: typeof entry?.type === 'string' ? entry.type : null,
    amount: money(entry?.amount, currency)
  })).filter(entry => entry.amount);
}

function grandTotal(totals) {
  return totals.find(entry => entry.type === 'total')?.amount ?? totals.at(-1)?.amount ?? null;
}

// Cart/checkout messages arrive as `{ type, code, content }` objects (or plain strings on the
// text fallback). Surface the human-readable `content` and drop the machine envelope.
function collectResultMessages(data) {
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  return messages.map(message => {
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') return firstString(message, ['content', 'message', 'text']);
    return null;
  }).filter(Boolean).slice(0, 4);
}

function money(amount, currency) {
  if (amount == null) return null;
  return formatMoney({ amount, currency });
}

function extractProfileInfo(family, response, previous = {}) {
  const info = { name: previous.name ?? null, profileUrl: previous.profileUrl ?? null };

  if (family === 'profile' && typeof response?.name === 'string') info.name = response.name;
  if (family === 'profile' && typeof response?.profile === 'string') info.name = response.profile;
  if (family === 'profile' && typeof response?.profile_url === 'string') info.profileUrl = response.profile_url;

  for (const check of Array.isArray(response?.checks) ? response.checks : []) {
    if (check.id === 'active-yaml' && typeof check.detail === 'string') {
      try {
        const parsed = JSON.parse(check.detail);
        if (typeof parsed?.profile === 'string') info.name = parsed.profile;
      } catch {}
    }
    if (check.id === 'profile-url' && typeof check.detail === 'string') {
      const url = check.detail.match(/https?:\/\/\S+/)?.[0];
      if (url) info.profileUrl = url;
    }
  }

  return info;
}

// Read the active agent profile's own capabilities off disk (~/.ucp/profiles/<name>/profile.json).
// active.yaml is the CLI's source of truth for which profile is active, so it maps reliably to the
// on-disk directory. The profile.json uses the same `capabilities` shape as merchant discovery, so
// the existing walker extracts it verbatim.
function readAgentCapabilities(name) {
  try {
    const home = os.homedir();
    let profileName = name;
    const activePath = path.join(home, '.ucp', 'active.yaml');
    if (fs.existsSync(activePath)) {
      const match = fs.readFileSync(activePath, 'utf8').match(/profile:\s*(\S+)/);
      if (match) profileName = match[1];
    }
    if (!profileName) return null;
    const profileDir = path.join(home, '.ucp', 'profiles', profileName);
    const profilePath = path.join(profileDir, 'profile.json');
    if (!fs.existsSync(profilePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    return { name: profileName, dir: profileDir, ...extractCapabilities(parsed) };
  } catch {
    return null;
  }
}

function extractCapabilities(payload) {
  const ids = [];
  const schemaLinks = [];
  walk(payload, (node, parts) => {
    const key = parts.at(-1)?.toLowerCase() ?? '';
    if (key !== 'capabilities') return;
    if (Array.isArray(node)) {
      ids.push(...node.map(String));
    } else if (node && typeof node === 'object') {
      for (const [id, descriptors] of Object.entries(node)) {
        ids.push(id);
        for (const descriptor of Array.isArray(descriptors) ? descriptors : [descriptors]) {
          const schema = descriptor?.schema ?? descriptor?.spec;
          if (typeof schema === 'string') schemaLinks.push({ capability: id, url: schema });
        }
      }
    }
  });
  return {
    ids: [...new Set(ids)].slice(0, 30),
    schemaLinks: schemaLinks.slice(0, 30)
  };
}

function extractCapabilitiesFromText(text) {
  const lower = String(text ?? '').toLowerCase();
  const ids = ['catalog', 'product', 'cart', 'checkout', 'profile', 'order']
    .filter(capability => lower.includes(capability));
  return { ids, schemaLinks: [] };
}

function summarize(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload.slice(0, 400);
  return Object.keys(payload).slice(0, 12).join(', ');
}

function validateCommand(parsed) {
  if (parsed.cmd === 'ucp') return { ok: true };
  if (parsed.cmd === 'pnpm' && parsed.args.length === 1 && parsed.args[0] === 'reset') return { ok: true };
  if (parsed.cmd === 'cat' && parsed.args.length === 1 && parsed.args[0] === 'contexts/trip.json') return { ok: true };
  return { ok: false, message: `Command not allowed: ${parsed.cmd} ${parsed.args.join(' ')}` };
}

function normalizeCommand(command) {
  return String(command ?? '').replace(/\\\s*\n/g, ' ').trim();
}

function parseCommand(command) {
  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;

  for (const char of command) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (/\s/.test(char)) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += char;
  }
  if (quote) throw new Error('Unclosed quote in command.');
  if (current) tokens.push(current);
  if (!tokens.length) return { cmd: '', args: [] };
  return { cmd: tokens[0], args: tokens.slice(1) };
}

function parseMaybeJson(text) {
  try { return JSON.parse(text); } catch {}
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch {}
  }
  return null;
}

function readJsonFile(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function findMerchant(object) {
  const direct = firstString(object, ['merchant', 'merchant_domain', 'domain', 'seller_domain', 'shop', 'shopDomain']);
  if (direct && looksLikeDomain(direct)) return stripProtocol(direct);
  const seller = object.seller ?? object.merchant ?? object.business;
  if (seller && typeof seller === 'object') {
    const nested = firstString(seller, ['domain', 'url', 'shop', 'name']);
    if (nested && looksLikeDomain(nested)) return stripProtocol(nested);
  }
  const found = findFirstString(object, (text, parts) => {
    const key = parts.at(-1)?.toLowerCase() ?? '';
    return ['domain', 'url', 'shop', 'seller', 'merchant'].some(part => key.includes(part)) && looksLikeDomain(text);
  });
  return found ? stripProtocol(found) : null;
}

function findPrice(object) {
  const direct = firstString(object, ['price', 'displayPrice', 'price_text']);
  if (direct) return direct;
  const amount = object.amount ?? object.price_amount;
  const currency = object.currency ?? object.currencyCode ?? object.currency_code;
  if (amount != null) return `${currency ?? ''} ${amount}`.trim();
  let found = null;
  walk(object, (node, parts) => {
    if (found) return;
    const key = parts.at(-1)?.toLowerCase() ?? '';
    if ((key.includes('price') || key.includes('amount')) && (typeof node === 'string' || typeof node === 'number')) found = String(node);
  });
  return found;
}

function findUrl(object) {
  return findFirstString(object, (text, parts) => {
    const key = parts.at(-1)?.toLowerCase() ?? '';
    return /^https?:\/\//.test(text) && !looksLikeImage(text) && ['url', 'link', 'href', 'buy'].some(part => key.includes(part));
  });
}

function findImage(object) {
  return findFirstString(object, (text, parts) => {
    const key = parts.at(-1)?.toLowerCase() ?? '';
    return /^https?:\/\//.test(text) && (looksLikeImage(text) || key.includes('image'));
  });
}

function findContinueUrl(object) {
  return findFirstString(object, (text, parts) => {
    const key = parts.at(-1)?.toLowerCase() ?? '';
    return /^https?:\/\//.test(text) && key.includes('continue');
  });
}

function findFirstUrl(text) {
  return String(text ?? '').match(/https?:\/\/\S+/)?.[0] ?? null;
}

function findValueByKey(object, target) {
  let found = null;
  walk(object, (node, parts) => {
    if (found != null) return;
    const key = parts.at(-1)?.toLowerCase() ?? '';
    if ((key === target || key.includes(target)) && (typeof node === 'string' || typeof node === 'number')) found = node;
  });
  return found;
}

function firstString(object, keys) {
  for (const key of keys) if (typeof object[key] === 'string' && object[key].trim()) return object[key];
  return null;
}

function findNearbyString(object, keys) {
  let found = null;
  walk(object, (node, parts) => {
    if (found) return;
    const key = parts.at(-1)?.toLowerCase() ?? '';
    if (typeof node === 'string' && keys.some(k => key.includes(k)) && node.trim()) found = node;
  });
  return found;
}

function findFirstString(value, predicate) {
  let found = null;
  walk(value, (node, parts) => {
    if (found) return;
    if (typeof node === 'string' && predicate(node, parts)) found = node;
  });
  return found;
}

function walk(value, visit, parts = []) {
  visit(value, parts);
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, visit, [...parts, String(index)]));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => walk(child, visit, [...parts, key]));
}

function looksLikeDomain(text) {
  return /(^https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}/i.test(text) && !text.startsWith('gid://');
}

function stripProtocol(text) {
  return text.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function looksLikeImage(text) {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(text);
}

function sendJson(res, value, status = 200) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

// Reveal a path in the OS file manager. Restricted to files/dirs under ~/.ucp
// so the canvas can only open UCP profile artifacts, never arbitrary paths.
function openPath(target) {
  const home = os.homedir();
  const ucpRoot = path.join(home, '.ucp');
  const resolved = path.resolve(target ?? '');
  if (resolved !== ucpRoot && !resolved.startsWith(ucpRoot + path.sep)) {
    return { ok: false, error: 'path outside ~/.ucp' };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: 'path not found' };
  }
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'explorer'
    : 'xdg-open';
  try {
    const child = spawn(opener, [resolved], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, path: resolved };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function helpText() {
  return `Workshop commands — type them on the left, watch the canvas react on the right:\n\n  ucp profile init --name <your-name>   set up your buyer agent\n  ucp doctor                            check the UCP CLI is ready\n  cat contexts/trip.json                pull the buyer intent\n  ucp catalog search ...                search the live Catalog\n  ucp discover --business <domain>      ask a merchant what it supports\n  ucp catalog get_product <id>          inspect a product + variant id\n  ucp cart create ...                   create a merchant-owned cart\n  ucp cart get <cart-id>                read the cart back\n  ucp checkout create ...               hand off to merchant checkout\n  ucp checkout complete <checkout-id>   finalize — only if create is not escalated\n\nUtilities:\n\n  reference    open the full command reference (also the titlebar button)\n  pnpm reset   clear generated runs and reset the canvas\n  clear        clear the terminal\n\nTip: click "reference" in the terminal titlebar for copy/run buttons and docs links. Multiline commands with \\ line continuations are supported.\n`;
}

function referenceText() {
  return `Vancouver Island flow:\n\n  ucp profile init --name <your-name>\n  ucp doctor\n  cat contexts/trip.json\n  ucp catalog search --set /query='packable waterproof rain jacket in a bright colour for a rainy Vancouver Island coastal hike under $75' --set /context/address_country=CA --set /filters/available=true --format json\n  ucp discover --business https://<merchant-domain> --format json\n  ucp catalog get_product <product-id> --format json\n  ucp cart create --business https://<merchant-domain> --set /line_items/0/item/id='<variant-gid>' --set /line_items/0/quantity=1 --set /context/address_country=CA --format json\n  ucp cart get <cart-id> --business https://<merchant-domain> --format json\n  ucp checkout create --business https://<merchant-domain> --input '{"cart_id":"<cart-id>","line_items":[]}' --format json\n\n  # only if checkout create is not escalated (this merchant escalates → hand off via continue_url):\n  ucp checkout complete <checkout-id> --business https://<merchant-domain> --format json\n\nThemes: Field and Blueprint. Reset: titlebar reset button or pnpm reset.\n`;
}
