import { CH, K } from '../constants';
import { clamp, tanh } from '../mathUtil';
import { gauss, perlin1 } from '../rng';

export function fatigue(k: number): number {
  return 1 + K.FATIGUE_GAIN * (1 - Math.exp(-k / K.FATIGUE_TAU));
}

export interface SlantTerms {
  zTheta: number;
  pTheta: number;
  thetaDeg: number;
  thetaRad: number;
}

export function slantTerms(seed: number, k: number, sTheta: number): SlantTerms {
  const zTheta = gauss(seed, k, CH.SLANT_F);
  const pTheta = perlin1(seed, CH.SLANT_M, k / K.MEDIUM_PERIOD);
  const thetaDeg = clamp(
    fatigue(k) * (K.SIGMA_THETA_F * sTheta * zTheta + K.AMP_THETA_M * sTheta * pTheta),
    -K.THETA_CLAMP,
    K.THETA_CLAMP,
  );
  return { zTheta, pTheta, thetaDeg, thetaRad: (thetaDeg * Math.PI) / 180 };
}

export function deltaYGlyph(seed: number, k: number, sY: number): number {
  const zy = gauss(seed, k, CH.BASE_F);
  const py = perlin1(seed, CH.BASE_M, k / K.MEDIUM_PERIOD);
  return fatigue(k) * (K.SIGMA_Y_F * sY * zy + K.AMP_Y_M * sY * py);
}

export function lineTiltDeg(seed: number, line: number): number {
  return K.SIGMA_LINE_TILT * gauss(seed, line, CH.LINE_TILT);
}

export function waveTerm(seed: number, x: number, line: number, sY: number): number {
  return K.AMP_Y_WAVE * sY * perlin1(seed, CH.LINE_WAVE, x / K.WAVE_WAVELENGTH + 7.31 * line);
}

export function deltaYLine(seed: number, x: number, line: number, sY: number): number {
  return Math.tan((lineTiltDeg(seed, line) * Math.PI) / 180) * x + waveTerm(seed, x, line, sY);
}

export function deltaYWord(seed: number, word: number, sY: number): number {
  return K.SIGMA_Y_WORD * sY * gauss(seed, word, CH.WORD);
}

export function softClamp(raw: number): number {
  return K.Y_SOFT_CLAMP * tanh(raw / K.Y_SOFT_CLAMP);
}

export function deltaY(
  seed: number,
  k: number,
  x: number,
  line: number,
  word: number,
  cfg: { baselineDrift: number },
): number {
  const sY = cfg.baselineDrift;
  return softClamp(deltaYGlyph(seed, k, sY) + deltaYLine(seed, x, line, sY) + deltaYWord(seed, word, sY));
}

export function deltaVar(seed: number, k: number, sS: number): number {
  return K.SIGMA_SPACE * sS * gauss(seed, k, CH.SPACE);
}

export interface PressureTerms {
  mP: number;
  bucket: 0 | 1 | 2;
  multiplier: number;
}

export function pressureTerms(seed: number, k: number, sP: number): PressureTerms {
  const zp = gauss(seed, k, CH.PRESSURE);
  const mP = Math.exp(K.PRESSURE_JITTER * sP * zp);
  const bucket: 0 | 1 | 2 = mP < 0.95 ? 0 : mP > 1.05 ? 2 : 1;
  const multiplier = bucket === 0 ? 0.9 : bucket === 2 ? 1.1 : 1.0;
  return { mP, bucket, multiplier };
}

export const PRESSURE_BUCKET_MULTIPLIER: readonly [number, number, number] = [0.9, 1.0, 1.1];