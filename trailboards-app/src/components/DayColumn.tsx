// One day of the trip: a sticky head (number · place · date · forecast) over the cards
// pinned to that date, plus a per-day add menu. Place is derived from the day's location
// pin; an empty day shows "Name this place" which drops a pin ready to name.
import { useRef, useState } from 'react';
import { useBoard } from '../store/BoardProvider';
import { ElementCard } from './ElementCard';
import { DestinationSearch } from './DestinationSearch';
import { ADD_ORDER, ELEMENT_META, type CardType } from './elementMeta';
import { newId } from '../lib/id';
import { dayLabel } from '../lib/day';
import type { BoardElement, WeatherChip } from '../types';
import { isWet } from '../services/weather';

const MENU_LABELS: Record<CardType, string> = {
  pin: 'Location pin',
  stay: 'Stay',
  activity: 'Activity',
  transport: 'Transport',
  traveler: 'Traveler',
  note: 'Note',
  image: 'Image / inspiration',
};

export function DayColumn({
  date,
  dayNumber,
  elements,
  weather,
}: {
  date: string;
  dayNumber: number;
  elements: BoardElement[];
  weather?: WeatherChip;
}) {
  const { dispatch } = useBoard();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState(false);
  const draftPinId = useRef<string | null>(null);

  const cards = elements
    .filter((e) => e.type !== 'day' && e.payload.date === date)
    .sort((a, b) => a.y - b.y || a.createdAt.localeCompare(b.createdAt));

  const pin = cards.find((e) => e.type === 'pin');
  const place = typeof pin?.payload.name === 'string' ? pin.payload.name.trim() : '';

  function add(type: CardType) {
    setMenuOpen(false);
    dispatch({
      type: 'addElement',
      element: {
        id: newId(),
        type,
        x: dayNumber - 1,
        y: cards.length,
        payload: { date },
        createdAt: new Date().toISOString(),
      },
    });
  }

  // Create the day's location pin on first edit, then update it — so the header autocomplete edits
  // the same pin the map and body card read. draftPinId bridges the render before `pin` appears.
  function upsertPin(payload: Record<string, unknown>) {
    const targetId = pin?.id ?? draftPinId.current;
    if (targetId) {
      dispatch({ type: 'updateElement', id: targetId, patch: { payload } });
      return;
    }
    const id = newId();
    draftPinId.current = id;
    dispatch({
      type: 'addElement',
      element: { id, type: 'pin', x: dayNumber - 1, y: cards.length, payload: { date, ...payload }, createdAt: new Date().toISOString() },
    });
  }

  function stopEditingPlace() {
    setEditingPlace(false);
    draftPinId.current = null;
  }

  return (
    <section className="day">
      <div className="day-head">
        <div>
          <div className="type-label">day {String(dayNumber).padStart(2, '0')}</div>
          {editingPlace ? (
            <DestinationSearch
              value={place}
              inputClassName="day-place-in"
              fieldClassName="df-flat"
              placeholder="Name this place"
              autoFocus
              onChange={(name) => upsertPin({ name, lat: undefined, lng: undefined })}
              onPick={(dest) => {
                upsertPin({ name: dest.name, lat: dest.lat, lng: dest.lng, country: dest.country });
                stopEditingPlace();
              }}
              onBlur={stopEditingPlace}
            />
          ) : place ? (
            <button className="day-place" type="button" title="Edit location" onClick={() => setEditingPlace(true)}>
              {place}
            </button>
          ) : (
            <button className="setplace" type="button" onClick={() => setEditingPlace(true)}>
              <svg viewBox="0 0 24 24">
                <path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              Name this place
            </button>
          )}
        </div>
        <div className="day-r">
          <div className="day-date">{dayLabel(date)}</div>
          {weather && (
            <div className="day-wx">
              <button
                type="button"
                className="wx-trigger"
                aria-label={`${weather.hi}° · ${weather.label}${weather.typical ? ' (typical for these dates)' : ''}`}
              >
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
                </svg>
              </button>
              <div className="wx-pop" role="tooltip">
                {weather.hi}° ·{' '}
                {isWet(weather.code) ? <span className="wet">{weather.label}</span> : weather.label}
                {weather.typical && (
                  <span className="wx-typical" title="Prior-year normals — beyond the live forecast horizon">
                    typical
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {cards.map((el) => (
        <ElementCard key={el.id} element={el} />
      ))}

      <div className="add-slot">
        <button
          className="add"
          type="button"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          + add
        </button>
        {menuOpen && (
          <div className="addmenu">
            <div className="cap">add element</div>
            {ADD_ORDER.map((t) => (
              <button key={t} type="button" onClick={() => add(t)}>
                <svg viewBox="0 0 24 24">{ELEMENT_META[t].icon}</svg>
                {MENU_LABELS[t]}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
