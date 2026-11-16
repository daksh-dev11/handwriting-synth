import type { CubicBezier, Pt } from './types';

export function wrap(a: number): number {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x <= -Math.PI) x += 2 * Math.PI;
  return x;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function tanh(x: number): number {
  return Math.tanh(x);
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(v: Pt, s: number): Pt {
  return { x: v.x * s, y: v.y * s };
}

export function dot(a: Pt, b: Pt): number {
  return a.x * b.x + a.y * b.y;
}

export function normalize(v: Pt): Pt {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-12) return { x: 1, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function cubicPoint(c: CubicBezier, t: number): Pt {
  const mt = 1 - t;
  const b0 = mt * mt * mt;
  const b1 = 3 * t * mt * mt;
  const b2 = 3 * t * t * mt;
  const b3 = t * t * t;
  return {
    x: b0 * c.p0.x + b1 * c.p1.x + b2 * c.p2.x + b3 * c.p3.x,
    y: b0 * c.p0.y + b1 * c.p1.y + b2 * c.p2.y + b3 * c.p3.y,
  };
}

export function cubicDerivative(c: CubicBezier, t: number): Pt {
  const mt = 1 - t;
  const d0 = 3 * mt * mt;
  const d1 = 6 * mt * t;
  const d2 = 3 * t * t;
  return {
    x: d0 * (c.p1.x - c.p0.x) + d1 * (c.p2.x - c.p1.x) + d2 * (c.p3.x - c.p2.x),
    y: d0 * (c.p1.y - c.p0.y) + d1 * (c.p2.y - c.p1.y) + d2 * (c.p3.y - c.p2.y),
  };
}

export function cubicSecondDerivative(c: CubicBezier, t: number): Pt {
  const mt = 1 - t;
  return {
    x: 6 * mt * (c.p2.x - 2 * c.p1.x + c.p0.x) + 6 * t * (c.p3.x - 2 * c.p2.x + c.p1.x),
    y: 6 * mt * (c.p2.y - 2 * c.p1.y + c.p0.y) + 6 * t * (c.p3.y - 2 * c.p2.y + c.p1.y),
  };
}