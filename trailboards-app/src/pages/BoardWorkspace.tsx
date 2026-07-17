import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { UserMenu } from '../components/UserMenu';
import { ContourBackground } from '../components/ContourBackground';
import { TripEditor } from '../components/TripEditor';
import { DayColumn } from '../components/DayColumn';
import { CartPanel } from '../components/CartPanel';
import { TraceDrawer } from '../components/TraceDrawer';
import { BoardProvider, useBoard } from '../store/BoardProvider';
import { CommerceProvider, useCommerce } from '../store/CommerceProvider';
import { usePersistBoard, type SaveStatus } from '../store/usePersistBoard';
import { useResolveScheduler } from '../store/useResolveScheduler';
import { useTrace } from '../store/useTrace';
import { useProfile } from '../store/useProfile';
import { reconcileDays } from '../lib/tripReconcile';
import { addDays } from '../lib/day';
import { fetchForecast } from '../services/weather';
import { fetchBoard, type CartLineRow } from '../api/boards';
import type { AgentCall, BoardElement, BoardState, TripMeta, WeatherChip } from '../types';

// MapLibre (~1MB) loads only when the Map view is opened — keeps the initial bundle lean.
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));
import '../styles/chrome.css';
import '../styles/board.css';
import '../styles/workspace.css';
import '../styles/commerce.css';
import '../styles/trace.css';
import '../styles/select.css';

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
};

type IntentSource = 'agent' | 'stub' | 'fallback';

// Most-recent resolve_intent source from the live trace. `agent` = the real model resolved intent;
// `stub` = no ANTHROPIC_API_KEY, keyword floor; `fallback` = key present but the call errored.
function latestIntentSource(calls: AgentCall[]): { source: IntentSource; error?: string } | null {
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i];
    if (call.tool !== 'resolve_intent') continue;
    const res = call.response as { source?: string; error?: string } | null;
    const source = res?.source;
    if (source === 'agent' || source === 'stub' || source === 'fallback') {
      return { source, error: res?.error };
    }
  }
  return null;
}

// Header pill answering "is the AI actually on?" at a glance during the demo. Three states:
// On = the model is resolving intent, Off = keyword stub (no key), Error = key present but the
// model call failed (fell back to keywords). Detail lives in the tooltip.
function IntentModeChip({ calls }: { calls: AgentCall[] }) {
  const source = latestIntentSource(calls);
  const cls =
    source?.source === 'agent'
      ? 'imode live'
      : source?.source === 'fallback'
        ? 'imode err'
        : source?.source === 'stub'
          ? 'imode stub'
          : 'imode idle';
  const label =
    source?.source === 'agent'
      ? 'AI: On'
      : source?.source === 'fallback'
        ? 'AI: Error'
        : source?.source === 'stub'
          ? 'AI: Off'
          : 'AI: …';
  const title =
    source?.source === 'agent'
      ? 'On — the model is resolving board intent live'
      : source?.source === 'fallback'
        ? `Model call failed — fell back to keyword matching${source.error ? `: ${source.error}` : ''}`
        : source?.source === 'stub'
          ? 'Off — keyword matching (set ANTHROPIC_API_KEY to run the model)'
          : 'Waiting for the first intent resolution';
  return (
    <span className={cls} role="status" title={title}>
      <span className="imode-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

// Ordered, de-duped day dates from the board's day elements.
function dayDates(elements: BoardElement[]): string[] {
  const set = new Set<string>();
  for (const e of elements) {
    if (e.type === 'day' && typeof e.payload.date === 'string') set.add(e.payload.date);
  }
  return [...set].sort();
}

// Keyless Open-Meteo forecast for the trip's coordinates + dates; re-fetches when either
// changes. Dates outside the forecast horizon simply return no chip.
function useForecast(destination: TripMeta['destination'], dates: string[]): Record<string, WeatherChip> {
  const [chips, setChips] = useState<Record<string, WeatherChip>>({});
  const lat = destination?.lat ?? 0;
  const lng = destination?.lng ?? 0;
  const key = dates.join(',');
  useEffect(() => {
    if (!lat && !lng) return;
    if (!dates.length) return;
    let live = true;
    fetchForecast(lat, lng, dates).then((next) => live && setChips(next));
    return () => {
      live = false;
    };
    // key captures the date list; lat/lng capture the place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, key]);
  return chips;
}

function Workspace() {
  const { state, dispatch } = useBoard();
  const commerce = useCommerce();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [view, setView] = useState<'board' | 'map'>('board');
  const [traceOpen, setTraceOpen] = useState(false);
  // Demo mode strips the ambient save indicator so the workshop audience's attention lands on the
  // trip → shopping loop, not the editor plumbing. (Board/Map toggle stays — the map is a headline visual.)
  const demoMode = state.demoMode;

  usePersistBoard(state, setSaveStatus);

  // Live agent-call trace for this board. Streamed for the whole session (not just while the drawer
  // is open) so the toolbar badge stays current; the drawer is a pure presenter over these rows.
  const calls = useTrace(state.id, true);

  const [profile] = useProfile();
  const dates = dayDates(state.elements);
  const forecast = useForecast(state.trip.destination, dates);
  const weather = useMemo(() => Object.values(forecast), [forecast]);

  // Board edits → live resolveIntent against the real catalog. Structured edits fire immediately,
  // free text debounces; dismissed products stay suppressed and owned variants are excluded.
  const context = useResolveScheduler({
    resolve: commerce.resolve,
    weather,
    owned: commerce.state.owned,
    recommendedIds: commerce.state.dismissed,
    profile,
  });

  // Resolve once on open so an existing board shows matches immediately (scheduler covers edits after).
  const didMount = useRef(false);
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    commerce.resolve(context);
  }, [context, commerce]);

  // Turn shopping on/off; turning on also resolves immediately so an already-built board gets
  // recommendations right away instead of waiting for the next edit to trigger the scheduler.
  function toggleShopping() {
    const next = !commerce.shoppingEnabled;
    commerce.setShoppingEnabled(next);
    dispatch({ type: 'setShopping', shoppingEnabled: next });
    if (next) commerce.resolve(context);
    else setTraceOpen(false);
  }

  // Extend the trip by one day at either edge, reconciling the day track.
  function addDay(edge: 'lead' | 'trail') {
    const first = dates[0] ?? state.trip.dateRange?.start;
    const last = dates[dates.length - 1] ?? state.trip.dateRange?.end;
    if (!first || !last) return;
    const range =
      edge === 'lead'
        ? { start: addDays(first, -1), end: last }
        : { start: first, end: addDays(last, 1) };
    const next = reconcileDays(state.elements, range, new Date().toISOString());
    dispatch({ type: 'reconcileTrip', trip: { dateRange: range }, elements: next.nextElements });
  }

  return (
    <div className="app">
      <header className="board-head">
        <Brand />
        <span className="head-div" />
        <div className="head-chips">
          <TripEditor />
        </div>
        <div className="head-right">
          <div className="viewseg" role="tablist" aria-label="Canvas view">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'board'}
              className={view === 'board' ? 'on' : ''}
              onClick={() => setView('board')}
            >
              Board
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'map'}
              className={view === 'map' ? 'on' : ''}
              onClick={() => setView('map')}
            >
              Map
            </button>
          </div>
          <button
            type="button"
            className={commerce.shoppingEnabled ? 'nerds-btn on' : 'nerds-btn'}
            aria-pressed={commerce.shoppingEnabled}
            title={
              commerce.shoppingEnabled
                ? 'Shopping is on — turn off for just Trailboards'
                : 'Just Trailboards — turn on for recommendations & cart'
            }
            onClick={toggleShopping}
          >
            {commerce.shoppingEnabled ? 'Shopping: On' : 'Shopping: Off'}
          </button>
          {commerce.shoppingEnabled && <IntentModeChip calls={calls} />}
          {commerce.shoppingEnabled && (
            <button
              type="button"
              className={traceOpen ? 'nerds-btn on' : 'nerds-btn'}
              title="Live agent trace"
              aria-pressed={traceOpen}
              onClick={() => setTraceOpen((v) => !v)}
            >
              <span className="gt">&lt;/&gt;</span>
              Trace
              <span className="cc">{calls.length}</span>
            </button>
          )}
          {!demoMode && (
            <span
              className={`save-dot ${saveStatus}`}
              role="status"
              aria-label={SAVE_LABEL[saveStatus] || 'All changes saved'}
              title={SAVE_LABEL[saveStatus] || 'All changes saved'}
            >
              {saveStatus === 'saved' ? (
                <svg viewBox="0 0 24 24">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : saveStatus === 'error' ? (
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
              ) : null}
            </span>
          )}
          <UserMenu />
        </div>
      </header>

      <div className="body">
        <section className="canvas board-canvas">
          <ContourBackground />
          {view === 'map' ? (
            <Suspense fallback={<div className="mapwrap map-loading">Loading map…</div>}>
              <MapView destination={state.trip.destination} elements={state.elements} />
            </Suspense>
          ) : (
          <div className="track">
            <div className="newday lead" title="Add a day before the trip" onClick={() => addDay('lead')}>
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              + Day
              <span className="nd-sub">starts earlier</span>
            </div>

            {dates.map((date, i) => (
              <DayColumn
                key={date}
                date={date}
                dayNumber={i + 1}
                elements={state.elements}
                weather={forecast[date]}
              />
            ))}

            <div className="newday" title="Add a day after the trip" onClick={() => addDay('trail')}>
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              + Day
              <span className="nd-sub">ends later</span>
            </div>
          </div>
          )}
        </section>

        {commerce.shoppingEnabled && <CartPanel />}
      </div>

      {commerce.shoppingEnabled && (
        <TraceDrawer calls={calls} open={traceOpen} onClose={() => setTraceOpen(false)} />
      )}
    </div>
  );
}

export function BoardWorkspace() {
  const { id } = useParams();
  const [board, setBoard] = useState<BoardState | null>(null);
  const [cartLines, setCartLines] = useState<CartLineRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetchBoard(id)
      .then((bundle) => {
        if (!live) return;
        setCartLines(bundle.cartLines);
        setBoard(bundle.board);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Failed to load'));
    return () => {
      live = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="app">
        <div className="empty">
          <p>Couldn’t open this board — {error}.</p>
          <Link className="btn" to="/">
            All boards
          </Link>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="app">
        <div className="empty">
          <p>Loading board…</p>
        </div>
      </div>
    );
  }

  return (
    <BoardProvider initial={board}>
      <CommerceProvider initialCartLines={cartLines} initialShoppingEnabled={board.shoppingEnabled}>
        <Workspace />
      </CommerceProvider>
    </BoardProvider>
  );
}
