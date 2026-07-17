// "Traces" — the live agent-call trace drawer (board-mockup.html §nerds). Every UCP call
// the board makes (search_catalog / get_product / lookup_catalog / create_cart) streams in here with
// its request, response, status and timing. This is the "systems own truth" panel: it shows the real
// network calls behind each recommendation, not the agent's narration. Purely a viewer — data comes
// from useTrace (SSE); the DOM class names match the mockup so trace.css applies unchanged.
import { useMemo, useState } from 'react';
import type { AgentCall } from '../types';
import { highlightJson } from '../lib/jsonHighlight';

// backend → drawer presentation (tag colour class, label, HTTP method).
const BACKENDS: Record<AgentCall['backend'], { cls: string; label: string; method: string }> = {
  catalog: { cls: 'catalog', label: 'Catalog', method: 'POST' },
  merchant: { cls: 'ucp', label: 'Cart · UCP', method: 'POST' },
  weather: { cls: 'wx', label: 'Open-Meteo', method: 'GET' },
  agent: { cls: 'geo', label: 'Agent', method: 'POST' },
};

function meta(backend: AgentCall['backend'], request: unknown): string {
  if (backend === 'catalog') return 'POST · catalog.shopify.com/api/ucp/mcp';
  if (backend === 'weather') return 'GET · api.open-meteo.com';
  if (backend === 'merchant') {
    const shop = (request as { shopDomain?: string })?.shopDomain;
    return `POST · ${shop ? `${shop}/api/ucp/mcp` : 'merchant'}`;
  }
  if (backend === 'agent') return 'resolve · board context → shopping intent';
  return 'POST';
}

// A compact one-line hint after the tool name, so the collapsed row reads at a glance.
function callHint(call: AgentCall): string {
  const req = call.request as Record<string, unknown> | null;
  const cat = (req?.catalog ?? req) as Record<string, unknown> | undefined;
  if (call.backend === 'catalog') {
    if (cat?.like) return 'visual search · like[].image';
    if (typeof cat?.query === 'string') return `q="${cat.query}"`;
    if (cat?.id) return String(cat.id);
    if (Array.isArray(cat?.ids)) return `${(cat.ids as unknown[]).length} ids`;
  }
  if (call.backend === 'merchant') {
    const cart = (req?.cart ?? {}) as { line_items?: unknown[] };
    const n = Array.isArray(cart.line_items) ? cart.line_items.length : 0;
    return `${n} line item${n === 1 ? '' : 's'}`;
  }
  if (call.backend === 'agent') {
    const res = call.response as Record<string, unknown> | null;
    const source = typeof res?.source === 'string' ? res.source : '';
    const q = typeof res?.searchQuery === 'string' ? res.searchQuery : (res?.intentQuery as string) || '';
    const mode = res?.mode === 'image (like[])' ? 'image' : q ? `q="${q}"` : '';
    return [source, mode].filter(Boolean).join(' · ');
  }
  return '';
}

function clockLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const cs = String(Math.floor(d.getMilliseconds() / 10)).padStart(2, '0');
  return `${hh}:${mm}:${ss}.${cs}`;
}

function TraceRow({ call }: { call: AgentCall }) {
  const b = BACKENDS[call.backend] ?? BACKENDS.catalog;
  const ok = call.status === 'ok';
  const hint = callHint(call);
  return (
    <details className="row" data-tg={b.cls}>
      <summary>
        <span className="t">{clockLabel(call.createdAt)}</span>
        <span className={`m ${b.method.toLowerCase()}`}>{b.method}</span>
        <span className={`tg ${b.cls}`}>
          <i />
          {b.label}
        </span>
        <span className="call">
          <span className="tool">{call.tool}</span>
          {hint && ` · ${hint}`}
        </span>
        <span className="dur">{call.latencyMs}ms</span>
        <span className={ok ? 'st' : 'st err'} />
        <svg className="caretr" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </summary>
      <div className="io">
        <div className="io-b req">
          <div className="io-h">
            <span className="io-tag">Request</span>
            <span className="io-meta">{meta(call.backend, call.request)}</span>
          </div>
          <pre>{highlightJson(call.request)}</pre>
        </div>
        <div className="io-b res">
          <div className="io-h">
            <span className="io-tag">Response</span>
            <span className="io-meta">
              {ok ? '200' : 'error'} · {call.latencyMs}ms
            </span>
          </div>
          <pre>{highlightJson(call.response)}</pre>
        </div>
      </div>
    </details>
  );
}

export function TraceDrawer({
  calls,
  open,
  onClose,
}: {
  calls: AgentCall[];
  open: boolean;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<AgentCall['backend'] | 'all'>('all');

  const backends = useMemo(() => [...new Set(calls.map((c) => c.backend))], [calls]);
  const shown = filter === 'all' ? calls : calls.filter((c) => c.backend === filter);
  const totalMs = calls.reduce((n, c) => n + (c.latencyMs || 0), 0);

  return (
    <section className={open ? 'nerds open' : 'nerds'} aria-label="Agent call trace" inert={!open}>
      <div className="nerds-top">
        <span className="ttl">Traces</span>
        <span className="live">
          <i />
          live
        </span>
        <div className="metrics">
          <span>
            <b>{calls.length}</b> calls
          </span>
          <span>
            <b>{backends.length}</b> backend{backends.length === 1 ? '' : 's'}
          </span>
          <span>
            <b>{(totalMs / 1000).toFixed(2)}s</b> total
          </span>
        </div>
        <button className="close" type="button" title="close" onClick={onClose}>
          <svg viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="nerds-filter">
        <button className={filter === 'all' ? 'on' : ''} type="button" onClick={() => setFilter('all')}>
          All
        </button>
        {backends.map((bk) => (
          <button key={bk} className={filter === bk ? 'on' : ''} type="button" onClick={() => setFilter(bk)}>
            {(BACKENDS[bk] ?? BACKENDS.catalog).label}
          </button>
        ))}
      </div>

      <div className="nerds-log">
        {shown.length === 0 ? (
          <p className="nerds-empty">No calls yet — edit the board to trigger a search.</p>
        ) : (
          shown.map((c) => <TraceRow key={c.id} call={c} />)
        )}
      </div>
    </section>
  );
}
