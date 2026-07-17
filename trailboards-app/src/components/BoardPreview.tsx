// Decorative route thumbnail for a board card. Seeded by the board id so each card
// gets a stable, distinct little map — no element data needed (landing lists meta only).
import { fnv1a } from '../store/hash';

function seededPoints(seed: string): { x: number; y: number }[] {
  // Expand the id hash into a few pseudo-random but stable control points.
  let h = parseInt(fnv1a(seed), 16) >>> 0;
  const next = () => {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    return h / 0xffffffff;
  };
  const n = 2 + Math.floor(next() * 2); // 2–3 pins
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({
      x: 40 + (i * 190) / Math.max(1, n - 1) + (next() - 0.5) * 30,
      y: 55 + next() * 60,
    });
  }
  return pts;
}

function pathFrom(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let dstr = `M${pts[0].x.toFixed(0)} ${pts[0].y.toFixed(0)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const cx = (prev.x + cur.x) / 2;
    dstr += ` C${cx.toFixed(0)} ${prev.y.toFixed(0)} ${cx.toFixed(0)} ${cur.y.toFixed(0)} ${cur.x.toFixed(0)} ${cur.y.toFixed(0)}`;
  }
  return dstr;
}

export function BoardPreview({ seed }: { seed: string }) {
  const pts = seededPoints(seed);
  const route = pathFrom(pts);
  return (
    <>
      <svg className="contours" viewBox="0 0 272 158" preserveAspectRatio="none">
        <path d="M-8 40 C60 20 150 60 280 30" />
        <path d="M-8 70 C70 52 160 92 280 62" />
        <path d="M-8 104 C64 88 150 124 280 96" />
        <path d="M-8 136 C80 122 170 150 280 128" />
      </svg>
      <svg
        viewBox="0 0 272 158"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <path className="path" d={route} />
        {pts.map((p, i) => (
          <circle key={i} className="pin" cx={p.x} cy={p.y} r="4.5" />
        ))}
      </svg>
    </>
  );
}
