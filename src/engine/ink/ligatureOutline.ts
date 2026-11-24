import { K } from '../constants';
import { ribbonPath } from './ribbon';
import type { LigatureCubic, NormalizedStroke, PathCmd } from '../types';

export function ligatureOutline(lig: LigatureCubic, W: number, inkI: number): PathCmd[] {
  const stroke: NormalizedStroke = {
    segments: [{ p0: lig.p0, p1: lig.p1, p2: lig.p2, p3: lig.p3 }],
    pressure: [
      { u: 0, p: K.LIG_PRESSURE_SCALE * lig.pressureStart },
      { u: 1, p: K.LIG_PRESSURE_SCALE * lig.pressureEnd },
    ],
    isDot: false,
  };
  return ribbonPath([stroke], W, inkI, 1.0).path;
}