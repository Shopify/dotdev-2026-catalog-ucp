// UTC-safe date arithmetic for the day track. ISO dates are 'YYYY-MM-DD'; all math
// runs at UTC noon so DST shifts never roll a date across midnight.
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function parse(iso: string): Date | null {
  const dt = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function addDays(iso: string, n: number): string {
  const dt = parse(iso);
  if (!dt) return iso;
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Inclusive list of ISO dates from start..end. Empty if either is invalid or reversed.
export function enumerateDates(start: string, end: string): string[] {
  const from = parse(start);
  const to = parse(end);
  if (!from || !to || from > to) return [];
  const out: string[] = [];
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// "SEP 11" — short day label for the day-head.
export function dayLabel(iso: string): string {
  const dt = parse(iso);
  if (!dt) return iso;
  return `${MONTHS[dt.getUTCMonth()]} ${String(dt.getUTCDate()).padStart(2, '0')}`;
}
