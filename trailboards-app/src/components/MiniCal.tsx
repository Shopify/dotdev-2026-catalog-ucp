// Inline month range-picker. Emits an ISO {start,end} range; click a start, then an
// end (>= start). Clicking before the current start, or after a complete range, restarts.
import { useState } from 'react';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DateRange {
  start?: string;
  end?: string;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function label(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  return `${SHORT[m - 1]} ${d}`;
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
}

export function MiniCal({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const initial = value.start ? new Date(value.start) : new Date();
  const [view, setView] = useState({ y: initial.getFullYear(), m: initial.getMonth() });

  const first = new Date(view.y, view.m, 1);
  const lead = first.getDay(); // blank cells before day 1
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function pick(day: number) {
    const picked = iso(view.y, view.m, day);
    if (!value.start || (value.start && value.end) || picked < value.start) {
      onChange({ start: picked, end: undefined });
    } else {
      onChange({ start: value.start, end: picked });
    }
  }

  function cls(day: number): string {
    const d = iso(view.y, view.m, day);
    const { start, end } = value;
    const c = ['d'];
    if (start && d === start) c.push('start');
    if (end && d === end) c.push('end');
    if (start && end && d > start && d < end) c.push('in');
    return c.join(' ');
  }

  function shift(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  }

  return (
    <div className="mini-cal">
      <div className="mc-head">
        <button type="button" className="mc-nav" aria-label="Previous month" onClick={() => shift(-1)}>
          <svg viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="mo">
          {MONTHS[view.m]} {view.y}
        </span>
        <button type="button" className="mc-nav" aria-label="Next month" onClick={() => shift(1)}>
          <svg viewBox="0 0 24 24">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <div className="mc-grid">
        {DOW.map((d, i) => (
          <span key={`dow-${i}`} className="dow">
            {d}
          </span>
        ))}
        {cells.map((day, i) =>
          day === null ? (
            <span key={`b-${i}`} className="d mute" />
          ) : (
            <button key={`d-${day}`} type="button" className={cls(day)} onClick={() => pick(day)}>
              {day}
            </button>
          ),
        )}
      </div>
      <div className="mc-foot">
        {value.start && value.end ? (
          <>
            <b>{label(value.start)}</b> → <b>{label(value.end)}</b> ·{' '}
            {daysBetween(value.start, value.end)} days
          </>
        ) : value.start ? (
          <>
            <b>{label(value.start)}</b> → pick end date
          </>
        ) : (
          'Pick a start date'
        )}
      </div>
    </div>
  );
}
