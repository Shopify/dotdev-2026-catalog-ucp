// Trigger scheduler (LLD §8.2): folds board → context, skips when the idempotency
// hash is unchanged, and fires `resolve` after the action's delay — immediate for
// structured edits, debounced for free text, coalescing rapid bursts to one call.
import { useEffect, useMemo, useRef } from 'react';
import type { Profile, TrailboardContext, WeatherChip } from '../types';
import { buildContext } from './buildContext';
import { useBoard } from './BoardProvider';

interface SchedulerOpts {
  resolve?: (ctx: TrailboardContext) => void;
  weather?: WeatherChip[];
  owned?: string[];
  recommendedIds?: string[];
  profile?: Profile;
}

// Returns the live context (recomputed each render) for inspection/verification.
export function useResolveScheduler(opts: SchedulerOpts = {}): TrailboardContext {
  const { resolve, weather, owned, recommendedIds, profile } = opts;
  const { state, lastDelayRef } = useBoard();

  const context = useMemo(
    () => buildContext(state, { weather, owned, recommendedIds, profile }),
    [state, weather, owned, recommendedIds, profile],
  );

  const lastHash = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  useEffect(() => {
    const delay = lastDelayRef.current;
    if (delay === null) return; // layout-only change — no resolve
    if (context.hash === lastHash.current) return; // idempotent — skip
    if (timer.current) clearTimeout(timer.current); // coalesce bursts to trailing edge

    timer.current = setTimeout(() => {
      lastHash.current = context.hash;
      resolveRef.current?.(context);
    }, delay);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [context, lastDelayRef]);

  return context;
}
