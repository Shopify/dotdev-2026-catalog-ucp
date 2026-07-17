// Open-Meteo geocoding — keyless, CORS-enabled, no token. Resolves a free-typed place name
// to coordinates + ISO country so the board's `ships_to` filter (connector §7) has a real
// country. Presets already carry this; this fills the gap for typed destinations, and powers
// the live autocomplete dropdown (multi-result) in the setup + trip editor.
import type { TripMeta } from '../types';

type Destination = NonNullable<TripMeta['destination']>;

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  admin1?: string;
  country?: string;
}

// One autocomplete row: the pickable destination plus a human sub-line for disambiguation.
export interface GeoSuggestion {
  destination: Destination;
  detail: string;
}

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';

// "City, Region" so the board title/summary reads naturally; region dropped when it repeats the name.
function toDestination(hit: GeoResult): Destination {
  const name = hit.admin1 && hit.admin1 !== hit.name ? `${hit.name}, ${hit.admin1}` : hit.name;
  return { name, lat: hit.latitude, lng: hit.longitude, country: hit.country_code };
}

function detailOf(hit: GeoResult): string {
  return [hit.admin1, hit.country].filter(Boolean).join(', ');
}

async function search(query: string, count: number): Promise<GeoResult[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${ENDPOINT}?name=${encodeURIComponent(q)}&count=${count}&language=en&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const body = (await res.json()) as { results?: GeoResult[] };
    return body.results ?? [];
  } catch {
    return [];
  }
}

// Resolve the first match for a place name, or null if nothing/geocoder is unreachable.
export async function geocodePlace(query: string): Promise<Destination | null> {
  const [hit] = await search(query, 1);
  return hit ? toDestination(hit) : null;
}

// Up to `count` matches for the live autocomplete dropdown.
export async function geocodeSuggest(query: string, count = 5): Promise<GeoSuggestion[]> {
  const hits = await search(query, count);
  return hits.map((hit) => ({ destination: toDestination(hit), detail: detailOf(hit) }));
}
