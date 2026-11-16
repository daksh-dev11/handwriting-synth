import { K } from '../constants';
import { clamp, smoothstep } from '../mathUtil';
import type { PointerKind } from '../types';
import type { ResampledPoint } from './n5Resample';

export function synthesizePressureAtVelocity(v: number): number {
  return K.P_MIN + (K.P_MAX - K.P_MIN) * Math.exp(-v / K.V0);
}

export function needsSynthesis(
  points: readonly ResampledPoint[],
  pointerType: PointerKind,
): boolean {
  if (pointerType !== 'pen') return true;
  if (points.length === 0) return true;
  let min = Infinity;
  let max = -Infinity;
  let allZero = true;
  let allHalf = true;
  for (const p of points) {
    if (p.pressure < min) min = p.pressure;
    if (p.pressure > max) max = p.pressure;
    if (p.pressure !== 0) allZero = false;
    if (p.pressure !== 0.5) allHalf = false;
  }
  return allZero || allHalf || max - min < 0.02;
}

function velocityAt(points: readonly ResampledPoint[], m: number): number {
  const n = points.length - 1;
  if (n <= 0) return 0;
  if (m <= 0) {
    const dt = points[1].t - points[0].t;
    if (dt <= 1e-9) return 0;
    return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) / dt;
  }
  if (m >= n) {
    const dt = points[n].t - points[n - 1].t;
    if (dt <= 1e-9) return 0;
    return Math.hypot(points[n].x - points[n - 1].x, points[n].y - points[n - 1].y) / dt;
  }
  const dt = points[m + 1].t - points[m - 1].t;
  if (dt <= 1e-9) return 0;
  return Math.hypot(points[m + 1].x - points[m - 1].x, points[m + 1].y - points[m - 1].y) / dt;
}

export function resolvePressure(
  points: readonly ResampledPoint[],
  arc: readonly number[],
  S: number,
  pointerType: PointerKind,
): number[] {
  const n = points.length;
  if (n === 0) return [];

  let p: number[];
  if (needsSynthesis(points, pointerType)) {
    const synth = points.map((_, m) => synthesizePressureAtVelocity(velocityAt(points, m)));
    p = synth.slice();
    if (n >= 2) {
      for (let m = 1; m <= n - 2; m++) {
        p[m] = 0.25 * synth[m - 1] + 0.5 * synth[m] + 0.25 * synth[m + 1];
      }
      p[0] = p[1];
      p[n - 1] = p[n - 2];
    }
  } else {
    p = points.map((pt) => pt.pressure);
  }

  for (let m = 0; m < n; m++) {
    const s = arc[m] ?? 0;
    const tpStart = 0.55 + 0.45 * smoothstep(0, K.TAPER_LEN, s);
    const tpEnd = 0.55 + 0.45 * smoothstep(0, K.TAPER_LEN, S - s);
    p[m] = clamp(p[m] * Math.min(tpStart, tpEnd), 0, 1);
  }
  return p;
}