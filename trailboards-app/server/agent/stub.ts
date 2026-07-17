// Deterministic intent — the no-key floor (LLD §11). Turns a board context into a search query, a
// short non-interrupting nudge, and (when a real decision is needed) a clarify prompt — using a rule
// table only. No secrets, no network: guarantees the zero-key fork runs the full narrative on the
// live catalog and that stub mode ranks like live mode (weather terms are folded by the connector,
// not here). The live Anthropic path is added in intent.ts at P7; both scrub through the guardrail.
import type { TrailboardContext } from '../../src/types.js';
import type { CatalogFilters } from '../commerce/ucp.js';
import { scrubText } from './guardrail.js';

export interface Intent {
  query: string;
  filterHints?: Partial<CatalogFilters>;
  nudge?: string;
  // A real decision (not browsing) the shopper must make before we can size/style — surfaced as the
  // magenta needs-input card, answered by editing the board (its canonical input surface).
  clarify?: string;
  needsInput?: boolean;
  // Set only by the live agent, which classifies a captioned inspiration image as depicting a
  // product to match ('product') or a place/activity moment ('scene'). Stub mode never captions
  // images, so it never sets this — left undefined, same as today's behavior.
  imageRole?: 'product' | 'scene' | null;
}

// Activity/note phrasing → search terms. Covers outdoor AND city/leisure trips so the query stays
// relevant to whatever the trip actually is. First match per rule contributes; order-independent.
const ACTIVITY_TERMS: { match: RegExp; terms: string[] }[] = [
  { match: /hik|trek|trail|summit|peak/i, terms: ['hiking', 'trail'] },
  { match: /climb|scrambl|via ferrata|boulder/i, terms: ['climbing', 'harness'] },
  { match: /kayak|paddl|canoe|raft|sup/i, terms: ['kayaking', 'waterproof'] },
  { match: /ski|snowboard|snowshoe|alpine/i, terms: ['ski', 'insulated'] },
  { match: /camp|bivouac|backpack|hut/i, terms: ['camping', 'backpack'] },
  { match: /bike|cycl|mtb|gravel/i, terms: ['cycling', 'bike'] },
  { match: /\brun\b|running/i, terms: ['running'] },
  { match: /swim|beach|snorkel|dive|surf/i, terms: ['swimwear', 'beach'] },
  { match: /photo|camera/i, terms: ['camera', 'photography'] },
  { match: /museum|galler|sightsee|tour|explor|walk/i, terms: ['daypack', 'comfortable'] },
  { match: /dinner|dining|restaurant|night out|theatre|theater|concert/i, terms: ['evening', 'outfit'] },
  { match: /business|conference|meeting|work/i, terms: ['travel', 'garment bag'] },
];

// Derive the base query from structured activities + free notes. Falls back to a neutral travel base
// so an early board (destination only) still returns something to browse — for any kind of trip.
export function stubIntent(ctx: TrailboardContext): Intent {
  const terms = new Set<string>();
  const source = [...ctx.activities, ...ctx.notes].join(' ');
  for (const { match, terms: t } of ACTIVITY_TERMS) {
    if (match.test(source)) t.forEach((x) => terms.add(x));
  }
  // Matched an activity → look for gear; nothing yet → neutral travel essentials, not outdoor gear.
  if (terms.size) terms.add('gear');
  else ['travel', 'essentials'].forEach((x) => terms.add(x));
  const query = [...terms].join(' ');

  const clarify = clarifyFor(ctx);
  return {
    query,
    filterHints: {},
    nudge: scrubText(nudgeFor(ctx)) || undefined,
    clarify: scrubText(clarify) || undefined,
    needsInput: Boolean(clarify),
  };
}

// One short, actionable suggestion — only when there's a concrete gap. Silent otherwise (the nudge
// never nags, and never emits price/stock/URLs — that guardrail is enforced in guardrail.ts).
function nudgeFor(ctx: TrailboardContext): string | undefined {
  if (!ctx.activities.length) return 'Add an activity and I’ll match products to it.';
  return undefined;
}

// A clarify prompt is a *decision*, not browsing: fired when there's gear to size but nobody to size
// it for. Answered by adding travelers on the board — the connector already restrains gender-ambiguous
// picks (buildFilters), so this simply asks for the input that would tighten the match.
function clarifyFor(ctx: TrailboardContext): string | undefined {
  if (ctx.activities.length && !ctx.travelers.length) {
    return 'Who’s this trip for? Add travelers so I can match sizes and styles.';
  }
  return undefined;
}
