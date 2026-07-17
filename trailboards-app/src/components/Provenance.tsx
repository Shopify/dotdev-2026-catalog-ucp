// Provenance — the "why this?" disclosure under a recommendation. Each Factor resolveIntent returned
// is one board/weather/profile/catalog/image row, colour-tagged by source (agent for guidance, but the
// buyer can always audit which real signals produced the suggestion).
import type { Factor } from '../types';

const SRC: Record<Factor['kind'], { cls: string; tag: string }> = {
  BOARD: { cls: 'board', tag: 'board' },
  WEATHER: { cls: 'wx', tag: 'weather' },
  PROFILE: { cls: 'profile', tag: 'profile' },
  IMAGE: { cls: 'img', tag: 'image' },
  CATALOG: { cls: 'cat', tag: 'catalog' },
};

export function Provenance({ reasons, className }: { reasons: Factor[]; className?: string }) {
  if (!reasons.length) return null;
  return (
    <details className={className ? `prov ${className}` : 'prov'}>
      <summary>
        why this?<span className="caret">›</span>
      </summary>
      <div className="factors">
        {reasons.map((f, i) => {
          const s = SRC[f.kind];
          return (
            <div className="factor" key={`${f.kind}-${i}`}>
              <span className={`src ${s.cls}`}>{s.tag}</span>
              {f.label}
            </div>
          );
        })}
      </div>
    </details>
  );
}
