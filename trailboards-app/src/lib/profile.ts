// Account profile: neutral default, localStorage persistence, and the pure derivation from
// shopping defaults → catalog filter primitives (TrailboardContext.profileFilters). Kept
// dependency-free so buildContext can fold it in without side effects.
import type { Profile, ShoppingDefaults, TrailboardContext } from '../types';
import { newId } from './id';

const KEY = 'tb-profile';

// Edit-in-place option lists (mirror the mockup's data-opts). Free-text fields omit an entry.
export const OPTS = {
  apparel: ['XS', 'S', 'M', 'L', 'XL'],
  shoe: ['EU 36', 'EU 37', 'EU 38', 'EU 39', 'EU 40', 'EU 41', 'EU 42', 'EU 43', 'EU 44', 'EU 45', 'EU 46'],
  jacket: ['XS', 'S', 'M', 'L', 'XL'],
  fit: ['slim', 'regular', 'relaxed'],
  currency: ['USD $', 'CAD $', 'EUR €', 'GBP £'],
  units: ['Metric · °C', 'Imperial · °F'],
  condition: ['New only', 'New or refurbished', 'Secondhand ok'],
  rating: ['any', '3★ and up', '4★ and up', '4.5★ and up'],
} as const;

// Relatable starting point for a fresh clone — an owner and a companion, sensible global defaults.
export function makeDefaultProfile(): Profile {
  return {
    people: [
      {
        id: newId(),
        name: 'John Doe',
        role: 'owner',
        email: '',
        you: true,
        sizes: { apparel: 'M', shoe: 'EU 42', jacket: 'M', fit: 'regular' },
      },
      {
        id: newId(),
        name: 'Jane Doe',
        role: 'companion',
        note: 'travels on most trips',
        sizes: { apparel: 'S', shoe: 'EU 38', jacket: 'S', fit: 'slim' },
      },
    ],
    defaults: {
      currency: 'CAD $',
      shipsTo: 'Canada',
      address1: '620 King Street West',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M5V 1M6',
      phone: '437-734-1234',
      budgetMax: 250,
      units: 'Metric · °C',
      condition: 'New or refurbished',
      rating: '4★ and up',
    },
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return makeDefaultProfile();
    const p = JSON.parse(raw) as Profile;
    if (!Array.isArray(p.people) || !p.defaults) return makeDefaultProfile();
    return p;
  } catch {
    return makeDefaultProfile();
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* storage unavailable — profile stays in-memory for the session */
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A tiny name→ISO map — enough for the common workshop destinations. Unknown names omit ships_to.
const NAME_TO_ISO: Record<string, string> = {
  'united states': 'US',
  usa: 'US',
  canada: 'CA',
  'united kingdom': 'GB',
  uk: 'GB',
  ireland: 'IE',
  france: 'FR',
  germany: 'DE',
  spain: 'ES',
  italy: 'IT',
  netherlands: 'NL',
  australia: 'AU',
  'new zealand': 'NZ',
  japan: 'JP',
  india: 'IN',
  'south africa': 'ZA',
};

function shipsToLead(shipsTo: string): string | undefined {
  return shipsTo.split(/[·,]/)[0]?.trim() || undefined;
}

function shipsToCountry(shipsTo: string): string | undefined {
  const lead = shipsToLead(shipsTo)?.toLowerCase();
  return lead ? NAME_TO_ISO[lead] : undefined;
}

function conditionArray(condition: string): string[] | undefined {
  if (condition === 'New only') return ['new'];
  if (condition === 'New or refurbished') return ['new', 'refurbished'];
  if (condition === 'Secondhand ok') return ['new', 'secondhand'];
  return undefined;
}

function ratingMin(rating: string): number | undefined {
  const m = rating.match(/([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

export interface BuyerInfo {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address1?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
}

// Owner's name/email + shopping defaults' address/phone → the primitives create_cart's
// buyer/context and Checkout Kit's prefill need, so the buyer isn't retyping their own info at
// checkout.
export function deriveBuyerInfo(profile: Profile): BuyerInfo {
  const owner = profile.people.find((p) => p.you);
  const [first_name, ...rest] = (owner?.name ?? '').trim().split(/\s+/).filter(Boolean);
  const last_name = rest.join(' ');
  const d = profile.defaults;
  return {
    first_name: first_name || undefined,
    last_name: last_name || undefined,
    email: owner?.email || undefined,
    phone: d.phone || undefined,
    address1: d.address1 || undefined,
    city: d.city || undefined,
    province: d.province || undefined,
    postalCode: d.postalCode || undefined,
    country: shipsToCountry(d.shipsTo),
  };
}

// Account-wide defaults → the catalog primitives resolveIntent folds in. Only defined keys returned.
export function deriveProfileFilters(defaults: ShoppingDefaults): NonNullable<TrailboardContext['profileFilters']> {
  const out: NonNullable<TrailboardContext['profileFilters']> = {};
  const country = shipsToCountry(defaults.shipsTo);
  if (country) {
    out.shipsToCountry = country;
    const label = shipsToLead(defaults.shipsTo);
    if (label) out.shipsToLabel = label;
  }
  if (defaults.budgetMax > 0) out.priceMaxCents = Math.round(defaults.budgetMax * 100);
  const cond = conditionArray(defaults.condition);
  if (cond) out.condition = cond;
  const min = ratingMin(defaults.rating);
  if (min != null) out.ratingMin = min;
  return out;
}
