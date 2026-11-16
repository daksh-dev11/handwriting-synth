import { K } from '../constants';
import {
  cubicDerivative,
  cubicPoint,
  cubicSecondDerivative,
  dist,
  dot,
  normalize,
} from '../mathUtil';
import type { CubicBezier, PressureKnot, Pt } from '../types';

interface FitError {
  maxSq: number;
  index: number;
}

function chordParameters(P: readonly Pt[], first: number, last: number): number[] {
  const span = last - first;
  const u: number[] = new Array<number>(span + 1);
  u[0] = 0;
  let total = 0;
  for (let i = first + 1; i <= last; i++) {
    total += dist(P[i], P[i - 1]);
    u[i - first] = total;
  }
  if (total <= 1e-12) {
    for (let k = 0; k <= span; k++) u[k] = span === 0 ? 0 : k / span;
    return u;
  }
  for (let k = 0; k <= span; k++) u[k] /= total;
  return u;
}

function generateBezier(
  P: readonly Pt[],
  first: number,
  last: number,
  u: readonly number[],
  tHat1: Pt,
  tHat2: Pt,
): CubicBezier {
  let C00 = 0;
  let C01 = 0;
  let C11 = 0;
  let X0 = 0;
  let X1 = 0;

  const pFirst = P[first];
  const pLast = P[last];

  for (let i = first; i <= last; i++) {
    const ui = u[i - first];
    const mt = 1 - ui;
    const b0 = mt * mt * mt;
    const b1 = 3 * ui * mt * mt;
    const b2 = 3 * ui * ui * mt;
    const b3 = ui * ui * ui;
    const A1 = { x: tHat1.x * b1, y: tHat1.y * b1 };
    const A2 = { x: tHat2.x * b2, y: tHat2.y * b2 };
    C00 += dot(A1, A1);
    C01 += dot(A1, A2);
    C11 += dot(A2, A2);
    const base = {
      x: pFirst.x * (b0 + b1) + pLast.x * (b2 + b3),
      y: pFirst.y * (b0 + b1) + pLast.y * (b2 + b3),
    };
    const d = { x: P[i].x - base.x, y: P[i].y - base.y };
    X0 += dot(A1, d);
    X1 += dot(A2, d);
  }

  const det = C00 * C11 - C01 * C01;
  const segLen = dist(pLast, pFirst);
  const epsilon = 1e-6 * segLen;
  let alpha1 = 0;
  let alpha2 = 0;
  if (Math.abs(det) >= 1e-12) {
    alpha1 = (X0 * C11 - X1 * C01) / det;
    alpha2 = (C00 * X1 - C01 * X0) / det;
  }
  if (Math.abs(det) < 1e-12 || alpha1 < epsilon || alpha2 < epsilon) {
    alpha1 = segLen / 3;
    alpha2 = segLen / 3;
  }

  return {
    p0: { x: pFirst.x, y: pFirst.y },
    p1: { x: pFirst.x + tHat1.x * alpha1, y: pFirst.y + tHat1.y * alpha1 },
    p2: { x: pLast.x + tHat2.x * alpha2, y: pLast.y + tHat2.y * alpha2 },
    p3: { x: pLast.x, y: pLast.y },
  };
}

function maxError(
  curve: CubicBezier,
  P: readonly Pt[],
  u: readonly number[],
  first: number,
  last: number,
): FitError {
  let maxSq = -1;
  let index = first;
  for (let i = first; i <= last; i++) {
    const q = cubicPoint(curve, u[i - first]);
    const dx = q.x - P[i].x;
    const dy = q.y - P[i].y;
    const sq = dx * dx + dy * dy;
    if (sq > maxSq) {
      maxSq = sq;
      index = i;
    }
  }
  return { maxSq, index };
}

function reparameterize(curve: CubicBezier, p: Pt, u: number): number {
  const q = cubicPoint(curve, u);
  const dq = cubicDerivative(curve, u);
  const ddq = cubicSecondDerivative(curve, u);
  const qp = { x: q.x - p.x, y: q.y - p.y };
  const den = dot(dq, dq) + dot(qp, ddq);
  if (Math.abs(den) < 1e-12) return u;
  const next = u - dot(qp, dq) / den;
  return Number.isFinite(next) ? next : u;
}

function fitCubic(
  P: readonly Pt[],
  first: number,
  last: number,
  tHat1: Pt,
  tHat2: Pt,
  epsilon: number,
): CubicBezier[] {
  if (last - first === 1) {
    const d = dist(P[last], P[first]);
    return [
      {
        p0: { x: P[first].x, y: P[first].y },
        p1: { x: P[first].x + (tHat1.x * d) / 3, y: P[first].y + (tHat1.y * d) / 3 },
        p2: { x: P[last].x + (tHat2.x * d) / 3, y: P[last].y + (tHat2.y * d) / 3 },
        p3: { x: P[last].x, y: P[last].y },
      },
    ];
  }

  const u = chordParameters(P, first, last);
  let curve = generateBezier(P, first, last, u, tHat1, tHat2);
  let err = maxError(curve, P, u, first, last);
  const eps2 = epsilon * epsilon;

  if (err.maxSq < eps2) return [curve];

  if (err.maxSq < 4 * eps2) {
    for (let iter = 0; iter < K.FIT_MAX_REPARAM_ITER; iter++) {
      for (let i = first + 1; i < last; i++) {
        u[i - first] = reparameterize(curve, P[i], u[i - first]);
      }
      curve = generateBezier(P, first, last, u, tHat1, tHat2);
      err = maxError(curve, P, u, first, last);
      if (err.maxSq < eps2) return [curve];
    }
  }

  let split = err.index;
  if (split <= first) split = first + 1;
  if (split >= last) split = last - 1;

  const center = normalize({ x: P[split - 1].x - P[split + 1].x, y: P[split - 1].y - P[split + 1].y });
  const negCenter = { x: -center.x, y: -center.y };
  const left = fitCubic(P, first, split, tHat1, center, epsilon);
  const right = fitCubic(P, split, last, negCenter, tHat2, epsilon);
  return left.concat(right);
}

export function fitBezierChain(P: readonly Pt[], epsilon: number = K.FIT_ERROR): CubicBezier[] {
  const n = P.length - 1;
  if (n < 1) return [];
  let tHat1: Pt;
  let tHat2: Pt;
  if (n === 1) {
    tHat1 = normalize({ x: P[1].x - P[0].x, y: P[1].y - P[0].y });
    tHat2 = { x: -tHat1.x, y: -tHat1.y };
  } else {
    tHat1 = normalize({ x: P[2].x - P[0].x, y: P[2].y - P[0].y });
    tHat2 = normalize({ x: P[n - 2].x - P[n].x, y: P[n - 2].y - P[n].y });
  }
  return fitCubic(P, 0, n, tHat1, tHat2, epsilon);
}

export function pressureKnots(P: readonly Pt[], pressure: readonly number[]): PressureKnot[] {
  const n = P.length - 1;
  if (n < 1) return [];
  const arc: number[] = [0];
  let total = 0;
  for (let i = 1; i <= n; i++) {
    total += dist(P[i], P[i - 1]);
    arc.push(total);
  }
  const u: number[] = new Array<number>(n + 1);
  if (total <= 1e-12) {
    for (let i = 0; i <= n; i++) u[i] = i / n;
  } else {
    for (let i = 0; i <= n; i++) u[i] = arc[i] / total;
  }

  let collapsed = false;
  for (let i = 1; i < n; i++) {
    const minU = u[i - 1] + 1e-9;
    if (u[i] < minU) u[i] = minU;
    if (u[i] >= 1) collapsed = true;
  }
  if (collapsed) {
    for (let i = 0; i <= n; i++) u[i] = i / n;
  }
  u[0] = 0;
  u[n] = 1;

  const knots: PressureKnot[] = [];
  for (let i = 0; i <= n; i++) {
    knots.push({ u: u[i], p: pressure[i] ?? 0 });
  }
  return knots;
}