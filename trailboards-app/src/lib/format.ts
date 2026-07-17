// Small display formatters shared across board cards + workspace header.
import type { TripMeta } from '../types';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_TC = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function d(iso: string): Date | null {
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// A board's default identity: "Dolomites, Italy · Jul 2026" (place + trip month/year). There's no
// separate board-name field — the header shows destination + dates once, so the title is derived.
export function defaultBoardTitle(trip?: TripMeta): string {
  const place = trip?.destination?.name?.trim();
  const start = trip?.dateRange?.start ? d(trip.dateRange.start) : null;
  const monthYear = start ? `${MONTHS_TC[start.getUTCMonth()]} ${start.getUTCFullYear()}` : null;
  if (place && monthYear) return `${place} · ${monthYear}`;
  return place || 'Untitled trailboard';
}

// "SEP 11–15" (same month) or "SEP 28 – OCT 02" (cross-month).
export function formatDateRange(range?: TripMeta['dateRange']): string | null {
  if (!range) return null;
  const a = d(range.start);
  const b = d(range.end);
  if (!a || !b) return null;
  const start = `${MONTHS[a.getUTCMonth()]} ${String(a.getUTCDate()).padStart(2, '0')}`;
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${start}–${String(b.getUTCDate()).padStart(2, '0')}`;
  }
  return `${start} – ${MONTHS[b.getUTCMonth()]} ${String(b.getUTCDate()).padStart(2, '0')}`;
}

export function dayCount(range?: TripMeta['dateRange']): number | null {
  if (!range) return null;
  const a = d(range.start);
  const b = d(range.end);
  if (!a || !b || b < a) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

// Compact "edited" relative time from an ISO timestamp.
export function relativeTime(iso: string, now = Date.now()): string {
  const t = d(iso);
  if (!t) return 'draft';
  const diff = Math.max(0, now - t.getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
