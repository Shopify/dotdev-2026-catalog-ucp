// Keyless map view (LLD P3). Real MapLibre GL over CARTO's neutral light basemap — no token, no key.
// Drops a pin on the trip destination and numbered pins on each named day location, joined in day
// order by a route line. Day pins use the coordinates saved when a place is picked from autocomplete
// and geocode on the fly otherwise; ones that still don't resolve are simply skipped. A destination
// with no coords centers on nothing and shows the base map only. Neutral tiles so any trip reads well.
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { BoardElement, TripMeta } from '../types';
import { geocodePlace } from '../services/geocode';

type Destination = NonNullable<TripMeta['destination']>;

interface DayPin {
  day: number;
  name: string;
  lat?: number;
  lng?: number;
}

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    base: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
};

// Ordered, named day-location pins from the board's pin elements (day index by their date order).
// Coordinates ride along when the place was picked from autocomplete, so the map needn't re-geocode.
function dayPins(elements: BoardElement[]): DayPin[] {
  const dayDates = [...new Set(elements.filter((e) => e.type === 'day').map((e) => e.payload.date as string))].sort();
  const pins: DayPin[] = [];
  for (const e of elements) {
    if (e.type !== 'pin') continue;
    const name = typeof e.payload.name === 'string' ? e.payload.name.trim() : '';
    const date = e.payload.date as string;
    if (!name || !date) continue;
    const day = dayDates.indexOf(date) + 1;
    if (day <= 0) continue;
    const lat = typeof e.payload.lat === 'number' ? e.payload.lat : undefined;
    const lng = typeof e.payload.lng === 'number' ? e.payload.lng : undefined;
    pins.push({ day, name, lat, lng });
  }
  return pins.sort((a, b) => a.day - b.day);
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#3E5C3A';
}

// 'daypin' (not 'day') — the board's day-track cards already own the bare `.day` class,
// and maplibre adds this className straight onto the DOM element, so a name clash here
// would leak day-track CSS (e.g. flex/min-width rules) onto the map markers.
function pinEl(label: string, kind: 'dest' | 'daypin'): HTMLElement {
  const el = document.createElement('div');
  el.className = `map-pin ${kind}`;
  el.textContent = label;
  return el;
}

export function MapView({
  destination,
  elements,
}: {
  destination?: Destination;
  elements: BoardElement[];
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const lat = destination?.lat ?? 0;
  const lng = destination?.lng ?? 0;
  const hasCenter = Boolean(lat || lng);
  const pins = dayPins(elements);
  const pinsKey = pins.map((p) => `${p.day}:${p.name}:${p.lat ?? ''},${p.lng ?? ''}`).join('|');

  // Create the map once; recenter when the destination moves.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const map = new maplibregl.Map({
      container: box,
      style: STYLE,
      center: hasCenter ? [lng, lat] : [0, 20],
      zoom: hasCenter ? 8 : 1.4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    // The map is created inside a lazily-mounted tab, so its container can report a stale 0×0 size
    // on the first frame (tiles then never paint — the canvas stays transparent). Re-measure on load
    // and whenever the container resizes so the basemap always fills the view.
    map.once('load', () => map.resize());
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(boxRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  // Draw destination + day pins and the connecting route; re-runs when the pins change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    async function draw() {
      // ready() resolves once the style has loaded so sources/layers can be added.
      if (!map!.isStyleLoaded()) {
        await new Promise<void>((r) => map!.once('load', () => r()));
      }
      if (cancelled) return;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      const coords: [number, number][] = [];

      if (hasCenter) {
        markersRef.current.push(new maplibregl.Marker({ element: pinEl('◆', 'dest') }).setLngLat([lng, lat]).addTo(map!));
        coords.push([lng, lat]);
      }

      // Use saved coordinates where a place was picked; geocode the rest. Keep resolved ones in day order.
      const resolved = (
        await Promise.all(
          pins.map(async (p) => {
            if (p.lat != null && p.lng != null) return { day: p.day, lng: p.lng, lat: p.lat };
            const hit = await geocodePlace(p.name);
            return hit ? { day: p.day, lng: hit.lng, lat: hit.lat } : null;
          }),
        )
      ).filter((x): x is { day: number; lng: number; lat: number } => x != null);
      if (cancelled) return;

      const route: [number, number][] = [];
      for (const r of resolved) {
        markersRef.current.push(
          new maplibregl.Marker({ element: pinEl(String(r.day), 'daypin') }).setLngLat([r.lng, r.lat]).addTo(map!),
        );
        route.push([r.lng, r.lat]);
        coords.push([r.lng, r.lat]);
      }

      // Route line joining the day pins in order.
      const geojson = {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: route },
        properties: {},
      };
      const existing = map!.getSource('route') as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(geojson);
      } else if (route.length > 1) {
        map!.addSource('route', { type: 'geojson', data: geojson });
        map!.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          paint: { 'line-color': cssVar('--structure'), 'line-width': 3, 'line-dasharray': [2, 1.2] },
        });
      }

      // Frame everything.
      if (coords.length > 1) {
        const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
        map!.fitBounds(b, { padding: 80, maxZoom: 12, duration: 600 });
      }
    }

    void draw();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, pinsKey]);

  return (
    <div className="mapwrap">
      <div className="mapcanvas" ref={boxRef} />
      <div className="maplegend">
        <div className="lr">
          <span className="dot">1</span>day locations, in order
        </div>
        <div className="lr">
          <span className="dot dest">◆</span>destination
        </div>
      </div>
    </div>
  );
}
