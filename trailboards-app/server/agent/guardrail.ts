// The guardrail (LLD §11). The agent's job is guidance — what to search for, a gentle nudge. Price,
// stock and checkout URLs are the systems' job (catalog + merchant + Checkout Kit). This scrubs any
// agent-authored string so a hallucinated "$120" or "only 2 left" can never reach the shopper as if
// it were truth: the prompt tells the model not to, and this enforces it regardless of what it emits.
const PRICE = /(?:[$£€]\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:usd|eur|gbp|cad|dollars?|euros?)\b)/gi;
const URLISH = /\b(?:https?:\/\/|www\.)\S+/gi;
const STOCK = /\b(?:in stock|out of stock|sold out|only \d+ left|\d+ (?:left|in stock|available)|back in stock)\b/gi;

/** Strip price, stock and URL claims from agent text; collapse the whitespace they leave behind. */
export function scrubText(input: string | undefined): string {
  if (!input) return '';
  return input
    .replace(PRICE, '')
    .replace(URLISH, '')
    .replace(STOCK, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

/** True if a string contains any price/stock/URL claim — used to drop a nudge that's all guardrail-bait. */
export function violates(input: string | undefined): boolean {
  if (!input) return false;
  // Fresh, non-global copies: the module-level /g patterns carry lastIndex state across .test() calls.
  return [PRICE, URLISH, STOCK].some((re) => new RegExp(re.source, 'i').test(input));
}
