import type { CubicBezier, Pt } from '../types';

export function catmullRomToBeziers(P: Pt[]): CubicBezier[] {
  if (P.length < 2) return [];
  const n = P.length - 1;
  const at = (i: number): Pt =>
    i < 0
      ? { x: 2 * P[0].x - P[1].x, y: 2 * P[0].y - P[1].y }
      : i > n
        ? { x: 2 * P[n].x - P[n - 1].x, y: 2 * P[n].y - P[n - 1].y }
        : P[i];
  const out: CubicBezier[] = [];
  for (let i = 0; i < n; i++) {
    const a = at(i - 1);
    const b = P[i];
    const c = P[i + 1];
    const d = at(i + 2);
    out.push({
      p0: b,
      p1: { x: b.x + (c.x - a.x) / 6, y: b.y + (c.y - a.y) / 6 },
      p2: { x: c.x - (d.x - b.x) / 6, y: c.y - (d.y - b.y) / 6 },
      p3: c,
    });
  }
  return out;
}