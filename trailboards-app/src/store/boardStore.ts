// Board state = plain useReducer + context (LLD R-Q2: no Redux/Zustand).
// The reducer is pure; a companion classifier tells the scheduler whether a change
// resolves immediately (structured) or after a debounce (free text) — LLD §8.2.

import type { BoardElement, BoardState, ElementType, ThemeName, TripMeta } from '../types';
import { defaultBoardTitle } from '../lib/format';

export const DEBOUNCE_MS = 900; // free-note trailing edge (LLD §8.2: 800–1200ms)

export type BoardAction =
  | { type: 'load'; board: BoardState }
  | { type: 'setTheme'; theme: ThemeName }
  | { type: 'setTrip'; trip: TripMeta }
  | { type: 'reconcileTrip'; trip: TripMeta; elements: BoardElement[] }
  | { type: 'addElement'; element: BoardElement }
  | {
      type: 'updateElement';
      id: string;
      patch: Partial<Pick<BoardElement, 'payload' | 'x' | 'y'>>;
    }
  | { type: 'moveElement'; id: string; x: number; y: number }
  | { type: 'removeElement'; id: string }
  | { type: 'setDemo'; demoMode: boolean }
  | { type: 'setShopping'; shoppingEnabled: boolean };

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'load':
      return action.board;
    case 'setTheme':
      return { ...state, theme: action.theme };
    case 'setTrip': {
      const trip = { ...state.trip, ...action.trip };
      return { ...state, trip, title: defaultBoardTitle(trip) };
    }
    case 'reconcileTrip': {
      const trip = { ...state.trip, ...action.trip };
      return { ...state, trip, title: defaultBoardTitle(trip), elements: action.elements };
    }
    case 'addElement':
      return { ...state, elements: [...state.elements, action.element] };
    case 'updateElement':
      return {
        ...state,
        elements: state.elements.map((el) =>
          el.id === action.id
            ? {
                ...el,
                ...action.patch,
                payload: action.patch.payload
                  ? { ...el.payload, ...action.patch.payload }
                  : el.payload,
              }
            : el,
        ),
      };
    case 'moveElement':
      return {
        ...state,
        elements: state.elements.map((el) =>
          el.id === action.id ? { ...el, x: action.x, y: action.y } : el,
        ),
      };
    case 'removeElement':
      return { ...state, elements: state.elements.filter((el) => el.id !== action.id) };
    case 'setDemo':
      return { ...state, demoMode: action.demoMode };
    case 'setShopping':
      return { ...state, shoppingEnabled: action.shoppingEnabled };
    default:
      return state;
  }
}

// Free-text element types debounce; every other structured change resolves immediately.
const TEXT_TYPES: ElementType[] = ['note'];

function elementType(state: BoardState, id: string): ElementType | undefined {
  return state.elements.find((el) => el.id === id)?.type;
}

// Delay (ms) the scheduler should wait before resolving after this action.
// `null` = this change never resolves (pure layout, e.g. drag reposition).
export function resolveDelay(prev: BoardState, action: BoardAction): number | null {
  switch (action.type) {
    case 'moveElement':
      return null; // position is layout, not context
    case 'setTheme':
    case 'setDemo':
    case 'load':
      return null; // never affects TrailboardContext
    case 'addElement':
      return TEXT_TYPES.includes(action.element.type) ? DEBOUNCE_MS : 0;
    case 'updateElement': {
      if (action.patch.payload === undefined) return null; // only x/y moved
      const t = elementType(prev, action.id);
      return t && TEXT_TYPES.includes(t) ? DEBOUNCE_MS : 0;
    }
    case 'removeElement':
    case 'setTrip':
    case 'reconcileTrip':
      return 0;
    default:
      return null;
  }
}
