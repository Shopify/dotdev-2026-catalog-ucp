// The single agent touchpoint (LLD §11). resolveIntent calls getIntent, then does deterministic
// commerce. When ANTHROPIC_API_KEY is present, one structured Messages call turns the board context
// into a shopping intent (search query + optional nudge + optional clarify); with no key — or on any
// failure — it falls back to the deterministic stub, so both modes rank alike. Every field the model
// returns is scrubbed through the guardrail: the agent guides, the systems own price/stock/URL.
import { z } from 'zod';
import { generateText, Output } from 'ai';
import type { TrailboardContext } from '../../src/types.js';
import { intentModel, hasKey } from './provider.js';
import { stubIntent, type Intent } from './stub.js';
import { scrubText, violates } from './guardrail.js';

const IntentSchema = z.object({
  // A short catalog search string — activities/notes → product terms (e.g. "lightweight rain jacket").
  query: z.string(),
  // One gentle, non-interrupting suggestion, or null. Never a price, stock claim, or URL.
  nudge: z.string().nullable(),
  // A decision the shopper must make before sizing/styling (e.g. who the trip is for), or null.
  clarify: z.string().nullable(),
  // Whether the board's inspiration image (if any) depicts an item to shop for ('product') or a
  // place/activity moment that merely informs the query ('scene'). null when there's no image.
  imageRole: z.enum(['product', 'scene']).nullable(),
});

const SYSTEM = [
  'You turn a travel board (destination, dates, activities, notes, travelers) into a shopping intent',
  'for a general retail catalog. The trip can be anything — a city break, a beach holiday, a business',
  'trip, or an outdoor adventure. Return:',
  '- query: a concise search string of product terms implied by the activities, place, and conditions.',
  '  If an image description is given, fold any relevant terms from it into the query too.',
  '- nudge: at most one short, friendly suggestion to improve the board, or null if nothing is missing.',
  '- clarify: a short question ONLY when a real sizing/styling decision is blocked (e.g. items to size',
  '  but no travelers listed), else null.',
  '- imageRole: if an image description is given, classify it as "product" when it depicts an item the',
  '  shopper owns or wants to match (clothing, gear, an accessory) or "scene" when it depicts a place,',
  '  landmark, or activity moment that is not itself something to buy. null when no image is given.',
  'HARD RULE: never state or invent a price, stock level, availability, or any URL — those come from the',
  'catalog and merchants, never from you. Speak only about what to look for and why.',
].join(' ');

function contextDigest(ctx: TrailboardContext): string {
  const days = ctx.days.map((d) => d.weather?.label).filter(Boolean);
  const image = ctx.images[0];
  return JSON.stringify({
    destination: ctx.destination?.name ?? null,
    dateRange: ctx.dateRange ?? null,
    activities: ctx.activities,
    notes: ctx.notes,
    travelers: ctx.travelers,
    weather: [...new Set(days)],
    imageDescription: image?.description || (image ? '(no description available)' : null),
  });
}

// getIntent's result carries how the intent was derived so the trace can attribute it honestly:
// 'agent' = the model answered, 'stub' = no key (deterministic floor), 'fallback' = the model call
// failed and we dropped to the floor (error carries why — e.g. a 404 from a misconfigured gateway).
export type IntentSource = 'agent' | 'stub' | 'fallback';
export interface IntentResult extends Intent {
  source: IntentSource;
  error?: string;
  latencyMs: number;
}

export async function getIntent(ctx: TrailboardContext): Promise<IntentResult> {
  const t0 = Date.now();
  const floor = stubIntent(ctx);
  if (!hasKey) {
    return { ...floor, source: 'stub', latencyMs: Date.now() - t0 };
  }
  try {
    const { output } = await generateText({
      model: intentModel,
      output: Output.object({ schema: IntentSchema }),
      system: SYSTEM,
      messages: [{ role: 'user', content: contextDigest(ctx) }],
    });
    const query = scrubText(output.query) || floor.query; // never let a blank/guardrail-only query win
    const nudge = output.nudge && !violates(output.nudge) ? scrubText(output.nudge) : undefined;
    const clarify = output.clarify && !violates(output.clarify) ? scrubText(output.clarify) : undefined;
    return {
      query,
      filterHints: {},
      nudge: nudge || undefined,
      clarify: clarify || undefined,
      needsInput: Boolean(clarify),
      imageRole: output.imageRole,
      source: 'agent',
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...floor, source: 'fallback', error: msg, latencyMs: Date.now() - t0 };
  }
}

export type { Intent };
