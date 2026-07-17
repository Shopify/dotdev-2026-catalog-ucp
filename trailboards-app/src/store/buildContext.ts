// Pure fold: BoardState + weather → TrailboardContext (LLD §7/§8.1).
// Deterministic given the same inputs so stub mode has parity with live. No side effects.

import type {
  BoardElement,
  BoardState,
  Profile,
  TrailboardContext,
  Traveler,
  WeatherChip,
} from '../types';
import { deriveProfileFilters } from '../lib/profile';
import { fnv1a } from './hash';

interface BuildOpts {
  weather?: WeatherChip[];
  owned?: string[]; // variant GIDs marked "already own" (populated from cart in P6)
  recommendedIds?: string[]; // product GIDs already shown — dedupe guard
  profile?: Profile; // account-wide shopping defaults → profileFilters
}

// Narrow, defensive payload readers — element payload is Record<string, unknown> on the wire.
function str(payload: Record<string, unknown>, key: string): string | undefined {
  const v = payload[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return out;
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function collectDayDates(elements: BoardElement[], range?: { start: string; end: string }): string[] {
  const fromElements = elements
    .filter((e) => e.type === 'day')
    .map((e) => str(e.payload, 'date'))
    .filter((d): d is string => Boolean(d));
  const source = fromElements.length ? fromElements : range ? enumerateDates(range.start, range.end) : [];
  return [...new Set(source)].sort();
}

function toTraveler(el: BoardElement): Traveler {
  const p = el.payload;
  const lane = p.genderLane;
  return {
    id: el.id,
    sizes: p.sizes && typeof p.sizes === 'object' ? (p.sizes as Record<string, string>) : undefined,
    genderLane:
      lane === 'mens' || lane === 'womens' || lane === 'unspecified' ? lane : undefined,
  };
}

export function buildContext(board: BoardState, opts: BuildOpts = {}): TrailboardContext {
  const { weather = [], owned = [], recommendedIds = [], profile } = opts;
  const wxByDate = new Map(weather.map((w) => [w.date, w]));
  const profileFilters = profile ? deriveProfileFilters(profile.defaults) : undefined;

  const days = collectDayDates(board.elements, board.trip.dateRange).map((date) => ({
    date,
    weather: wxByDate.get(date),
  }));

  const activities = board.elements
    .filter((e) => e.type === 'activity')
    .map((e) => str(e.payload, 'label'))
    .filter((v): v is string => Boolean(v));

  const transport = board.elements
    .filter((e) => e.type === 'transport')
    .map((e) => str(e.payload, 'mode'))
    .filter((v): v is string => Boolean(v));

  const notes = board.elements
    .filter((e) => e.type === 'note')
    .map((e) => str(e.payload, 'text'))
    .filter((v): v is string => Boolean(v));

  const travelers = board.elements.filter((e) => e.type === 'traveler').map(toTraveler);

  const images = board.elements
    .filter((e) => e.type === 'image')
    .map((e) => ({
      id: str(e.payload, 'assetId') ?? e.id,
      contentType: str(e.payload, 'contentType') ?? 'image/jpeg',
      data: str(e.payload, 'data') ?? '',
      description: str(e.payload, 'name') ?? '',
    }))
    .filter((img) => img.data);

  const ctx: Omit<TrailboardContext, 'hash'> = {
    boardId: board.id,
    destination: board.trip.destination,
    dateRange: board.trip.dateRange,
    days,
    activities,
    transport,
    notes,
    travelers,
    images,
    owned,
    recommendedIds,
    profileFilters,
  };

  // Hash the salient fields only — layout (x/y) and title never trigger a resolve.
  const salient = {
    destination: ctx.destination,
    dateRange: ctx.dateRange,
    days: days.map((d) => ({ date: d.date, code: d.weather?.code })),
    activities,
    transport,
    notes,
    travelers,
    images: images.map((i) => ({ id: i.id, description: i.description })),
    owned,
    recommendedIds,
    profileFilters,
  };

  return { ...ctx, hash: fnv1a(salient) };
}
