// Fully-populated demo itineraries — the landing's "I'm Feeling Lucky" card builds one at random
// each click (a trek, a beach holiday, a city break, a safari…) so a clone-and-run attendee sees a
// rich board (multiple element types across several days) driving live recommendations immediately,
// without hand-building one. Each click mints a fresh board id → boards accumulate rather than
// reopening the same one. Dates are anchored a week out so day heads show a live Open-Meteo forecast.
import type { BoardElement, BoardState, ThemeName } from '../types';
import { newId } from './id';
import { addDays } from './day';

interface Seed {
  type: BoardElement['type'];
  payload: Record<string, unknown>;
}

interface Template {
  title: string;
  destination: NonNullable<BoardState['trip']['destination']>;
  // One entry per day (day 0 → first date); each inner list is that day's cards, top to bottom.
  perDay: Seed[][];
}

const TEMPLATES: Template[] = [
  {
    title: 'Dolomites · via ferrata week',
    destination: { name: 'Dolomites, Italy', lat: 46.4102, lng: 11.844, country: 'IT' },
    perDay: [
      [
        { type: 'pin', payload: { name: 'Bolzano', lat: 46.4983, lng: 11.3548, country: 'IT' } },
        { type: 'transport', payload: { mode: 'Train from Venice Mestre' } },
        { type: 'stay', payload: { name: 'Parkhotel Laurin' } },
        { type: 'traveler', payload: {} },
        { type: 'note', payload: { text: 'Pick up via ferrata permits + a topo map at the alpine club office.' } },
      ],
      [
        { type: 'pin', payload: { name: 'Alpe di Siusi (Seiser Alm)', lat: 46.5406, lng: 11.611, country: 'IT' } },
        { type: 'activity', payload: { label: 'Via ferrata — Oskar Schuster route' } },
        { type: 'activity', payload: { label: 'Sunrise hike across the meadow' } },
        { type: 'transport', payload: { mode: 'Cable car up + rental e-bikes' } },
      ],
      [
        { type: 'pin', payload: { name: "Cortina d'Ampezzo", lat: 46.5369, lng: 12.1357, country: 'IT' } },
        { type: 'stay', payload: { name: 'Rifugio Lagazuoi — mountain hut, 2752 m' } },
        { type: 'activity', payload: { label: 'Tofana di Rozes ferrata climb' } },
        { type: 'note', payload: { text: 'Cold and exposed at altitude — pack a hardshell and gloves even in July.' } },
      ],
      [
        { type: 'pin', payload: { name: 'Lago di Braies', lat: 46.6947, lng: 12.0851, country: 'IT' } },
        { type: 'activity', payload: { label: 'Dawn kayak on the lake' } },
        { type: 'image', payload: { name: 'Turquoise alpine lake, wooden rowboats, morning mist' } },
        { type: 'transport', payload: { mode: 'Drive back to Venice' } },
      ],
    ],
  },
  {
    title: 'Maui · island beach holiday',
    destination: { name: 'Maui, Hawaii', lat: 20.7984, lng: -156.3319, country: 'US' },
    perDay: [
      [
        { type: 'pin', payload: { name: 'Kahului', lat: 20.8893, lng: -156.4729, country: 'US' } },
        { type: 'transport', payload: { mode: 'Flight in + convertible rental' } },
        { type: 'stay', payload: { name: 'Wailea beach resort' } },
        { type: 'traveler', payload: {} },
        { type: 'note', payload: { text: 'Reef-safe sunscreen only — Hawaii bans oxybenzone.' } },
      ],
      [
        { type: 'pin', payload: { name: 'Wailea Beach', lat: 20.6844, lng: -156.4417, country: 'US' } },
        { type: 'activity', payload: { label: 'Snorkeling at Molokini crater' } },
        { type: 'activity', payload: { label: 'Sunset stand-up paddleboarding' } },
      ],
      [
        { type: 'pin', payload: { name: 'Hana Highway', lat: 20.7654, lng: -155.9905, country: 'US' } },
        { type: 'activity', payload: { label: 'Road to Hana waterfalls drive' } },
        { type: 'image', payload: { name: 'Black sand beach, palms, turquoise surf' } },
        { type: 'note', payload: { text: 'Humid and sunny — light layers and a packable rain shell for the drive.' } },
      ],
    ],
  },
  {
    title: 'Kyoto · culture city break',
    destination: { name: 'Kyoto, Japan', lat: 35.0116, lng: 135.7681, country: 'JP' },
    perDay: [
      [
        { type: 'pin', payload: { name: 'Kyoto Station', lat: 34.9858, lng: 135.7588, country: 'JP' } },
        { type: 'transport', payload: { mode: 'Shinkansen from Tokyo' } },
        { type: 'stay', payload: { name: 'Machiya townhouse, Gion' } },
        { type: 'traveler', payload: {} },
      ],
      [
        { type: 'pin', payload: { name: 'Fushimi Inari Taisha', lat: 34.9671, lng: 135.7727, country: 'JP' } },
        { type: 'activity', payload: { label: 'Dawn walk through the torii gates' } },
        { type: 'activity', payload: { label: 'Tea ceremony in Higashiyama' } },
        { type: 'note', payload: { text: 'Lots of walking on cobbles — broken-in comfortable shoes.' } },
      ],
      [
        { type: 'pin', payload: { name: 'Arashiyama', lat: 35.0094, lng: 135.6667, country: 'JP' } },
        { type: 'activity', payload: { label: 'Bamboo grove + Katsura river boat' } },
        { type: 'image', payload: { name: 'Towering green bamboo forest path' } },
        { type: 'transport', payload: { mode: 'City bikes + local bus' } },
      ],
    ],
  },
  {
    title: 'Serengeti · safari expedition',
    destination: { name: 'Serengeti, Tanzania', lat: -2.3333, lng: 34.8333, country: 'TZ' },
    perDay: [
      [
        { type: 'pin', payload: { name: 'Arusha', lat: -3.3869, lng: 36.683, country: 'TZ' } },
        { type: 'transport', payload: { mode: 'Bush flight to the reserve' } },
        { type: 'stay', payload: { name: 'Tented safari camp' } },
        { type: 'traveler', payload: {} },
        { type: 'note', payload: { text: 'Neutral tones only — avoid bright colours and dark blue on game drives.' } },
      ],
      [
        { type: 'pin', payload: { name: 'Seronera Valley', lat: -2.4261, lng: 34.8253, country: 'TZ' } },
        { type: 'activity', payload: { label: 'Dawn game drive — big cats' } },
        { type: 'activity', payload: { label: 'Sundowner at a kopje' } },
        { type: 'note', payload: { text: 'Hot days, cold open-vehicle mornings — layers and a wide-brim hat.' } },
      ],
      [
        { type: 'pin', payload: { name: 'Ngorongoro Crater', lat: -3.2028, lng: 35.4875, country: 'TZ' } },
        { type: 'activity', payload: { label: 'Crater floor wildlife descent' } },
        { type: 'image', payload: { name: 'Acacia savanna at golden hour, distant herd' } },
        { type: 'transport', payload: { mode: '4x4 back to Arusha' } },
      ],
    ],
  },
  {
    title: 'Patagonia · Torres del Paine trek',
    destination: { name: 'Torres del Paine, Chile', lat: -51.0, lng: -73.05, country: 'CL' },
    perDay: [
      [
        { type: 'pin', payload: { name: 'Puerto Natales', lat: -51.7236, lng: -72.4875, country: 'CL' } },
        { type: 'transport', payload: { mode: 'Bus from Punta Arenas' } },
        { type: 'stay', payload: { name: 'Refugio Torre Central' } },
        { type: 'traveler', payload: {} },
        { type: 'note', payload: { text: 'Patagonian wind is relentless — a windproof shell beats an umbrella every time.' } },
      ],
      [
        { type: 'pin', payload: { name: 'Base Torres', lat: -50.9394, lng: -72.9511, country: 'CL' } },
        { type: 'activity', payload: { label: 'Sunrise hike to the base of the towers' } },
        { type: 'transport', payload: { mode: 'Trailhead shuttle' } },
      ],
      [
        { type: 'pin', payload: { name: 'Grey Glacier', lat: -51.0, lng: -73.3667, country: 'CL' } },
        { type: 'activity', payload: { label: 'Glacier boat crossing' } },
        { type: 'image', payload: { name: 'Blue-white glacier face calving into a lake' } },
        { type: 'note', payload: { text: 'Cold spray off the glacier — pack a dry bag for cameras.' } },
      ],
    ],
  },
  {
    title: 'Iceland · ring road drive',
    destination: { name: 'Iceland', lat: 64.9631, lng: -19.0208, country: 'IS' },
    perDay: [
      [
        { type: 'pin', payload: { name: 'Reykjavík', lat: 64.1466, lng: -21.9426, country: 'IS' } },
        { type: 'transport', payload: { mode: '4x4 rental pickup' } },
        { type: 'stay', payload: { name: 'Guesthouse near Hallgrímskirkja' } },
        { type: 'traveler', payload: {} },
      ],
      [
        { type: 'pin', payload: { name: 'Skógafoss', lat: 63.5321, lng: -19.5116, country: 'IS' } },
        { type: 'activity', payload: { label: 'Waterfall stops along the south coast' } },
        { type: 'activity', payload: { label: 'Black sand beach at Reynisfjara' } },
        { type: 'note', payload: { text: 'Sideways rain is normal — a real waterproof, not a fashion raincoat.' } },
      ],
      [
        { type: 'pin', payload: { name: 'Jökulsárlón', lat: 64.0784, lng: -16.2300, country: 'IS' } },
        { type: 'activity', payload: { label: 'Glacier lagoon boat tour' } },
        { type: 'image', payload: { name: 'Icebergs drifting in a glacial lagoon at dusk' } },
        { type: 'transport', payload: { mode: 'Drive north toward Mývatn' } },
      ],
    ],
  },
  {
    title: 'Marrakech · medina city break',
    destination: { name: 'Marrakech, Morocco', lat: 31.6295, lng: -7.9811, country: 'MA' },
    perDay: [
      [
        { type: 'pin', payload: { name: 'Jemaa el-Fnaa', lat: 31.6258, lng: -7.9891, country: 'MA' } },
        { type: 'transport', payload: { mode: 'Airport transfer' } },
        { type: 'stay', payload: { name: 'Riad in the medina' } },
        { type: 'traveler', payload: {} },
        { type: 'note', payload: { text: 'Modest shoulders and knees for medina and mosque visits.' } },
      ],
      [
        { type: 'pin', payload: { name: 'Majorelle Garden', lat: 31.6412, lng: -8.0031, country: 'MA' } },
        { type: 'activity', payload: { label: 'Souk shopping — leather and spices' } },
        { type: 'activity', payload: { label: 'Sunset at a rooftop terrace' } },
      ],
      [
        { type: 'pin', payload: { name: 'Agafay Desert', lat: 31.4167, lng: -8.2333, country: 'MA' } },
        { type: 'activity', payload: { label: 'Camel trek and desert camp dinner' } },
        { type: 'image', payload: { name: 'Golden dunes at sunset, camel silhouettes' } },
        { type: 'note', payload: { text: 'Nights in the desert camp drop cold fast — pack a warm layer.' } },
      ],
    ],
  },
  {
    title: 'Queenstown · adventure sports week',
    destination: { name: 'Queenstown, New Zealand', lat: -45.0312, lng: 168.6626, country: 'NZ' },
    perDay: [
      [
        { type: 'pin', payload: { name: 'Queenstown Airport', lat: -45.0211, lng: 168.7392, country: 'NZ' } },
        { type: 'transport', payload: { mode: 'Flight in + rental car' } },
        { type: 'stay', payload: { name: 'Lakeside lodge' } },
        { type: 'traveler', payload: {} },
      ],
      [
        { type: 'pin', payload: { name: 'Kawarau Gorge', lat: -45.0333, lng: 168.75, country: 'NZ' } },
        { type: 'activity', payload: { label: 'Bungy jump at the original bridge' } },
        { type: 'activity', payload: { label: 'Whitewater rafting on the Shotover' } },
        { type: 'note', payload: { text: 'Quick-dry layers — you will get soaked on the raft.' } },
      ],
      [
        { type: 'pin', payload: { name: 'Milford Sound', lat: -44.6614, lng: 167.9267, country: 'NZ' } },
        { type: 'activity', payload: { label: 'Fiord cruise past waterfalls' } },
        { type: 'image', payload: { name: 'Steep green fiord walls, mist over dark water' } },
        { type: 'transport', payload: { mode: 'Scenic drive back to Queenstown' } },
      ],
    ],
  },
];

// Dedicated demo seed — deliberately not part of TEMPLATES, so it never surfaces from "I'm Feeling
// Lucky" and stays a stable, known board for live demos.
const DEMO_SEED_TEMPLATE: Template = {
  title: 'Vancouver Island · July weekend · 3 day trip',
  destination: { name: 'Vancouver Island, Canada', lat: 49.3, lng: -124.5, country: 'CA' },
  perDay: [
    [
      { type: 'pin', payload: { name: 'Victoria', lat: 48.4284, lng: -123.3656, country: 'CA' } },
      { type: 'transport', payload: { mode: 'Ferry from Tsawwassen + rental car' } },
      { type: 'stay', payload: { name: 'Inn near the Inner Harbour' } },
      { type: 'traveler', payload: {} },
      { type: 'note', payload: { text: 'Book the ferry reservation ahead — summer weekend sailings fill up.' } },
    ],
    [
      { type: 'pin', payload: { name: 'Tofino', lat: 49.1530, lng: -125.9066, country: 'CA' } },
      { type: 'transport', payload: { mode: 'Drive across the island via Port Alberni' } },
      { type: 'activity', payload: { label: 'Surf lesson at Long Beach' } },
      { type: 'activity', payload: { label: 'Rainforest boardwalk at Rainforest Trail' } },
      { type: 'note', payload: { text: 'Coastal fog burns off by late morning — plan the beach for afternoon.' } },
    ],
    [
      { type: 'pin', payload: { name: 'Clayoquot Sound', lat: 49.2, lng: -125.9, country: 'CA' } },
      { type: 'activity', payload: { label: 'Morning whale-watching boat tour' } },
      { type: 'image', payload: { name: 'Misty Pacific inlet, forested islands, calm water' } },
      { type: 'transport', payload: { mode: 'Drive back to the ferry terminal' } },
    ],
  ],
};

// Anchor the trip a week from now (browser clock) so dates land inside Open-Meteo's forecast horizon.
function anchorDates(days: number): string[] {
  const start = addDays(new Date().toISOString().slice(0, 10), 7);
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

function buildFromTemplate(tpl: Template, theme: ThemeName): BoardState {
  const dates = anchorDates(tpl.perDay.length);
  const elements: BoardElement[] = [];
  // Strictly-increasing timestamps so the day-column card order is stable.
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const stamp = () => new Date(clock++).toISOString();

  dates.forEach((date, di) => {
    elements.push({ id: newId(), type: 'day', x: di, y: 0, payload: { date, index: di }, createdAt: stamp() });
    tpl.perDay[di].forEach((seed, yi) => {
      elements.push({
        id: newId(),
        type: seed.type,
        x: di,
        y: yi,
        payload: { date, ...seed.payload },
        createdAt: stamp(),
      });
    });
  });

  return {
    id: newId(),
    title: tpl.title,
    theme,
    trip: { destination: tpl.destination, dateRange: { start: dates[0], end: dates[dates.length - 1] } },
    elements,
    // Demo boards run in demo mode — the workspace hides secondary chrome (view toggle, save dot)
    // so the shopping loop stays front-and-centre for the workshop audience.
    demoMode: true,
    shoppingEnabled: false,
  };
}

function shuffled<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Shuffle bag: every template is served exactly once before any repeat, so a run of
// clicks covers the whole roster instead of the same few trips resurfacing by chance.
let bag: number[] = [];
let lastServed: number | undefined;

function nextTemplateIndex(): number {
  if (bag.length === 0) {
    bag = shuffled(TEMPLATES.map((_, i) => i));
    // Refilling can land the same template at the seam (old last === new first) — reshuffle until it doesn't.
    while (bag[0] === lastServed && bag.length > 1) bag = shuffled(bag);
  }
  lastServed = bag.pop()!;
  return lastServed;
}

// A fresh, fully-populated demo board with a random itinerary and a new id on every call.
export function buildRandomDemoBoard(theme: ThemeName): BoardState {
  return buildFromTemplate(TEMPLATES[nextTemplateIndex()], theme);
}

// The fixed Vancouver Island seed used to pre-populate a brand-new, empty boards list.
export function buildDemoSeedBoard(theme: ThemeName): BoardState {
  return buildFromTemplate(DEMO_SEED_TEMPLATE, theme);
}
