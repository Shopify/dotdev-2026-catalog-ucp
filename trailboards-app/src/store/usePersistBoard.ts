// Debounced write-through: board mutations flush to PUT /api/boards/:id.
// Skips the first run after hydration so we don't immediately re-save what we loaded.
import { useEffect, useRef } from 'react';
import type { BoardState } from '../types';
import { putBoard } from '../api/boards';

const PERSIST_MS = 600;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function usePersistBoard(
  state: BoardState,
  onStatus?: (s: SaveStatus) => void,
): void {
  const firstRun = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    onStatus?.('saving');
    timer.current = setTimeout(() => {
      putBoard(state)
        .then(() => onStatus?.('saved'))
        .catch(() => onStatus?.('error'));
    }, PERSIST_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state, onStatus]);
}
