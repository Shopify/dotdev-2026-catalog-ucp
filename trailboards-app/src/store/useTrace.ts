// Live agent-call trace for one board. Opens an SSE stream only while the drawer is open (closed =
// no connection, keeps idle boards quiet). The server replays stored calls first, then tails new
// ones; we dedupe by id and keep the most recent 200 (matching the server's per-board retention).
import { useEffect, useState } from 'react';
import type { AgentCall } from '../types';

const MAX_ROWS = 200;

export function useTrace(boardId: string, open: boolean): AgentCall[] {
  const [calls, setCalls] = useState<AgentCall[]>([]);

  useEffect(() => {
    if (!open) return;
    setCalls([]);
    const es = new EventSource(`/api/trace/${encodeURIComponent(boardId)}`);
    es.onmessage = (e) => {
      let row: AgentCall;
      try {
        row = JSON.parse(e.data) as AgentCall;
      } catch {
        return;
      }
      setCalls((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row].slice(-MAX_ROWS)));
    };
    // The browser auto-reconnects on error using the server's `retry:` hint — nothing to do here.
    return () => es.close();
  }, [boardId, open]);

  return calls;
}
