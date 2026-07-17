// When the trip dates change, the day track must follow: add columns for new dates,
// drop columns for removed ones. Content on a removed day is DESTRUCTIVE to delete —
// TripEditor surfaces droppedCount as a warning before the user commits (LLD §8, HLD #Q4).
import type { BoardElement } from '../types';
import { enumerateDates } from './day';
import { newId } from './id';

export interface TripDiff {
  nextElements: BoardElement[];
  droppedDates: string[]; // dates leaving the range that hold content
  droppedCount: number; // content elements a save would delete
  addedDates: string[]; // brand-new empty days
}

// Non-day elements are tied to a day by payload.date; those without one always survive.
function elementDate(el: BoardElement): string | undefined {
  const d = el.payload.date;
  return typeof d === 'string' ? d : undefined;
}

export function reconcileDays(
  elements: BoardElement[],
  range: { start: string; end: string },
  createdAt: string,
): TripDiff {
  const dates = enumerateDates(range.start, range.end);
  const inRange = new Set(dates);
  const priorDayDates = new Set(
    elements.filter((e) => e.type === 'day').map((e) => elementDate(e) ?? ''),
  );

  // Rebuild day columns for the new range, reusing prior day ids where the date persists.
  const dayEls: BoardElement[] = dates.map((date, index) => {
    const prior = elements.find((e) => e.type === 'day' && elementDate(e) === date);
    return prior
      ? { ...prior, x: index, payload: { ...prior.payload, date, index } }
      : { id: newId(), type: 'day', x: index, y: 0, payload: { date, index }, createdAt };
  });

  const content = elements.filter((e) => e.type !== 'day');
  const kept = content.filter((e) => {
    const d = elementDate(e);
    return d === undefined || inRange.has(d);
  });
  const dropped = content.filter((e) => {
    const d = elementDate(e);
    return d !== undefined && !inRange.has(d);
  });

  return {
    nextElements: [...dayEls, ...kept],
    droppedDates: [...new Set(dropped.map((e) => elementDate(e)!))].sort(),
    droppedCount: dropped.length,
    addedDates: dates.filter((d) => !priorDayDates.has(d)),
  };
}
