// Open-Meteo forecast — keyless, CORS-enabled, no token. Turns a place + trip dates into
// per-day WeatherChips for the day heads. The deterministic weather→query rule table (HLD §14 R-Q3)
// lives in lib/weatherRules so the server connector folds the SAME terms — re-exported here for the
// client call sites that already import from this module.
import type { WeatherChip } from '../types';
import { weatherLabel } from '../lib/weatherRules';

export { weatherLabel, isWet, weatherTerms } from '../lib/weatherRules';

const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive';
const DAILY = 'weathercode,temperature_2m_max,temperature_2m_min';

interface Daily {
  time: string[];
  weathercode: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
}

// Open-Meteo's forecast horizon is roughly -80 days .. +15 days from today, and it 400s the WHOLE
// request if either bound falls outside that window. Dates in-window use the live forecast; dates
// outside it (a trip booked months ahead) fall back to prior-year normals from the archive API so
// the board still gets truthful weather — labelled `typical`, never faked as a forecast.
const HORIZON_AHEAD = 15;
const HORIZON_BACK = 80;

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function priorYear(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function chipFrom(daily: Daily, i: number, date: string, typical: boolean): WeatherChip | null {
  const code = daily.weathercode[i];
  if (code == null) return null;
  return {
    date,
    code,
    hi: Math.round(daily.temperature_2m_max[i]),
    lo: Math.round(daily.temperature_2m_min[i]),
    label: weatherLabel(code),
    ...(typical ? { typical: true } : {}),
  };
}

async function fetchDaily(endpoint: string, lat: number, lng: number, start: string, end: string): Promise<Daily | null> {
  const url =
    `${endpoint}?latitude=${lat}&longitude=${lng}` +
    `&daily=${DAILY}&timezone=auto&start_date=${start}&end_date=${end}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { daily?: Daily };
    return body.daily?.time ? body.daily : null;
  } catch {
    return null;
  }
}

// Live forecast for in-window dates → chips keyed by their own date.
async function fillForecast(lat: number, lng: number, dates: string[], out: Record<string, WeatherChip>): Promise<void> {
  const sorted = [...dates].sort();
  const daily = await fetchDaily(FORECAST_ENDPOINT, lat, lng, sorted[0], sorted[sorted.length - 1]);
  if (!daily) return;
  const wanted = new Set(dates);
  daily.time.forEach((date, i) => {
    if (!wanted.has(date)) return;
    const chip = chipFrom(daily, i, date, false);
    if (chip) out[date] = chip;
  });
}

// Out-of-window dates → prior-year archive actuals, mapped back onto the requested date as `typical`.
async function fillNormals(lat: number, lng: number, dates: string[], out: Record<string, WeatherChip>): Promise<void> {
  const archiveToReq = new Map<string, string>();
  for (const d of dates) archiveToReq.set(priorYear(d), d);
  const archiveDates = [...archiveToReq.keys()].sort();
  const daily = await fetchDaily(ARCHIVE_ENDPOINT, lat, lng, archiveDates[0], archiveDates[archiveDates.length - 1]);
  if (!daily) return;
  daily.time.forEach((archiveDate, i) => {
    const reqDate = archiveToReq.get(archiveDate);
    if (!reqDate) return;
    const chip = chipFrom(daily, i, reqDate, true);
    if (chip) out[reqDate] = chip;
  });
}

// Fetch a chip per requested date: live forecast where the horizon covers it, prior-year normals
// beyond it. Returns a date→chip map (missing dates simply get no chip).
export async function fetchForecast(
  lat: number,
  lng: number,
  dates: string[],
): Promise<Record<string, WeatherChip>> {
  const out: Record<string, WeatherChip> = {};
  if (!dates.length || (lat === 0 && lng === 0)) return out;

  const today = new Date().toISOString().slice(0, 10);
  const min = shiftIso(today, -HORIZON_BACK);
  const max = shiftIso(today, HORIZON_AHEAD);
  const inWindow = dates.filter((d) => d >= min && d <= max);
  const outWindow = dates.filter((d) => d < min || d > max);

  await Promise.all([
    inWindow.length ? fillForecast(lat, lng, inWindow, out) : Promise.resolve(),
    outWindow.length ? fillNormals(lat, lng, outWindow, out) : Promise.resolve(),
  ]);
  return out;
}
