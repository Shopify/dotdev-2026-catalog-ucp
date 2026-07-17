// Deterministic weather rule table (HLD §14 R-Q3). Dependency-free like types.ts so BOTH planes
// import it: the client weather preview (services/weather.ts) and the server connector fold the
// SAME terms into the search query. That single source is what makes stub mode and live mode rank
// alike — the weather rules are the floor, never the model's job.

// Structural, not the WeatherChip type — kept import-free so this module stays cross-plane.
export interface WxLike {
  code: number;
  lo: number;
}

// WMO weather code → short lowercase label (matches the mockup's "18° · clear").
export function weatherLabel(code: number): string {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if (code <= 48) return 'fog';
  if (code <= 57) return 'drizzle';
  if (code <= 67) return 'rain';
  if (code <= 77) return 'snow';
  if (code <= 82) return 'showers';
  if (code <= 86) return 'snow showers';
  return 'thunderstorm';
}

// Wet codes get the magenta `.wet` treatment in the day head (design .day-wx .wet).
export function isWet(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

// Weather codes → query terms folded into the search query (NOT filters), so stub and live rank
// identically. rain→waterproof/shell, snow→waterproof/insulated, sun→UV/sun, cold→insulated/thermal.
export function weatherTerms(chips: WxLike[]): string[] {
  const terms = new Set<string>();
  const add = (...ts: string[]) => ts.forEach((t) => terms.add(t));
  for (const c of chips) {
    const rain = (c.code >= 51 && c.code <= 67) || (c.code >= 80 && c.code <= 82) || c.code >= 95;
    const snow = (c.code >= 71 && c.code <= 77) || (c.code >= 85 && c.code <= 86);
    if (rain) add('waterproof', 'shell');
    if (snow) add('waterproof', 'insulated');
    if (c.code === 0 || c.code === 1) add('UV', 'sun');
    if (c.lo <= 5) add('insulated', 'thermal');
  }
  return [...terms];
}
