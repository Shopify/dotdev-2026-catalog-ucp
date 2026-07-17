// One source of truth for the 7 canvas card types: icon, label, and the payload key
// that holds the editable primary value. buildContext reads these same keys (LLD §7),
// so the field a user types into is exactly what flows to the recommendation context.
import type { ReactNode } from 'react';
import type { ElementType } from '../types';

export type CardType = Exclude<ElementType, 'day'>;

export interface ElementMeta {
  label: string;
  primaryKey: string;
  placeholder: string;
  multiline?: boolean;
  icon: ReactNode;
}

export const ELEMENT_META: Record<CardType, ElementMeta> = {
  pin: {
    label: 'location',
    primaryKey: 'name',
    placeholder: 'Name this place',
    icon: (
      <>
        <path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
  },
  stay: {
    label: 'stay',
    primaryKey: 'name',
    placeholder: 'Where are you staying?',
    icon: (
      <>
        <path d="M3 11l9-7 9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
  },
  activity: {
    label: 'activity',
    primaryKey: 'label',
    placeholder: "What's the plan?",
    icon: <path d="M3 20l6-11 4 6 3-5 5 10z" />,
  },
  transport: {
    label: 'transport',
    primaryKey: 'mode',
    placeholder: 'How do you get there?',
    icon: (
      <>
        <path d="M4 17h16" />
        <circle cx="7" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
        <path d="M5 17l2-6h8l3 6" />
      </>
    ),
  },
  traveler: {
    label: 'travelers',
    primaryKey: 'name',
    placeholder: "Who's coming?",
    icon: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 6a3 3 0 0 1 0 6" />
        <path d="M18 20a6 6 0 0 0-3-5" />
      </>
    ),
  },
  note: {
    label: 'note',
    primaryKey: 'text',
    placeholder: 'Jot a note…',
    multiline: true,
    icon: <path d="M5 4h14v16l-4-3H5z" />,
  },
  image: {
    label: 'inspiration',
    primaryKey: 'name',
    placeholder: 'Describe the inspiration',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="M21 16l-5-5-8 8" />
      </>
    ),
  },
};

// Order shown in the per-day add menu.
export const ADD_ORDER: CardType[] = [
  'pin',
  'stay',
  'activity',
  'transport',
  'traveler',
  'note',
  'image',
];
