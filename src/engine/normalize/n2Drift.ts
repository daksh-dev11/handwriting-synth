import { EM, K } from '../constants';
import { X_CLASS } from '../charset';
import { clamp, median } from '../mathUtil';
import type { EmPoint } from './n1Guide';

export interface DriftInput {
  char: string;
  sessionIndex: number;
  strokes: EmPoint[][];
}

export interface DriftFit {
  b: number;
  meanIndex: number;
  medianHeight: number;
  count: number;
}

export function strokesHeight(strokes: readonly EmPoint[][]): number {
  let min = Infinity;
  let max = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.y < min) min = p.y;
      if (p.y > max) max = p.y;
    }
  }
  return max >= min ? max - min : 0;
}

export function driftScale(b: number, meanIndex: number, sessionIndex: number): number {
  const raw = Math.exp(-b * (sessionIndex - meanIndex));
  if (!Number.isFinite(raw)) return 1;
  return clamp(raw, K.DRIFT_CLAMP_LO, K.DRIFT_CLAMP_HI);
}

export function fitDrift(inputs: readonly DriftInput[]): DriftFit {
  const collected = inputs.filter((s) => X_CLASS.has(s.char));
  if (collected.length < K.DRIFT_MIN_SAMPLES) {
    return { b: 0, meanIndex: 0, medianHeight: 0, count: 0 };
  }

  const kept: { i: number; h: number }[] = [];
  for (const s of collected) {
    const h = strokesHeight(s.strokes);
    if (h >= K.DRIFT_MIN_H) kept.push({ i: s.sessionIndex, h });
  }
  if (kept.length < K.DRIFT_MIN_SAMPLES) {
    return { b: 0, meanIndex: 0, medianHeight: 0, count: 0 };
  }

  const medianHeight = median(kept.map((k) => k.h));
  const meanIndex = kept.reduce((sum, k) => sum + k.i, 0) / kept.length;
  const rs = kept.map((k) => Math.log(k.h / medianHeight));
  const meanR = rs.reduce((sum, r) => sum + r, 0) / rs.length;

  let num = 0;
  let den = 0;
  for (let j = 0; j < kept.length; j++) {
    const di = kept[j].i - meanIndex;
    num += di * (rs[j] - meanR);
    den += di * di;
  }

  let b = den === 0 ? 0 : num / den;
  if (!Number.isFinite(b)) b = 0;
  return { b, meanIndex, medianHeight, count: kept.length };
}

export function applyDrift(
  strokes: readonly EmPoint[][],
  sessionIndex: number,
  fit: DriftFit,
): EmPoint[][] {
  const k = driftScale(fit.b, fit.meanIndex, sessionIndex);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
  }
  if (maxX < minX) return strokes.map((stroke) => stroke.map((p) => ({ ...p })));
  const cx = (minX + maxX) / 2;
  return strokes.map((stroke) =>
    stroke.map((p) => ({
      ...p,
      x: cx + k * (p.x - cx),
      y: EM.baselineY + k * (p.y - EM.baselineY),
    })),
  );
}