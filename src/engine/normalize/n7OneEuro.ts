import { K } from '../constants';
import type { Pt } from '../types';

const alpha = (fc: number, dt: number): number => 1 / (1 + 1 / (2 * Math.PI * fc * dt));

export function oneEuroPass(P: readonly Pt[], t: readonly number[]): Pt[] {
  const n = P.length;
  if (n === 0) return [];
  const out: Pt[] = new Array<Pt>(n);
  out[0] = { x: P[0].x, y: P[0].y };
  let dx = 0;
  let dy = 0;
  for (let m = 1; m < n; m++) {
    const dt = Math.max(t[m] - t[m - 1], 1e-3);
    const rawX = (P[m].x - out[m - 1].x) / dt;
    const rawY = (P[m].y - out[m - 1].y) / dt;
    const aD = alpha(K.ONE_EURO_D_CUTOFF, dt);
    dx += aD * (rawX - dx);
    dy += aD * (rawY - dy);
    const speed = Math.hypot(dx, dy);
    const fc = K.ONE_EURO_MIN_CUTOFF + K.ONE_EURO_BETA * speed;
    const a = alpha(fc, dt);
    out[m] = {
      x: out[m - 1].x + a * (P[m].x - out[m - 1].x),
      y: out[m - 1].y + a * (P[m].y - out[m - 1].y),
    };
  }
  return out;
}

export function smoothOneEuro(P: readonly Pt[], t: readonly number[]): Pt[] {
  const n = P.length;
  if (n <= 1) return P.map((p) => ({ x: p.x, y: p.y }));

  const F = oneEuroPass(P, t);

  const revP = P.slice().reverse();
  const revT = t.slice().reverse();
  const tEnd = t[n - 1];
  const shifted = revT.map((value) => tEnd - value);
  const Bf = oneEuroPass(revP, shifted);
  const B = Bf.slice().reverse();

  const out: Pt[] = new Array<Pt>(n);
  for (let m = 0; m < n; m++) {
    const w = m / (n - 1);
    out[m] = {
      x: (1 - w) * F[m].x + w * B[m].x,
      y: (1 - w) * F[m].y + w * B[m].y,
    };
  }
  return out;
}