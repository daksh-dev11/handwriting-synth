import { K } from '../constants';
import type { PointerKind } from '../types';
import type { EmPoint } from './n1Guide';

export interface ResampledPoint {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  t: number;
}

export interface ResampledStroke {
  points: ResampledPoint[];
  arc: number[];
  length: number;
  isDot: boolean;
  pointerType: PointerKind;
}

const lerpPoint = (
  a: EmPoint,
  b: EmPoint,
  alpha: number,
  tValue: number,
): ResampledPoint => ({
  x: a.x + (b.x - a.x) * alpha,
  y: a.y + (b.y - a.y) * alpha,
  pressure: a.pressure + (b.pressure - a.pressure) * alpha,
  tiltX: a.tiltX + (b.tiltX - a.tiltX) * alpha,
  tiltY: a.tiltY + (b.tiltY - a.tiltY) * alpha,
  t: tValue,
});

export function n5Resample(stroke: readonly EmPoint[]): ResampledStroke {
  const pointerType = stroke.length > 0 ? stroke[0].pointerType : 'mouse';
  if (stroke.length === 0) {
    return { points: [], arc: [], length: 0, isDot: true, pointerType };
  }
  if (stroke.length === 1) {
    const p = stroke[0];
    return {
      points: [{ x: p.x, y: p.y, pressure: p.pressure, tiltX: p.tiltX, tiltY: p.tiltY, t: 0 }],
      arc: [0],
      length: 0,
      isDot: true,
      pointerType,
    };
  }

  const cum: number[] = [0];
  let L = 0;
  for (let i = 1; i < stroke.length; i++) {
    L += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
    cum.push(L);
  }

  if (L < K.DOT_MAX_LEN) {
    let sx = 0;
    let sy = 0;
    let sp = 0;
    let stx = 0;
    let sty = 0;
    for (const p of stroke) {
      sx += p.x;
      sy += p.y;
      sp += p.pressure;
      stx += p.tiltX;
      sty += p.tiltY;
    }
    const n = stroke.length;
    return {
      points: [{ x: sx / n, y: sy / n, pressure: sp / n, tiltX: stx / n, tiltY: sty / n, t: 0 }],
      arc: [0],
      length: L,
      isDot: true,
      pointerType,
    };
  }

  const ds = K.RESAMPLE_DS;
  const targets: number[] = [];
  const nFull = Math.floor(L / ds);
  for (let m = 0; m <= nFull; m++) targets.push(m * ds);
  const last = targets[targets.length - 1];
  if (L - last >= 0.4 * ds) targets.push(L);
  else targets[targets.length - 1] = L;

  const rawT0 = stroke[0].t;
  const rawTn = stroke[stroke.length - 1].t;
  const timesValid =
    Number.isFinite(rawT0) &&
    Number.isFinite(rawTn) &&
    stroke.every((p) => Number.isFinite(p.t)) &&
    rawTn - rawT0 > 0;
  const t0 = timesValid ? rawT0 : 0;

  const points: ResampledPoint[] = [];
  let seg = 0;
  for (let m = 0; m < targets.length; m++) {
    const s = targets[m];
    while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
    const segLen = cum[seg + 1] - cum[seg];
    const alpha = segLen > 1e-12 ? (s - cum[seg]) / segLen : 0;
    const a = stroke[seg];
    const b = stroke[seg + 1];
    const tRaw = timesValid ? a.t + (b.t - a.t) * alpha : m * 8;
    points.push(lerpPoint(a, b, alpha, (tRaw - t0) / 1000));
  }

  return { points, arc: targets, length: L, isDot: false, pointerType };
}
