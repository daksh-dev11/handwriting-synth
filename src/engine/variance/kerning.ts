import { EM, K } from '../constants';
import { clamp } from '../mathUtil';

export function profileRowWeights(rows: number = K.PROFILE_ROWS): number[] {
  const step = (EM.descenderY - EM.ascenderY) / rows;
  const weights: number[] = [];
  for (let j = 0; j < rows; j++) {
    const y = EM.ascenderY + (j + 0.5) * step;
    weights.push(y >= EM.xHeightY && y <= EM.baselineY ? K.ROW_W_CORE : K.ROW_W_OUTER);
  }
  return weights;
}

export function opticalKernDelta(
  advA: number,
  rightA: readonly (number | null)[],
  leftB: readonly (number | null)[],
  weights: readonly number[],
): number {
  const rows = rightA.length;
  let sumW = 0;
  let sumWG = 0;
  for (let j = 0; j < rows; j++) {
    const r = rightA[j];
    const l = j < leftB.length ? leftB[j] : null;
    const gap = r === null || r === undefined || l === null || l === undefined
      ? K.GAP_CAP
      : Math.min(advA + l - r, K.GAP_CAP);
    const w = j < weights.length ? weights[j] : 0;
    sumW += w;
    sumWG += w * gap;
  }
  const g0 = sumW > 0 ? sumWG / sumW : K.GAP_CAP;
  return clamp(K.KERN_DAMP * (K.TARGET_GAP - g0), K.KERN_MIN, K.KERN_MAX);
}