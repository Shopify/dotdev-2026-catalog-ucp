// Consolidated trip editor (HLD #Q4): one popover edits destination AND dates. Changing
// dates reconciles the day track; if that would delete content on days leaving the trip,
// a destructive warning shows the count before the user commits.
import { useState } from 'react';
import { useBoard } from '../store/BoardProvider';
import { MiniCal, type DateRange } from './MiniCal';
import { DestinationSearch } from './DestinationSearch';
import { PRESETS, chipLabel, type Destination } from '../lib/destinations';
import { geocodePlace } from '../services/geocode';
import { reconcileDays } from '../lib/tripReconcile';
import { formatDateRange, dayCount } from '../lib/format';

export function TripEditor() {
  const { state, dispatch } = useBoard();
  const [open, setOpen] = useState(false);
  const [destName, setDestName] = useState('');
  const [destination, setDestination] = useState<Destination | null>(null);
  const [range, setRange] = useState<DateRange>({});
  const [geoWarning, setGeoWarning] = useState(false);

  function resetDraft() {
    setDestName(state.trip.destination?.name ?? '');
    setDestination(state.trip.destination ?? null);
    setRange(state.trip.dateRange ?? {});
    setGeoWarning(false);
  }

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    if (!open) resetDraft();
    setOpen((o) => !o);
  }

  function pickPreset(p: Destination) {
    setDestination(p);
    setDestName(p.name);
    setGeoWarning(false);
  }

  const complete = Boolean(range.start && range.end);
  const cur = state.trip.dateRange;
  const changed =
    destName.trim() !== (state.trip.destination?.name ?? '') ||
    range.start !== cur?.start ||
    range.end !== cur?.end;

  // Preview the day-track impact of the new dates (destructive-drop count).
  const diff =
    complete && range.start && range.end
      ? reconcileDays(state.elements, { start: range.start, end: range.end }, new Date().toISOString())
      : null;

  async function save() {
    if (!complete || !range.start || !range.end) return;
    // Typed destinations geocode on save so ships_to gets a real country (presets already have
    // one). When geocoding can't place it, warn instead of silently saving a destination with no
    // country — a second click on Save proceeds anyway.
    let dest = destination;
    if (!dest) {
      dest = await geocodePlace(destName);
      if (!dest) {
        if (!geoWarning) {
          setGeoWarning(true);
          return;
        }
        dest = { name: destName.trim(), lat: 0, lng: 0 };
      }
    }
    const trip = {
      destination: dest,
      dateRange: { start: range.start, end: range.end },
    };
    const next = reconcileDays(
      state.elements,
      { start: range.start, end: range.end },
      new Date().toISOString(),
    );
    dispatch({ type: 'reconcileTrip', trip, elements: next.nextElements });
    setOpen(false);
  }

  const summaryDest = state.trip.destination?.name ?? 'Set destination';
  const summaryDates = formatDateRange(state.trip.dateRange) ?? 'add dates';

  return (
    <details className="tripedit" open={open}>
      <summary onClick={toggle}>
        <span className="trip" title="Edit trip">
          <svg viewBox="0 0 24 24">
            <path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <span className="t-dest">{summaryDest}</span>
          <span className="t-dot">·</span>
          <span className="t-dates">{summaryDates}</span>
          <span className="t-edit">
            <svg viewBox="0 0 24 24">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
            Edit
          </span>
        </span>
      </summary>

      <div className="trippop">
        <div className="tp-h">
          <b>Edit trip</b>
          <span className="tp-sub">changes reflect on the board</span>
        </div>
        <div className="tp-body">
          <span className="tp-lab">Destination</span>
          <DestinationSearch
            value={destName}
            inputClassName="tp-dest-in"
            onChange={(name) => {
              setDestName(name);
              setDestination(null);
              setGeoWarning(false);
            }}
            onPick={(dest) => {
              setDestination(dest);
              setGeoWarning(false);
            }}
          />
          <div className="tp-dests">
            {PRESETS.map((p) => (
              <span
                key={p.name}
                className={destName === p.name ? 'dchip on' : 'dchip'}
                onClick={() => pickPreset(p)}
              >
                {chipLabel(p.name)}
              </span>
            ))}
          </div>

          <span className="tp-lab mt">Dates</span>
          <MiniCal value={range} onChange={setRange} />
        </div>

        {geoWarning ? (
          <div className="tp-warn bad">
            <svg viewBox="0 0 24 24">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
            <span>
              Couldn&rsquo;t recognize &ldquo;{destName}&rdquo; as a place. Pick a suggestion
              above, or press Save again to continue anyway — recommendations may be less relevant
              without a resolved destination.
            </span>
          </div>
        ) : diff && diff.droppedCount > 0 ? (
          <div className="tp-warn bad">
            <svg viewBox="0 0 24 24">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
            <span>
              Deletes {diff.droppedCount} element{diff.droppedCount > 1 ? 's' : ''} on{' '}
              {diff.droppedDates.length} day{diff.droppedDates.length > 1 ? 's' : ''} leaving the
              trip.
            </span>
          </div>
        ) : diff && diff.addedDates.length > 0 ? (
          <div className="tp-warn ok">
            <svg viewBox="0 0 24 24">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span>
              Adds {diff.addedDates.length} new day{diff.addedDates.length > 1 ? 's' : ''}.
            </span>
          </div>
        ) : null}

        <div className="tp-foot">
          <span className="tp-readout">
            {complete && range.start && range.end ? (
              <>
                <b>{formatDateRange({ start: range.start, end: range.end })}</b> ·{' '}
                {dayCount({ start: range.start, end: range.end })} days
              </>
            ) : (
              'Pick trip dates'
            )}
          </span>
          <div className="tp-actions">
            <button className="tp-cancel" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className={diff && diff.droppedCount > 0 ? 'tp-save danger' : 'tp-save'}
              type="button"
              disabled={!complete || !changed}
              onClick={save}
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}
