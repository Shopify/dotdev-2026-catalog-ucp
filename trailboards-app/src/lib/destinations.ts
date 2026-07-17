// Seed destinations for the setup suggestion chips. Presets carry coordinates + country
// so a board starts with a real place; free-typed destinations geocode later (P4).
import type { TripMeta } from '../types';

export type Destination = NonNullable<TripMeta['destination']>;

// A neutral, globally recognizable mix — city, coast, and outdoors — so the setup reads as
// "plan any trip", not just treks. Free-typed destinations geocode the same way.
export const PRESETS: Destination[] = [
  { name: 'Tokyo, Japan', lat: 35.6764, lng: 139.65, country: 'JP' },
  { name: 'Barcelona, Spain', lat: 41.3874, lng: 2.1686, country: 'ES' },
  { name: 'New York, USA', lat: 40.7128, lng: -74.006, country: 'US' },
  { name: 'Cape Town, South Africa', lat: -33.9249, lng: 18.4241, country: 'ZA' },
];

// Short chip labels (first token) → full preset.
export function chipLabel(name: string): string {
  return name.split(',')[0];
}
