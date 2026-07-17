// The Anthropic provider — the one place a key turns Trailboards from stub to intelligent. Base URL,
// model and key all come from .env so the same code talks to the public Anthropic API or any
// Anthropic-compatible gateway: swap .env, not code. Absent key → hasKey=false → the deterministic
// stub is the floor (LLD §11), so the zero-key clone still runs the full narrative on the live catalog.
import { config } from 'dotenv';
import { createAnthropic } from '@ai-sdk/anthropic';

// override:true so a local .env wins over ambient ANTHROPIC_* the shell may already export.
config({ override: true });

const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
const baseURL = (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1').replace(/\/+$/, '');
// Default to the latest capable model; override per-deploy via .env.
const modelId = (process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8').trim();

/** True only when a real key is configured. When false, everything falls back to the stub. */
export const hasKey = Boolean(apiKey);
export const modelName = modelId;

const provider = createAnthropic({ baseURL, apiKey: apiKey || 'not-needed' });

/** The model that turns a board context into a shopping intent (query + nudge). */
export const intentModel = provider(modelId);
