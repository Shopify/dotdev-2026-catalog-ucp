let terminal;
let form;
let input;
let canvas;
let reference;
let referenceButton;
let referenceClose;
let referenceTray;
let resetButton;
let themeMount;

// Real values harvested from the live flow, keyed by the placeholder token they replace
// (<merchant-domain>, <product-id>, <variant-gid>, <cart-id>, <checkout-id>). Populated as the
// participant advances so the reference commands become copy/paste-ready with their own data.
let referenceValues = {};

// The state.updatedAt from the previous render, so we only auto-scroll the canvas when a
// mutating command actually changed state (not on help/clear/reference re-renders).
let lastCanvasUpdatedAt = null;

const workshopFlowCommands = [
  `ucp profile init --name <your-name>`,
  `ucp doctor`,
  `cat contexts/trip.json`,
  `ucp catalog search --set /query='packable waterproof rain jacket in a bright colour for a rainy Vancouver Island coastal hike under $75' --set /context/address_country=CA --set /filters/available=true --format json`,
  `ucp discover --business https://<merchant-domain> --format json`,
  `ucp catalog get_product <product-id> --format json`,
  `ucp cart create --business https://<merchant-domain> --set /line_items/0/item/id='<variant-gid>' --set /line_items/0/quantity=1 --set /context/address_country=CA --format json`,
  `ucp cart get <cart-id> --business https://<merchant-domain> --format json`,
  `ucp checkout create --business https://<merchant-domain> --input '{"cart_id":"<cart-id>","line_items":[]}' --format json`
];

// Documented but off the guided spine: `checkout complete` only runs when checkout create finalizes
// without buyer escalation. Workshop merchants require buyer auth/payment to complete, so it escalates
// every time — we surface it in the reference tray, not as a flow step or canvas card.
const checkoutCompleteCommand = `ucp checkout complete <checkout-id> --business https://<merchant-domain> --format json`;

const trailboardThemes = [
  { id: 'field', name: 'Field', detail: 'light field notebook' },
  { id: 'blueprint', name: 'Blueprint', detail: 'architectural cyan' }
];

// Per-command deep links into the ucp-cli reference docs. Each anchor targets the exact heading
// that documents that command, so "docs ↗" lands on the right section — not the file top.
const UCP_CLI_TREE = 'https://github.com/Shopify/ucp-cli/blob/main/skills/ucp';
const UCP_CLI_DOCS = {
  profileInit: `${UCP_CLI_TREE}/references/SETUP.md#profile-init`,
  doctor: `${UCP_CLI_TREE}/references/SETUP.md#doctor`,
  catalogSearch: `${UCP_CLI_TREE}/references/CATALOG.md#1-build-a-search-page-with-filters-and-pagination`,
  catalogProduct: `${UCP_CLI_TREE}/references/CATALOG.md#3-build-a-pdp-with-a-variant-picker`,
  catalogLookup: `${UCP_CLI_TREE}/references/CATALOG.md#2-re-price-or-refresh-saved-product-ids`,
  discover: `${UCP_CLI_TREE}/SKILL.md#introspect-first-capabilities--schemas`,
  cart: `${UCP_CLI_TREE}/SKILL.md#cart`,
  checkout: `${UCP_CLI_TREE}/SKILL.md#checkout`,
  checkoutComplete: `${UCP_CLI_TREE}/SKILL.md#complete`,
  schemas: `${UCP_CLI_TREE}/references/REFERENCE.md#schema-first-payload-diagnostics`,
  skill: `${UCP_CLI_TREE}/SKILL.md`,
  reference: `${UCP_CLI_TREE}/references/REFERENCE.md`
};

// Conceptual docs on shopify.dev — the agent-side story behind the CLI commands.
const AGENT_DOCS = {
  profile: 'https://shopify.dev/docs/agents/profiles',
  authentication: 'https://shopify.dev/docs/agents/get-started/authentication'
};

const HANDOFF_DOCS = {
  ecp: 'https://shopify.dev/docs/agents/carts-and-checkout/ecp',
  checkoutKit: 'https://shopify.dev/docs/agents/carts-and-checkout/checkout-kit'
};

// The `ucp checkout create` lifecycle (per the ucp.dev checkout spec). The card highlights the
// state that matches the live `result.status`; requires_escalation is the buyer-handoff branch
// that yields a continue_url. Sub-states describe the escalation kind, not standalone statuses.
const CHECKOUT_FLOW_STATES = [
  { key: 'incomplete', label: 'incomplete', note: 'fix messages / checkout update' },
  { key: 'requires_escalation', label: 'requires_escalation', note: 'buyer handoff needed', sub: [
    { key: 'requires_buyer_input', label: 'requires_buyer_input', note: 'needs more info' },
    { key: 'requires_buyer_review', label: 'requires_buyer_review', note: 'complete / needs auth' }
  ] },
  { key: 'complete_in_progress', label: 'complete_in_progress', note: 'merchant processing' },
  { key: 'completed', label: 'completed', note: 'order placed / in-protocol' },
  { key: 'canceled', label: 'canceled', note: 'session expired / restart' }
];

const referenceSections = [
  {
    type: 'flow',
    title: 'Vancouver Island flow',
    steps: [
      ['Setup agent', workshopFlowCommands[0], 'Agent appears on the canvas.', UCP_CLI_DOCS.profileInit],
      ['Check local CLI', workshopFlowCommands[1], 'Confirms UCP is available before the commerce path.', UCP_CLI_DOCS.doctor],
      ['Pull intent', workshopFlowCommands[2], 'Buyer intent: Vancouver Island · September weekend.'],
      ['Search Catalog', workshopFlowCommands[3], 'Find useful trip gear from the live Catalog.', UCP_CLI_DOCS.catalogSearch],
      ['Inspect product', workshopFlowCommands[5], 'Copy a real product and variant id from the catalog response.', UCP_CLI_DOCS.catalogProduct],
      ['Discover merchant', workshopFlowCommands[4], "Inspect the merchant's capabilities before assuming cart or checkout.", UCP_CLI_DOCS.discover],
      ['Create cart', workshopFlowCommands[6], 'Cart block joins the route.', UCP_CLI_DOCS.cart],
      ['Read cart', workshopFlowCommands[7], 'Capture merchant-owned state before checkout.', UCP_CLI_DOCS.cart],
      ['Checkout', workshopFlowCommands[8], 'Buyer handoff button appears when a checkout URL is available — the end of the spine.', UCP_CLI_DOCS.checkout]
    ]
  },
  { type: 'commands', title: 'Complete checkout — only if create is not escalated', docsUrl: UCP_CLI_DOCS.checkoutComplete, note: 'Run this only when checkout create returns requires_escalation = false. This merchant requires buyer authentication to complete, so it escalates — hand the buyer off via continue_url instead.', commands: [checkoutCompleteCommand] },
  { type: 'links', title: 'Agent profile & auth', links: [
    ['Agent profile', AGENT_DOCS.profile],
    ['Authenticate your agent', AGENT_DOCS.authentication]
  ] },
  { type: 'commands', title: 'Reset', commands: ['pnpm reset', 'clear'] },
  { title: 'Theme prompts', body: `field     Field Notebook — light field notebook\nblueprint Blueprint — cool architectural cyan, magenta stays the agent signature` },
  { type: 'commands', title: 'Schemas', docsUrl: UCP_CLI_DOCS.schemas, commands: [
    'ucp catalog search --input-schema',
    'ucp catalog lookup --input-schema',
    'ucp cart update --input-schema --business https://<merchant-domain>',
    'ucp checkout create --input-schema --business https://<merchant-domain>',
    'ucp checkout update --input-schema --business https://<merchant-domain>'
  ] },
  { type: 'commands', title: 'Agent skill', docsUrl: UCP_CLI_DOCS.skill, commands: ['ucp skills add'] },
  { type: 'links', title: 'Checkout handoff options', links: [
    ['Embedded Commerce Protocol (ECP)', HANDOFF_DOCS.ecp],
    ['Checkout Kit', HANDOFF_DOCS.checkoutKit]
  ] }
];

const previewState = {
  context: {
    surface: 'travel planning canvas',
    destination: 'Vancouver Island',
    season: 'September weekend',
    weather: 'rain likely',
    activities: ['coastal hike', 'campfire dinner', 'ferry ride'],
    starter_intent: 'a bright, packable rain jacket for rainy coastal hikes under $75'
  },
  theme: 'field',
  updatedAt: null,
  profile: null,
  intent: null,
  catalog: null,
  product: null,
  discovery: null,
  cart: null,
  cartRead: null,
  checkout: null
};

const commandHistory = [];
let historyIndex = 0;

const commandExplainers = [
  { test: /^ucp profile init\b/, inJourney: true, title: 'Setup agent', body: 'Creates a local buyer profile so the CLI can act on your behalf for the rest of the session.', docs: UCP_CLI_DOCS.profileInit },
  { test: /^ucp doctor\b/, inJourney: true, title: 'Check local CLI', body: 'Confirms the UCP CLI is installed and reachable before running any commerce commands.', docs: UCP_CLI_DOCS.doctor },
  { test: /^cat contexts\/trip\.json\b/, inJourney: true, title: 'Pull intent', body: 'Loads the buyer’s stated intent (destination, season, budget) that will drive personalization downstream.' },
  { test: /^ucp catalog search\b/, inJourney: true, title: 'Search Catalog', body: 'Searches the live Shopify Catalog against explicit buyer intent and filters — no merchant chosen yet.', docs: UCP_CLI_DOCS.catalogSearch },
  { test: /^ucp discover\b/, inJourney: true, title: 'Discover merchant', body: 'Asks the merchant what it actually supports (cart, checkout, policies) before assuming any capability.', docs: UCP_CLI_DOCS.discover },
  { test: /^ucp catalog get_product\b/, inJourney: true, title: 'Inspect product', body: 'Resolves a Catalog product ID to full product detail, including the variant ID needed to build a cart.', docs: UCP_CLI_DOCS.catalogProduct },
  { test: /^ucp cart create\b/, inJourney: true, title: 'Create cart', body: 'Creates a merchant-owned cart with the chosen variant — state now lives on the merchant, not the CLI.', docs: UCP_CLI_DOCS.cart },
  { test: /^ucp cart get\b/, inJourney: true, title: 'Read cart', body: 'Reads the cart straight back from the merchant to confirm what was actually stored.', docs: UCP_CLI_DOCS.cart },
  { test: /^ucp checkout create\b/, inJourney: true, title: 'Checkout', body: 'Starts checkout on the merchant’s own flow — the CLI hands off, it doesn’t process payment itself.', docs: UCP_CLI_DOCS.checkout },
  { test: /^ucp checkout complete\b/, inJourney: false, title: 'Complete checkout', body: 'Finalizes a checkout — but only when create returns requires_escalation=false. Most merchants require buyer auth to complete, so this escalates; hand off via continue_url instead.', docs: UCP_CLI_DOCS.checkoutComplete },
  { test: /^ucp checkout (update|cancel)\b/, inJourney: false, title: 'Checkout lifecycle', body: 'A valid checkout follow-up call outside the guided flow — handy once a real checkout session exists.', docs: UCP_CLI_DOCS.checkout },
  { test: /^ucp cart (update|cancel)\b/, inJourney: false, title: 'Cart lifecycle', body: 'A valid cart mutation outside the guided flow — handy for editing quantities or abandoning a cart mid-session.', docs: UCP_CLI_DOCS.cart },
  { test: /^ucp catalog lookup\b/, inJourney: false, title: 'Catalog lookup', body: 'Looks up specific Catalog IDs directly, skipping search — useful once you already know what you want.', docs: UCP_CLI_DOCS.catalogLookup },
  { test: /^ucp skills add\b/, inJourney: false, title: 'Agent skill', body: 'Installs the UCP skill so an agent (not just a human) can drive this same CLI.', docs: UCP_CLI_DOCS.skill },
  { test: /^ucp use\b/, inJourney: false, title: 'Switch context', body: 'Switches the active business/profile context the CLI operates against.' },
  { test: /^ucp\b/, inJourney: false, title: 'UCP command', body: 'A valid UCP CLI call outside the guided Vancouver Island flow.' }
];

// Resolve the doc deep-link for a command, reusing the same patterns that drive the explainers so
// the JSON tree header and the reference tray always point at the same place.
function docsForCommand(command) {
  const trimmed = String(command ?? '').trim();
  return commandExplainers.find(entry => entry.test.test(trimmed))?.docs ?? null;
}

function explainCommand(command) {
  const trimmed = command.trim();
  const match = commandExplainers.find(entry => entry.test.test(trimmed));
  if (match) return { title: match.title, body: match.body, inJourney: match.inJourney };
  if (trimmed === 'pnpm reset' || trimmed === 'clear') return null;
  return { title: 'Command run', body: 'Ran outside the UCP CLI — check the terminal output above for what it did.', inJourney: false };
}

function appendExplainer(explainer) {
  if (!explainer) return;
  const div = document.createElement('div');
  div.className = 'line explain';
  div.innerHTML = `
    <span class="explainer-dot ${explainer.inJourney ? 'in-journey' : 'off-journey'}"></span>
    <span class="explainer-text"><strong>${escapeHtml(explainer.title)}</strong> — ${escapeHtml(explainer.body)}${explainer.inJourney ? '' : ' <em>(not part of the guided flow)</em>'}</span>
  `;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}

async function bootstrap() {
  if (!initElements()) return;
  applyTheme(getActiveTheme());
  renderThemeControls();
  renderReference();
  wireReference();
  wireTerminal();
  wireThemeControls();
  wireCanvas();
  wireTour();
  syncCommandInput();
  append('system', 'UCP lab initialized. Type help to see every command, or click reference (top-right) for copy/run buttons. Start with: ucp doctor');
  await refreshState();
  maybeStartTour();
}

function initElements() {
  terminal = document.querySelector('#terminal');
  form = document.querySelector('#commandForm');
  input = document.querySelector('#commandInput');
  canvas = document.querySelector('#canvas');
  reference = document.querySelector('#reference');
  referenceButton = document.querySelector('#referenceButton');
  referenceClose = document.querySelector('#referenceClose');
  referenceTray = document.querySelector('#referenceTray');
  resetButton = document.querySelector('#resetButton');
  themeMount = document.querySelector('#themeMount');

  const missingRequired = Object.entries({ terminal, form, input, canvas })
    .filter(([, element]) => !element)
    .map(([name]) => name);

  if (missingRequired.length) {
    console.warn(`UCP lab did not initialize. Missing required DOM nodes: ${missingRequired.join(', ')}`);
    return false;
  }

  return true;
}

function wireTerminal() {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const command = input.value.trim();
    if (!command) return;
    commandHistory.push(command);
    historyIndex = commandHistory.length;
    input.value = '';
    syncCommandInput();
    await runCommand(command);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
      return;
    }

    if (event.key === 'ArrowUp' && !event.shiftKey) {
      event.preventDefault();
      recallHistory(-1);
      return;
    }

    if (event.key === 'ArrowDown' && !event.shiftKey) {
      event.preventDefault();
      recallHistory(1);
    }
  });

  input.addEventListener('input', () => {
    historyIndex = commandHistory.length;
    syncCommandInput();
  });

  document.querySelector('.terminal-window')?.addEventListener('click', (event) => {
    // Click-to-focus is a convenience, but it must not hijack the reference tray
    // (copy/run/links, and selecting part of a command) or any active text selection.
    if (event.target.closest('#referenceTray')) return;
    if (window.getSelection()?.toString()) return;
    input.focus();
  });

  resetButton?.addEventListener('click', async () => {
    resetButton.disabled = true;
    append('cmd', 'workshop-demo % pnpm reset');
    try {
      const response = await fetch('/api/reset', { method: 'POST' });
      if (!response.ok) throw new Error(`Reset failed with HTTP ${response.status}`);
      terminal.innerHTML = '';
      append('system', 'Reset complete. Canvas is back to zero.');
      renderCanvas(await response.json());
    } catch (error) {
      append('error', error.message);
    } finally {
      resetButton.disabled = false;
      input.focus();
    }
  });
}

async function runCommand(command) {
  append('cmd', `workshop-demo % ${command}`);
  const explainer = explainCommand(command);
  const response = await fetch('/api/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stdoutCapture = '';
  const stdoutLines = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.type === 'stdout') stdoutCapture += event.data;
      handleEvent(event, stdoutLines);
    }
  }

  const parsedJson = parseFullJson(stdoutCapture);
  if (parsedJson && typeof parsedJson === 'object') {
    stdoutLines.forEach(line => line.remove());
    if (!hasJsonFormatFlag(command)) {
      append('dim', 'Note: responses always render as JSON in this interface.');
    }
    if (isDiscoverCommand(command)) {
      const { shown, omittedKeys } = condenseDiscoverResponse(parsedJson);
      appendJsonTree(shown, command);
      if (omittedKeys.length) {
        append('dim', `Condensed view — omitted: ${omittedKeys.join(', ')}. Full response saved under runs/latest.`);
      }
    } else {
      appendJsonTree(parsedJson, command);
    }
  }

  appendExplainer(explainer);
}

function hasJsonFormatFlag(command) {
  return /--format(?:=|\s+)json\b/.test(command);
}

function isDiscoverCommand(command) {
  return /^ucp discover\b/.test(command.trim());
}

function condenseDiscoverResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { shown: payload, omittedKeys: [] };
  const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const container = isPlainObject(payload.result) ? payload.result : payload;

  const keepKeys = ['profile', 'capabilities', 'business'];
  const shown = {};
  const omittedKeys = [];
  for (const [key, value] of Object.entries(container)) {
    if (keepKeys.includes(key)) shown[key] = value;
    else omittedKeys.push(key);
  }
  if (!Object.keys(shown).length) return { shown: payload, omittedKeys: [] };

  return { shown: container === payload ? shown : { result: shown }, omittedKeys };
}

function handleEvent(event, stdoutLines) {
  if (event.type === 'clear') terminal.innerHTML = '';
  if (event.type === 'stdout') stdoutLines?.push(append('stdout', event.data));
  if (event.type === 'note') append('dim', event.data);
  if (event.type === 'stderr') append('stderr', event.data);
  if (event.type === 'error') append('error', event.data);
  if (event.type === 'start') append('dim', 'running locally...\n');
  if (event.type === 'exit') append('dim', `\nexit ${event.code}\n`);
  if (event.type === 'state') renderCanvas(event.data);
}

function parseFullJson(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { return null; }
}

function appendJsonTree(data, command) {
  const div = document.createElement('div');
  div.className = 'line json-tree-wrap';
  const docsUrl = docsForCommand(command);
  const docLink = docsUrl
    ? `<a class="json-tree-doc" href="${escapeAttr(docsUrl)}" target="_blank" rel="noreferrer">docs ↗</a>`
    : '';
  div.innerHTML = `
    <div class="json-tree-panel">
      <div class="json-tree-head">
        <span>response tree</span>
        <div class="json-tree-actions">
          <button type="button" class="json-tree-toggle" data-json-action="collapse-all">collapse all</button>
          ${docLink}
        </div>
      </div>
      <div class="json-tree-body">${renderJsonNode(data)}</div>
    </div>
  `;
  div.querySelector('[data-json-action="collapse-all"]')?.addEventListener('click', (event) => {
    const panel = event.target.closest('.json-tree-panel');
    const collapsing = event.target.textContent === 'collapse all';
    panel.querySelectorAll('details.json-node').forEach(node => { node.open = !collapsing; });
    event.target.textContent = collapsing ? 'expand all' : 'collapse all';
  });
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

function renderJsonNode(value, keyLabel) {
  const labelHtml = keyLabel !== undefined
    ? `<span class="json-key">${escapeHtml(keyLabel)}</span><span class="json-punct">:</span> `
    : '';

  if (Array.isArray(value)) {
    if (!value.length) return `<div class="json-line">${labelHtml}<span class="json-punct">[]</span></div>`;
    return `
      <details class="json-node" open>
        <summary>${labelHtml}<span class="json-punct">[</span><span class="json-meta">${value.length} item${value.length === 1 ? '' : 's'}</span></summary>
        <div class="json-children">${value.map((item, index) => renderJsonNode(item, String(index))).join('')}</div>
      </details>
    `;
  }

  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return `<div class="json-line">${labelHtml}<span class="json-punct">{}</span></div>`;
    return `
      <details class="json-node" open>
        <summary>${labelHtml}<span class="json-punct">{</span><span class="json-meta">${keys.length} key${keys.length === 1 ? '' : 's'}</span></summary>
        <div class="json-children">${keys.map(key => renderJsonNode(value[key], key)).join('')}</div>
      </details>
    `;
  }

  const valueClass = value === null ? 'json-null' : `json-${typeof value}`;
  const rendered = value === null ? 'null' : typeof value === 'string' ? `"${value}"` : String(value);
  return `<div class="json-line">${labelHtml}<span class="${valueClass}">${escapeHtml(rendered)}</span></div>`;
}

async function refreshState() {
  try {
    const response = await fetch('/api/reset', { method: 'POST' });
    if (!response.ok) throw new Error('No local API in static preview.');
    renderCanvas(await response.json());
  } catch {
    renderCanvas(previewState);
  }
}

function append(kind, text) {
  const div = document.createElement('div');
  div.className = `line ${kind}`;
  div.textContent = text;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
  return div;
}

function syncCommandInput() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
}

function recallHistory(direction) {
  if (!commandHistory.length) return;
  historyIndex = Math.max(0, Math.min(commandHistory.length, historyIndex + direction));
  input.value = commandHistory[historyIndex] ?? '';
  syncCommandInput();
  input.setSelectionRange(input.value.length, input.value.length);
}

function wireCanvas() {
  attachCopyHandler(canvas);
  attachOpenHandler(canvas);
}

function attachOpenHandler(container) {
  if (!container) return;
  container.addEventListener('click', async (event) => {
    const link = event.target.closest('[data-open]');
    if (!link) return;
    event.preventDefault();
    const target = link.getAttribute('data-open');
    if (!target || link.dataset.busy === '1') return;
    const label = link.textContent;
    link.dataset.busy = '1';
    try {
      const res = await fetch('/api/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: target })
      });
      if (!res.ok) throw new Error('open failed');
      link.textContent = 'opened ↗';
    } catch {
      link.textContent = 'open failed';
    }
    setTimeout(() => {
      link.textContent = label;
      delete link.dataset.busy;
    }, 1100);
  });
}

function attachCopyHandler(container) {
  if (!container) return;
  container.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy]');
    if (!button) return;
    const value = button.getAttribute('data-copy');
    if (!value) return;
    const label = button.textContent;
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = 'copied';
      button.classList.add('is-copied');
    } catch {
      button.textContent = 'copy failed';
    }
    button.disabled = true;
    setTimeout(() => {
      button.textContent = label;
      button.classList.remove('is-copied');
      button.disabled = false;
    }, 1100);
  });
}

function wireReference() {
  attachCopyHandler(reference);
  reference?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-run]');
    if (!button) return;
    const command = button.getAttribute('data-run');
    if (!command || button.disabled) return;
    button.disabled = true;
    commandHistory.push(command);
    historyIndex = commandHistory.length;
    try {
      await runCommand(command);
    } finally {
      button.disabled = false;
    }
  });
  if (!referenceButton || !referenceTray) return;

  const setOpen = (open) => {
    referenceTray.hidden = !open;
    referenceButton.setAttribute('aria-expanded', String(open));
  };

  referenceButton.addEventListener('click', () => setOpen(referenceTray.hidden));
  referenceClose?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
}

function wireThemeControls() {
  themeMount?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-theme-choice]');
    if (!button) return;
    const theme = button.getAttribute('data-theme-choice');
    applyTheme(theme);
    localStorage.setItem('tb-theme', theme);
    button.closest('details')?.removeAttribute('open');
    renderThemeControls();
    retintMermaidDiagrams();
  });
}

const TOUR_SEEN_KEY = 'tb-tour-seen';
let tourInstance = null;

function tourFactory() {
  const factory = window.driver?.js?.driver;
  return typeof factory === 'function' ? factory : null;
}

function getTour() {
  if (tourInstance) return tourInstance;
  const factory = tourFactory();
  if (!factory) return null;
  tourInstance = factory({
    showProgress: true,
    allowClose: true,
    overlayColor: '#0B1114',
    overlayOpacity: 0.5,
    stagePadding: 8,
    stageRadius: 10,
    popoverClass: 'tb-tour',
    nextBtnText: 'Next ›',
    prevBtnText: '‹ Back',
    doneBtnText: 'Start typing',
    onDestroyed: () => {
      localStorage.setItem(TOUR_SEEN_KEY, '1');
      input?.focus();
    }
  });
  return tourInstance;
}

// Built fresh on each run so the breadcrumb step is included only once the canvas has rendered it.
function tourSteps() {
  const steps = [
    { element: '.terminal-pane', popover: { title: 'Left is your terminal', description: 'Type real UCP CLI commands here — nothing is autocompleted. The whole journey starts on this side.', side: 'right', align: 'center' } },
    { element: '#commandInput', popover: { title: 'Type help first', description: 'New to the flow? Type <code>help</code> to list every command in this session, then run <code>ucp doctor</code> to begin.', side: 'top', align: 'start' } },
    { element: '.canvas-pane', popover: { title: 'Right shows it live', description: 'Every command renders here on the commerce canvas — profile, catalog, cart, and checkout.', side: 'left', align: 'center' } },
    { element: '#referenceButton', popover: { title: 'References — your safety net', description: 'Lost your place? This lists every command in the session with copy and run buttons.', side: 'bottom', align: 'end' } }
  ];
  if (document.querySelector('.canvas-journey')) {
    steps.push({ element: '.canvas-journey', popover: { title: 'Follow the spine', description: 'This breadcrumb tracks progress: Agent › Catalog › Cart › Checkout. The highlighted step is what comes next.', side: 'bottom', align: 'center' } });
  }
  return steps;
}

function startTour() {
  const tour = getTour();
  if (!tour) return;
  tour.setSteps(tourSteps());
  tour.drive();
}

// The tour opens with a welcome modal (overview + start/skip); the spotlight walk starts on "Start tour".
function openTourIntro() {
  const intro = document.querySelector('#tourIntro');
  if (!intro || typeof intro.showModal !== 'function') {
    startTour();
    return;
  }
  intro.showModal();
}

function closeTourIntro(markSeen) {
  const intro = document.querySelector('#tourIntro');
  if (intro?.open) intro.close();
  if (markSeen) {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    input?.focus();
  }
}

function wireTour() {
  const replay = document.querySelector('#replayTour');
  if (!tourFactory()) {
    // Tour library unavailable (e.g. vendored file missing) — hide the control, keep the lab fully usable.
    if (replay) replay.hidden = true;
    return;
  }
  replay?.addEventListener('click', openTourIntro);

  const intro = document.querySelector('#tourIntro');
  document.querySelector('#tourIntroStart')?.addEventListener('click', () => {
    closeTourIntro(false);
    startTour();
  });
  document.querySelector('#tourIntroSkip')?.addEventListener('click', () => closeTourIntro(true));
  // Esc / backdrop dismiss counts as skip.
  intro?.addEventListener('cancel', () => closeTourIntro(true));
  intro?.addEventListener('click', (event) => {
    if (event.target === intro) closeTourIntro(true);
  });
}

function maybeStartTour() {
  if (!tourFactory()) return;
  if (localStorage.getItem(TOUR_SEEN_KEY) === '1') return;
  openTourIntro();
}

function getActiveTheme() {
  const stored = localStorage.getItem('tb-theme');
  return trailboardThemes.some(theme => theme.id === stored) ? stored : previewState.theme;
}

function applyTheme(theme) {
  const safeTheme = trailboardThemes.some(option => option.id === theme) ? theme : previewState.theme;
  document.documentElement.setAttribute('data-theme', safeTheme);
}

// Canonical commerce spine mirrored on the deck's "From Prompt to Purchase" slide.
// Intent and merchant discovery still render as canvas blocks, but the breadcrumb
// stays at these four milestones so participants always know where they are.
const journeySteps = [
  { id: 'agent', label: 'Agent' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'cart', label: 'Cart' },
  { id: 'checkout', label: 'Checkout' }
];

function journeyDoneMap(state) {
  return {
    agent: !!state.profile,
    catalog: !!state.catalog,
    cart: !!state.cart,
    checkout: !!state.checkout
  };
}

function renderJourneyStepper(state) {
  const done = journeyDoneMap(state);
  const activeId = journeySteps.find(step => !done[step.id])?.id;

  return `
    <ol class="canvas-journey">
      ${journeySteps.map(step => `
        <li class="journey-step ${done[step.id] ? 'done' : step.id === activeId ? 'active' : 'upcoming'}">
          <span class="journey-dot"></span>
          <span class="journey-label">${escapeHtml(step.label)}</span>
        </li>
      `).join('')}
    </ol>
  `;
}

// Maps the command that just ran to the canvas block it produced/updated, so we can scroll that
// card into view.
function blockIdForCommand(command) {
  const c = String(command ?? '').trim();
  if (/^ucp (profile\b|doctor\b)/.test(c)) return 'profile';
  if (/^cat contexts\/trip\.json/.test(c)) return 'intent';
  if (/^ucp catalog (get_product|lookup)\b/.test(c)) return 'product';
  if (/^ucp catalog\b/.test(c)) return 'catalog';
  if (/^ucp discover\b/.test(c)) return 'discovery';
  if (/^ucp cart get\b/.test(c)) return 'cartRead';
  if (/^ucp cart\b/.test(c)) return 'cart';
  if (/^ucp checkout\b/.test(c)) return 'checkout';
  return null;
}

// The merchant's UCP manifest lives at `<business>/.well-known/ucp`. Prefer the exact `--business`
// URL the discover command ran against; fall back to the first product's merchant domain.
function wellKnownUrl(state) {
  const fromCommand = String(state?.discovery?.command ?? '').match(/--business\s+(\S+)/);
  let base = fromCommand?.[1];
  if (!base || base.includes('<')) {
    const product = state?.catalog?.products?.[0];
    const merchant = product?.variants?.[0]?.merchant ?? product?.merchant;
    base = merchant ? `https://${merchant}` : null;
  }
  if (!base) return null;
  if (!/^https?:\/\//.test(base)) base = `https://${base}`;
  return `${base.replace(/\/+$/, '')}/.well-known/ucp`;
}

function renderCanvas(state = previewState) {
  syncReference(state);
  const changed = !!state.updatedAt && state.updatedAt !== lastCanvasUpdatedAt;
  lastCanvasUpdatedAt = state.updatedAt ?? null;
  const previousScrollTop = canvas.querySelector('.canvas-map')?.scrollTop ?? 0;
  try {
    const context = state.context ?? previewState.context;
    const products = state.catalog?.products ?? [];
    const capabilities = state.discovery?.capabilities ?? { ids: [], schemaLinks: [] };
    const blocks = buildCanvasBlocks(state, context, products, capabilities);
    const done = journeyDoneMap(state);
    const stepsDone = journeySteps.filter(step => done[step.id]).length;

    canvas.innerHTML = `
      <div class="canvas-board">
        <header class="canvas-head">
          <div>
            <p class="type-label">live preview</p>
            <h2>Commerce canvas</h2>
          </div>
          <div class="canvas-head-controls">
            <div class="canvas-status">
              <span>${stepsDone}/${journeySteps.length} spine steps</span>
              <b>${escapeHtml(state.updatedAt ? 'live' : 'empty')}</b>
            </div>
          </div>
        </header>

        ${renderJourneyStepper(state)}

        <div class="canvas-map ${blocks.length ? 'has-blocks' : 'is-empty'}">
          ${blocks.length ? `
            <div class="canvas-stage">
              <div class="canvas-track">
                ${blocks.map(block => node(block)).join('')}
              </div>
            </div>
          ` : renderEmptyCanvas()}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Canvas render failed', error);
    canvas.innerHTML = renderCanvasError();
  }
  const nextMap = canvas.querySelector('.canvas-map');
  if (!nextMap) return;
  const targetId = changed ? blockIdForCommand(state.lastCommand) : null;
  const target = targetId && nextMap.querySelector(`.canvas-node.node-${targetId}`)?.closest('.canvas-step');
  if (target) {
    // Restore first so the smooth scroll starts from where the participant was, then reveal
    // the card the latest command produced.
    nextMap.scrollTop = previousScrollTop;
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    nextMap.scrollTop = previousScrollTop;
  }
  renderMermaidDiagrams(canvas);
}

// Configure Mermaid to match the active card theme. Re-read on every render pass so switching
// themes mid-session re-tints the diagram. No-op if the Mermaid global failed to load.
function initMermaid() {
  if (typeof mermaid === 'undefined') return false;
  const cs = getComputedStyle(document.documentElement);
  const cssVar = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose', // local, self-authored definitions
    theme: 'base',
    flowchart: { htmlLabels: true, curve: 'basis', useMaxWidth: true, nodeSpacing: 28, rankSpacing: 40, padding: 6 },
    themeVariables: {
      fontFamily: cssVar('--mono', 'monospace'),
      fontSize: '14px',
      primaryColor: cssVar('--card-chip', '#1b1f2a'),
      primaryTextColor: cssVar('--terminal-fg', '#e6e6e6'),
      primaryBorderColor: cssVar('--contour', '#333'),
      lineColor: cssVar('--terminal-muted', '#888'),
      secondaryColor: cssVar('--card-chip', '#1b1f2a'),
      tertiaryColor: cssVar('--card-chip', '#1b1f2a')
    }
  });
  return true;
}

let mermaidRenderCount = 0;
async function renderMermaidDiagrams(root = document) {
  const holders = root.querySelectorAll('.checkout-flow[data-mermaid-pending]');
  if (!holders.length) return;
  if (!initMermaid()) {
    holders.forEach(holder => holder.removeAttribute('data-mermaid-pending'));
    return;
  }
  for (const holder of holders) {
    holder.removeAttribute('data-mermaid-pending');
    const def = holder.dataset.def ?? '';
    if (!def) continue;
    try {
      const { svg } = await mermaid.render(`checkout-flow-svg-${++mermaidRenderCount}`, def);
      holder.innerHTML = svg; // data-def is retained so the diagram can re-render on theme change
    } catch (error) {
      console.error('Mermaid render failed', error);
      holder.innerHTML = `<pre class="checkout-flow-fallback">${escapeHtml(def)}</pre>`;
    }
  }
}

// Re-render existing checkout diagrams so their node fills/text pick up the newly applied theme
// (Mermaid bakes theme colors into the SVG at render time). The stored data-def is theme-agnostic.
function retintMermaidDiagrams() {
  const holders = document.querySelectorAll('.checkout-flow[data-def]');
  if (!holders.length) return;
  holders.forEach(holder => holder.setAttribute('data-mermaid-pending', ''));
  renderMermaidDiagrams(document);
}

function renderCanvasError() {
  return `
    <div class="canvas-board">
      <div class="empty-canvas">
        <span class="empty-mark">⚠</span>
        <p class="type-label">canvas render error</p>
        <h3>Couldn't render the latest response</h3>
        <p>Check the terminal output above — the raw response is saved under <code>runs/latest</code>.</p>
      </div>
    </div>
  `;
}

function buildCanvasBlocks(state, context, products, capabilities) {
  const blocks = [];

  if (state.profile) {
    const profile = state.profile;
    const agentCapabilities = profile.capabilities?.ids ?? [];
    blocks.push({
      id: 'profile',
      tone: 'agent active',
      label: 'setup agent',
      title: profile.name ? `Agent: ${profile.name}` : 'Agent online',
      body: `
        <div class="data-strip">
          ${metric('status', 'checked')}
          ${metric('agent', profile.name ?? 'unnamed')}
        </div>
        ${agentCapabilities.length ? `
          <p class="cap-caption">agent capabilities</p>
          <div class="pill-row">${agentCapabilities.map(id => pill(capabilityLabel(id))).join('')}</div>
        ` : ''}
        <div class="node-links">
          ${profile.profileUrl ? `<a class="mini-product-link" href="${escapeAttr(profile.profileUrl)}" target="_blank" rel="noreferrer">view agent profile ↗</a>` : ''}
          ${profile.profileDir ? `<a class="mini-product-link" href="#" data-open="${escapeAttr(profile.profileDir)}">reveal profile on disk ↗</a>` : ''}
        </div>
      `
    });
  }

  if (state.intent) {
    blocks.push({
      id: 'intent',
      tone: 'structure active',
      label: 'pull intent',
      title: 'Buyer intent',
      body: `
        <p><strong>${escapeHtml(context.destination)}</strong> · ${escapeHtml(context.season)}</p>
        <div class="pill-row">
          ${pill(context.weather)}
          ${(context.activities ?? []).slice(0, 3).map(pill).join('')}
        </div>
        <p class="node-note">${escapeHtml(context.starter_intent)}</p>
      `
    });
  }

  if (state.catalog) {
    blocks.push({
      id: 'catalog',
      tone: 'agent active large',
      label: 'catalog search',
      title: 'Product candidates',
      body: renderCatalogCards(products)
    });
  }

  if (state.product?.summary) {
    blocks.push({
      id: 'product',
      tone: 'agent active',
      label: 'inspect product',
      title: 'Product detail',
      body: renderCatalogCards([state.product.summary])
    });
  }

  if (state.discovery) {
    const capabilityIds = capabilities.ids ?? [];
    const agentCapabilityIds = state.profile?.capabilities?.ids ?? [];
    const wellKnown = wellKnownUrl(state);
    const profileDir = state.profile?.profileDir ?? null;
    blocks.push({
      id: 'discovery',
      tone: 'secondary active',
      label: 'merchant capabilities',
      title: 'Capabilities',
      body: `
        <div class="pill-row">${capabilityIds.length ? capabilityIds.map(id => pill(capabilityLabel(id))).join('') : pill('raw output captured')}</div>
        <p class="cap-heading">agent &times; merchant negotiation</p>
        ${renderCapabilityMatrix(agentCapabilityIds, capabilityIds)}
        <p class="node-note">Merchant capabilities are now available for the flow.</p>
        <div class="node-links">
          ${profileDir ? `<a class="mini-product-link" href="#" data-open="${escapeAttr(profileDir)}">reveal profile on disk ↗</a>` : ''}
          ${wellKnown ? `<a class="mini-product-link" href="${escapeAttr(wellKnown)}" target="_blank" rel="noreferrer">view merchant .well-known/ucp ↗</a>` : ''}
        </div>
      `
    });
  }

  if (state.cart) {
    const summary = state.cart.summary ?? {};
    blocks.push({
      id: 'cart',
      tone: 'structure active',
      label: 'cart',
      title: 'Added to cart',
      body: `
        ${renderLineItems(summary.lineItems)}
        ${renderTotals(summary.totals)}
        ${copyRow('cart id', summary.id)}
        ${renderNotes(summary.messages)}
      `
    });
  }

  if (state.cartRead) {
    const summary = state.cartRead.summary ?? {};
    blocks.push({
      id: 'cartRead',
      tone: 'structure active',
      label: 'read cart',
      title: 'Cart read back',
      body: `
        <p class="node-note">Merchant-owned cart state, read straight back from the merchant.</p>
        ${renderLineItems(summary.lineItems)}
        ${renderTotals(summary.totals)}
        ${copyRow('cart id', summary.id)}
        ${renderNotes(summary.messages)}
      `
    });
  }

  if (state.checkout) {
    const summary = state.checkout.summary ?? {};
    blocks.push({
      id: 'checkout',
      tone: 'agent active',
      label: 'checkout',
      title: 'Buyer handoff',
      body: `
        <div class="data-strip">
          ${metric('status', summary.status ?? 'captured')}
          ${summary.total ? metric('total', summary.total) : metric('handoff', summary.continueUrl ? 'ready' : 'pending')}
        </div>
        ${renderLineItems(summary.lineItems)}
        ${renderTotals(summary.totals)}
        ${renderNotes(summary.messages)}
        ${renderCheckoutFlow(summary)}
        ${summary.continueUrl
          ? `${copyRow('continue url', summary.continueUrl)}<a class="handoff" href="${escapeAttr(summary.continueUrl)}" target="_blank" rel="noreferrer">open checkout handoff ↗</a>`
          : '<p class="node-note">No continue_url parsed yet.</p>'}
        <p class="node-note">Next in the spec is <code>ucp checkout complete</code> — but only when the checkout finalizes without buyer escalation. This merchant requires buyer authentication to complete, so the agent hands off via <code>continue_url</code> instead of completing in-protocol.</p>
        <p class="cap-caption">other handoff options</p>
        <div class="node-links">
          <a class="mini-product-link" href="${HANDOFF_DOCS.ecp}" target="_blank" rel="noreferrer">embedded commerce protocol ↗</a>
          <a class="mini-product-link" href="${HANDOFF_DOCS.checkoutKit}" target="_blank" rel="noreferrer">checkout kit ↗</a>
        </div>
      `
    });
  }

  return blocks;
}

function renderThemeControls() {
  if (!themeMount) return;
  themeMount.innerHTML = renderThemePicker(getActiveTheme());
}

function renderThemePicker(activeTheme) {
  const active = trailboardThemes.find(theme => theme.id === activeTheme) ?? trailboardThemes[0];

  return `
    <details class="theme-picker">
      <summary aria-label="Choose Trailboards theme">
        <span>Theme</span>
        <strong>${escapeHtml(active.name)}</strong>
      </summary>
      <div class="theme-options" aria-label="Trailboards theme picker">
        ${trailboardThemes.map(theme => `
          <button class="theme-chip ${theme.id === activeTheme ? 'is-active' : ''}" type="button" data-theme-choice="${escapeAttr(theme.id)}" aria-pressed="${theme.id === activeTheme}">
            <span>${escapeHtml(theme.name)}</span>
            <small>${escapeHtml(theme.detail)}</small>
          </button>
        `).join('')}
      </div>
    </details>
  `;
}

function renderEmptyCanvas() {
  return `
    <div class="empty-canvas">
      <span class="empty-mark">✦</span>
      <p class="type-label">waiting for first command</p>
      <h3>Vancouver Island · September weekend</h3>
      <p>Type in the terminal. Each successful UCP action drops a new commerce block onto this canvas.</p>
    </div>
  `;
}

// Card list: one card per product showing its matched variant (catalog search returns a single
// variant per product) plus the product's full option space (Color/Size + values) as chips.
function renderCatalogCards(products) {
  if (!products.length) {
    return '<p class="node-note">No product cards parsed yet. The raw JSON stays in the terminal and under <code>runs/latest</code>.</p>';
  }

  return `
    <ul class="catalog-cards">
      ${products.map(product => {
        const variant = product.variants?.[0] ?? {};
        const options = product.options ?? [];
        const badge = variant.available === true ? '<span class="variant-badge is-in">in stock</span>'
          : variant.available === false ? '<span class="variant-badge is-out">sold out</span>' : '';
        const variantLabel = variant.title || 'single variant';
        return `
        <li class="catalog-card">
          <div class="catalog-card-head">
            ${product.image ? `<img src="${escapeAttr(product.image)}" alt="" />` : '<span class="product-glyph">✦</span>'}
            <div class="catalog-card-heading">
              <b>${escapeHtml(product.title)}</b>
              <span>${escapeHtml(product.merchant ?? 'merchant unknown')}</span>
              ${product.price ? `<em>${escapeHtml(product.price)}</em>` : ''}
            </div>
            ${badge}
          </div>
          <div class="catalog-card-variant">
            <span class="option-name">variant</span>
            <span class="catalog-variant-label">${escapeHtml(variantLabel)}</span>
          </div>
          ${options.length ? `
            <div class="catalog-card-options">
              ${options.map(option => `
                <div class="option-row">
                  <span class="option-name">${escapeHtml(option.name)}</span>
                  <div class="option-values">
                    ${option.values.map(value => `<span class="option-chip">${escapeHtml(value)}</span>`).join('')}
                  </div>
                </div>`).join('')}
            </div>` : '<p class="node-note">No options listed for this product.</p>'}
          <div class="catalog-card-copy">
            ${(variant.merchant ?? product.merchant) ? copyRow('business', `https://${variant.merchant ?? product.merchant}`) : ''}
            ${variant.id ? copyRow('variant', variant.id) : ''}
          </div>
        </li>`;
      }).join('')}
    </ul>
  `;
}

function renderProductTree(products) {
  if (!products.length) {
    return '<p class="node-note">No product cards parsed yet. The raw JSON stays in the terminal and under <code>runs/latest</code>.</p>';
  }

  return `
    <div class="product-tree">
      ${products.slice(0, 5).map((product, index) => {
        const variants = product.variants?.length ? product.variants : (product.variantId ? [{ id: product.variantId, merchant: product.merchant }] : []);
        const merchants = [...new Set(variants.map(variant => variant.merchant).filter(Boolean))];
        const sellerLine = merchants.length > 1 ? `${merchants.length} sellers` : (merchants[0] ?? 'merchant unknown');
        return `
        <details class="product-branch" open>
          <summary class="product-branch-head">
            <span class="branch-chevron" aria-hidden="true">▸</span>
            <div class="mini-product-top">
              ${product.image ? `<img src="${escapeAttr(product.image)}" alt="" />` : `<span class="product-glyph">${index + 1}</span>`}
              <div class="mini-product-heading">
                <b>${escapeHtml(product.title)}</b>
                <span>${escapeHtml(sellerLine)}</span>
                ${product.price ? `<em>${escapeHtml(product.price)}</em>` : ''}
              </div>
            </div>
            <span class="variant-count">${variants.length} variant${variants.length === 1 ? '' : 's'}</span>
          </summary>
          <div class="product-branch-body">
            <ul class="variant-list">
              ${variants.map((variant, order) => variantLeaf(variant, order)).join('')}
            </ul>
            ${product.url ? `<a class="mini-product-link" href="${escapeAttr(product.url)}" target="_blank" rel="noreferrer">view product ↗</a>` : ''}
          </div>
        </details>`;
      }).join('')}
    </div>
  `;
}

// One leaf per variant. The business (seller.domain) and the variant GID are the two values a
// participant copies to build the cart, so both get their own copy row on the same variant.
function variantLeaf(variant, order) {
  const meta = [variant.title, variant.price].filter(Boolean).map(escapeHtml).join(' · ');
  const badge = variant.available === true ? '<span class="variant-badge is-in">in stock</span>'
    : variant.available === false ? '<span class="variant-badge is-out">sold out</span>' : '';
  const heading = meta || badge ? `<div class="variant-leaf-head"><span>${meta || `variant ${order + 1}`}</span>${badge}</div>` : '';
  return `
    <li class="variant-leaf">
      ${heading}
      ${variant.merchant ? copyRow('business', `https://${variant.merchant}`) : ''}
      ${copyRow('variant', variant.id)}
    </li>
  `;
}

function copyRow(label, value) {
  if (!value) return '';
  return `
    <div class="copy-row">
      <span class="copy-row-label">${escapeHtml(label)}</span>
      <code title="${escapeAttr(value)}">${escapeHtml(value)}</code>
      <button type="button" class="copy-chip" data-copy="${escapeAttr(value)}">copy</button>
    </div>
  `;
}

function node(block) {
  const step = block.tone.split(' ')[0];
  return `
    <div class="canvas-step ${escapeAttr(step)}">
      <span class="step-dot"></span>
      <article class="canvas-node node-${block.id} ${block.tone}">
        <span class="node-label">${escapeHtml(block.label)}</span>
        <h3>${escapeHtml(block.title)}</h3>
        ${block.body}
      </article>
    </div>
  `;
}

function metric(label, value) {
  return `<span class="metric"><em>${escapeHtml(label)}</em><strong>${escapeHtml(value ?? '—')}</strong></span>`;
}

function pill(value) {
  return `<span class="badge">${escapeHtml(value)}</span>`;
}

// UCP capability ids are namespaced (dev.ucp.shopping.catalog.search, dev.shopify.catalog.global).
// Shorten for display: drop the shared dev.ucp.shopping. prefix, and the leading dev. from Shopify
// extensions. Comparison always keys off the full id, never this label.
function capabilityLabel(id) {
  return String(id)
    .replace(/^dev\.ucp\.shopping\./, '')
    .replace(/^dev\.shopify\./, 'shopify.');
}

// A capability comparison: the agent (what the CLI can drive) vs the merchant (what discovery
// advertised). The intersection is what actually works end to end. Rows are the union of both id
// sets, agent order first, then any merchant-only ids.
function renderCapabilityMatrix(agentIds = [], merchantIds = []) {
  if (!agentIds.length) {
    return '<p class="node-note">Run <code>ucp profile init</code> to compare agent capabilities.</p>';
  }
  const agentSet = new Set(agentIds);
  const merchantSet = new Set(merchantIds);
  const rows = [...new Set([...agentIds, ...merchantIds])];
  return `
    <table class="cap-matrix">
      <thead>
        <tr><th>capability</th><th>agent</th><th>merchant</th></tr>
      </thead>
      <tbody>
        ${rows.map(id => `
          <tr>
            <td>${escapeHtml(capabilityLabel(id))}</td>
            <td>${capCell(agentSet.has(id))}</td>
            <td>${capCell(merchantSet.has(id))}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

function capCell(has) {
  return has
    ? '<span class="cap-yes" title="supported">✓</span>'
    : '<span class="cap-no" title="not supported">✗</span>';
}

// A standard cart-style line list: thumbnail, title, quantity, and line price.
function renderLineItems(lineItems = []) {
  if (!lineItems?.length) return '';
  return `
    <ul class="cart-lines">
      ${lineItems.map(line => `
        <li class="cart-line">
          ${line.image ? `<img src="${escapeAttr(line.image)}" alt="" />` : '<span class="product-glyph">✦</span>'}
          <div class="cart-line-info">
            <b>${escapeHtml(line.title)}</b>
            <span>qty ${escapeHtml(String(line.quantity ?? 1))}</span>
          </div>
          ${line.price ? `<em>${escapeHtml(line.price)}</em>` : ''}
        </li>`).join('')}
    </ul>
  `;
}

// Subtotal / tax / total rows, with the grand total emphasized.
function renderTotals(totals = []) {
  if (!totals?.length) return '';
  return `
    <dl class="cart-totals">
      ${totals.map(entry => `
        <div class="cart-total-row ${entry.type === 'total' ? 'is-grand' : ''}">
          <dt>${escapeHtml(entry.label)}</dt>
          <dd>${escapeHtml(entry.amount)}</dd>
        </div>`).join('')}
    </dl>
  `;
}

// Human-readable merchant messages (stock warnings, address-required errors) as plain notes.
function renderNotes(messages = []) {
  if (!messages?.length) return '';
  return `<div class="node-messages">${messages.map(message => `<p class="node-note">${escapeHtml(message)}</p>`).join('')}</div>`;
}

// Emit the checkout lifecycle as a Mermaid flowchart definition. The definition is theme-agnostic
// (node colors come from Mermaid's themeVariables at render time; the active-node accent comes from
// CSS), so it can be re-rendered verbatim on a theme switch. The definition is stashed in a data-def
// attribute; renderMermaidDiagrams() reads it back after the canvas HTML lands and swaps in the SVG.
// The node matching the live result.status (and the continue_url terminal when a handoff exists) is
// tagged with the `active` class for highlighting.
function renderCheckoutFlow(summary = {}) {
  const definition = buildCheckoutFlowDefinition(summary);
  return `
    <p class="cap-caption">checkout lifecycle</p>
    <div class="checkout-flow" data-mermaid-pending data-def="${escapeAttr(definition)}" role="img" aria-label="UCP checkout lifecycle flowchart"></div>
  `;
}

function buildCheckoutFlowDefinition(summary = {}) {
  const active = String(summary.status ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  const hasHandoff = Boolean(summary.continueUrl);

  const lines = ['flowchart TD'];
  lines.push('  CREATE(["ucp checkout create"]) --> STATUS{"result.status"}');

  // requires_escalation is the buyer-handoff branch this card is about, so keep it lit regardless
  // of the live status; the node matching result.status (and continue_url) lights up on top.
  const activeNodes = ['requires_escalation'];
  for (const state of CHECKOUT_FLOW_STATES) {
    lines.push(`  STATUS --> ${state.key}["${state.label}"]`);
    const subActive = state.sub?.some(s => s.key === active);
    if (state.key === active || subActive) activeNodes.push(state.key);
    if (!state.sub) continue;
    for (const s of state.sub) {
      lines.push(`  ${state.key} --> ${s.key}["${s.label}"]`);
      if (s.key === active) activeNodes.push(s.key);
    }
    // continue_url is only produced by the requires_escalation branch.
    lines.push(`  ${state.key} --> HANDOFF["result.continue_url"]`);
    if (hasHandoff) activeNodes.push('HANDOFF');
  }

  // Marker class only — the accent stroke/fill/label color for active nodes live in the stylesheet
  // so they track the current theme without rebuilding the definition. (Keeping colors out of
  // classDef also avoids feeding it comma-bearing values like rgba(), which break its parser.)
  lines.push('  classDef active stroke-width:2px;');
  const unique = [...new Set(activeNodes)];
  if (unique.length) lines.push(`  class ${unique.join(',')} active`);

  return lines.join('\n');
}


// Pull the first product's merchant/variant/product ids plus any cart/checkout ids out of live
// state. The first product is what the canvas cards surface first, so the reference commands
// line up with the top card a participant is looking at.
function referenceValuesFromState(state) {
  const first = state?.catalog?.products?.[0] ?? {};
  const firstVariant = first.variants?.[0] ?? {};
  const values = {};
  const merchant = firstVariant.merchant ?? first.merchant;
  if (merchant) values['merchant-domain'] = merchant;
  if (first.productId) values['product-id'] = first.productId;
  const variantId = firstVariant.id ?? first.variantId;
  if (variantId) values['variant-gid'] = variantId;
  const cartId = state?.cart?.summary?.id;
  if (cartId) values['cart-id'] = cartId;
  const checkoutId = state?.checkout?.summary?.id;
  if (checkoutId) values['checkout-id'] = checkoutId;
  return values;
}

function syncReference(state) {
  referenceValues = referenceValuesFromState(state);
  renderReference();
}

// Swap `<token>` placeholders in a command for real values. Returns the plain filled command
// (for copy/run) plus highlighted HTML that marks each resolved token, and whether anything
// was filled at all (so the row can flag itself as ready).
function fillCommand(command, values) {
  const placeholder = /<([a-z0-9-]+)>/gi;
  const filled = command.replace(placeholder, (whole, key) => values[key] ?? whole);
  return { filled, html: highlightCommand(command, values), live: filled !== command };
}

// Token-level syntax highlighting for the reference command boxes. Walks the raw command word by
// word (keeping quoted spans intact), coloring: program → subcommands → flags → strings → args.
// Placeholders resolve to their live flow value (magenta) when known, else the dim <token> slot.
function highlightCommand(command, values = {}) {
  let html = '';
  let i = 0;
  let word = 0;      // 0 = the program itself
  let sawArg = false; // subcommand coloring stops once a flag/arg/path/string appears
  const n = command.length;
  while (i < n) {
    if (/\s/.test(command[i])) {
      let j = i;
      while (j < n && /\s/.test(command[j])) j++;
      html += escapeHtml(command.slice(i, j));
      i = j;
      continue;
    }
    // Read one word, treating a quoted run (which may contain spaces) as part of the word.
    let j = i;
    let quote = null;
    while (j < n) {
      const c = command[j];
      if (quote) { if (c === quote) quote = null; j++; continue; }
      if (c === "'" || c === '"') { quote = c; j++; continue; }
      if (/\s/.test(c)) break;
      j++;
    }
    const token = command.slice(i, j);
    html += highlightWord(token, values, word === 0, sawArg);
    if (token.startsWith('--') || !/^[a-z0-9_]+$/i.test(token)) sawArg = true;
    word += 1;
    i = j;
  }
  return html;
}

function highlightWord(token, values, isProgram, sawArg) {
  if (isProgram) return `<span class="tok-cmd">${escapeHtml(token)}</span>`;
  if (token.startsWith('--')) return `<span class="tok-flag">${escapeHtml(token)}</span>`;
  if (!sawArg && /^[a-z0-9_]+$/i.test(token)) return `<span class="tok-sub">${escapeHtml(token)}</span>`;
  return highlightValue(token, values);
}

// A value word: may hold quoted strings, <placeholders>, and plain runs (paths, urls, key=value).
function highlightValue(token, values) {
  let out = '';
  let i = 0;
  const n = token.length;
  while (i < n) {
    const c = token[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && token[j] !== c) j++;
      j = Math.min(j + 1, n);
      out += highlightString(token.slice(i, j), values);
      i = j;
      continue;
    }
    if (c === '<') {
      const gt = token.indexOf('>', i);
      const key = gt !== -1 ? token.slice(i + 1, gt) : '';
      if (gt !== -1 && /^[a-z0-9-]+$/i.test(key)) {
        out += placeholderSpan(key, values);
        i = gt + 1;
        continue;
      }
    }
    let j = i;
    while (j < n && token[j] !== "'" && token[j] !== '"' && token[j] !== '<') j++;
    out += escapeHtml(token.slice(i, j));
    i = j;
  }
  return out;
}

// A quoted string (quotes included). Any <placeholder> inside keeps its own color; the rest is string-hued.
function highlightString(str, values) {
  let out = '';
  let i = 0;
  const n = str.length;
  while (i < n) {
    const lt = str.indexOf('<', i);
    if (lt === -1) { out += `<span class="tok-str">${escapeHtml(str.slice(i))}</span>`; break; }
    const gt = str.indexOf('>', lt);
    const key = gt !== -1 ? str.slice(lt + 1, gt) : '';
    if (gt !== -1 && /^[a-z0-9-]+$/i.test(key)) {
      if (lt > i) out += `<span class="tok-str">${escapeHtml(str.slice(i, lt))}</span>`;
      out += placeholderSpan(key, values);
      i = gt + 1;
    } else {
      out += `<span class="tok-str">${escapeHtml(str.slice(i, lt + 1))}</span>`;
      i = lt + 1;
    }
  }
  return out;
}

function placeholderSpan(key, values) {
  const value = values[key];
  return value
    ? `<span class="ref-token-live">${escapeHtml(value)}</span>`
    : `<span class="tok-arg">&lt;${escapeHtml(key)}&gt;</span>`;
}

function renderReference() {
  if (!reference) return;

  reference.innerHTML = referenceSections.map((section) => {
    if (section.type === 'flow') {
      return `
        <section class="ref-section ref-flow-section">
          <h3>${escapeHtml(section.title)}</h3>
          <ol class="ref-flow">
            ${section.steps.map(([title, command, note, docUrl]) => `
              <li>
                <span class="ref-step-dot" aria-hidden="true"></span>
                <div>
                  <b>${escapeHtml(title)}</b>
                  ${commandRow(command, docUrl)}
                  <p>${escapeHtml(note)}</p>
                </div>
              </li>
            `).join('')}
          </ol>
        </section>
      `;
    }

    if (section.type === 'commands') {
      return `
        <section class="ref-section">
          <h3>${escapeHtml(section.title)}</h3>
          ${section.note ? `<p class="ref-section-note">${escapeHtml(section.note)}</p>` : ''}
          <div class="ref-command-list">${section.commands.map((command) => commandRow(command, section.docsUrl)).join('')}</div>
        </section>
      `;
    }

    if (section.type === 'links') {
      return `
        <section class="ref-section">
          <h3>${escapeHtml(section.title)}</h3>
          <div class="ref-link-list">${section.links.map(([label, url]) => `<a class="ref-link" href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)} ↗</a>`).join('')}</div>
        </section>
      `;
    }

    return `
      <section class="ref-section">
        <h3>${escapeHtml(section.title)}</h3>
        <pre class="code">${escapeHtml(section.body)}</pre>
      </section>
    `;
  }).join('');
}

function commandRow(command, docUrl) {
  const { filled, html, live } = fillCommand(command, referenceValues);
  // Always render the doc slot (empty when there's no link) so every command box keeps the same width.
  const docLink = docUrl
    ? `<a class="ref-command-doc" href="${escapeAttr(docUrl)}" target="_blank" rel="noreferrer">docs ↗</a>`
    : `<span class="ref-command-doc is-empty" aria-hidden="true"></span>`;
  return `
    <div class="ref-command${live ? ' is-live' : ''}">
      <code>${html}</code>
      <button type="button" class="copy-chip" data-copy="${escapeAttr(filled)}">copy</button>
      <button type="button" class="run-chip" data-run="${escapeAttr(filled)}">run</button>
      ${docLink}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
