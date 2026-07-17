import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { UserMenu } from '../components/UserMenu';
import { ContourBackground } from '../components/ContourBackground';
import { MiniCal, type DateRange } from '../components/MiniCal';
import { DestinationSearch } from '../components/DestinationSearch';
import { PRESETS, chipLabel, type Destination } from '../lib/destinations';
import { newId } from '../lib/id';
import { geocodePlace } from '../services/geocode';
import { putBoard } from '../api/boards';
import { dayCount, defaultBoardTitle } from '../lib/format';
import { useTheme } from '../theme/ThemeProvider';
import type { BoardElement, BoardState } from '../types';
import '../styles/board.css';
import '../styles/setup.css';

// One 'day' element per date in the range — the workspace lays out a column per day.
function dayElements(range: DateRange): BoardElement[] {
  if (!range.start || !range.end) return [];
  const out: BoardElement[] = [];
  const to = new Date(range.end);
  let i = 0;
  for (let d = new Date(range.start); d <= to; d.setDate(d.getDate() + 1), i++) {
    const date = d.toISOString().slice(0, 10);
    out.push({
      id: newId(),
      type: 'day',
      x: i,
      y: 0,
      payload: { date, index: i },
      createdAt: new Date().toISOString(),
    });
  }
  return out;
}

export function NewBoardSetup() {
  const nav = useNavigate();
  const { theme } = useTheme();
  const [destName, setDestName] = useState('');
  const [destination, setDestination] = useState<Destination | null>(null);
  const [range, setRange] = useState<DateRange>({});
  const [creating, setCreating] = useState(false);
  const [geoWarning, setGeoWarning] = useState(false);

  const days = dayCount(range.start && range.end ? { start: range.start, end: range.end } : undefined);
  const canCreate = Boolean(destName.trim() && range.start && range.end && !creating);

  function pickPreset(p: Destination) {
    setDestination(p);
    setDestName(p.name);
    setGeoWarning(false);
  }

  async function create() {
    if (!canCreate || !range.start || !range.end) return;
    setCreating(true);
    // Typed destinations geocode now so the board opens with a real country for ships_to. When
    // geocoding can't place it, warn instead of silently shipping a destination with no country
    // (breaks ships_to filtering) — a second click on Create proceeds anyway.
    let dest = destination;
    if (!dest) {
      dest = await geocodePlace(destName);
      if (!dest) {
        if (!geoWarning) {
          setGeoWarning(true);
          setCreating(false);
          return;
        }
        dest = { name: destName.trim(), lat: 0, lng: 0 };
      }
    }
    const trip = { destination: dest, dateRange: { start: range.start, end: range.end } };
    const board: BoardState = {
      id: newId(),
      title: defaultBoardTitle(trip),
      theme,
      trip,
      elements: dayElements(range),
      demoMode: false,
      shoppingEnabled: false,
    };
    try {
      await putBoard(board);
      nav(`/b/${board.id}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <div className="app">
      <header className="board-head">
        <Brand />
        <span className="head-div" />
        <h1 className="board-title">New Trailboard</h1>
        <div className="head-right">
          <UserMenu />
        </div>
      </header>

      <div className="body">
        <section className="canvas setup-canvas">
          <ContourBackground />
          <div className="setup tb-enter">
            <div className="eyebrow">New Trailboard</div>
            <h2>Where and when?</h2>
            <p className="lede">
              Pick a destination and your dates. We lay out a day for each date — then just
              plan. The cart fills itself as you go.
            </p>

            <div className="fld">
              <span className="flabel">Destination</span>
              <DestinationSearch
                value={destName}
                onChange={(name) => {
                  setDestName(name);
                  setDestination(null); // typed text geocodes on create()
                  setGeoWarning(false);
                }}
                onPick={(dest) => {
                  setDestination(dest);
                  setGeoWarning(false);
                }}
              />
              <div className="chips">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className={destName === p.name ? 'sug on' : 'sug'}
                    onClick={() => pickPreset(p)}
                  >
                    {chipLabel(p.name)}
                  </button>
                ))}
              </div>
              {geoWarning && (
                <div className="geo-warn">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                  </svg>
                  <span>
                    Couldn&rsquo;t recognize &ldquo;{destName}&rdquo; as a place. Pick a suggestion
                    above, or press Create again to continue anyway — recommendations may be less
                    relevant without a resolved destination.
                  </span>
                </div>
              )}
            </div>

            <div className="fld">
              <span className="flabel">Trip dates</span>
              <MiniCal value={range} onChange={setRange} />
            </div>

            <button type="button" className="create" disabled={!canCreate} onClick={create}>
              {days ? `Create ${days}-day board` : 'Create board'}
              <svg viewBox="0 0 24 24">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
