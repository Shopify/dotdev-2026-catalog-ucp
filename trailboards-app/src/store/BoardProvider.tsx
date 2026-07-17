// Board context: owns the reducer and records the resolve-delay of each dispatched
// action so the scheduler (useResolveScheduler) can time resolves per LLD §8.2.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { BoardState } from '../types';
import { boardReducer, resolveDelay, type BoardAction } from './boardStore';

interface BoardContextValue {
  state: BoardState;
  dispatch: (action: BoardAction) => void;
  /** Delay (ms) for the last dispatched action; `null` = no resolve. Read by the scheduler. */
  lastDelayRef: React.MutableRefObject<number | null>;
}

const Ctx = createContext<BoardContextValue | null>(null);

export function BoardProvider({
  initial,
  children,
}: {
  initial: BoardState;
  children: ReactNode;
}) {
  const [state, rawDispatch] = useReducer(boardReducer, initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastDelayRef = useRef<number | null>(null);

  // Compute the resolve-delay against the pre-action state, then apply.
  const dispatch = useCallback((action: BoardAction) => {
    lastDelayRef.current = resolveDelay(stateRef.current, action);
    rawDispatch(action);
  }, []);

  const value = useMemo(() => ({ state, dispatch, lastDelayRef }), [state, dispatch]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBoard must be used within BoardProvider');
  return ctx;
}
