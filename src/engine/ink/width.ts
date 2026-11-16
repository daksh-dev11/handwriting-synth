import { K } from '../constants';
import { clamp } from '../mathUtil';

export function inkWidth(W: number, p: number, inkI: number): number {
  const pressure = clamp(p, 0, 1);
  const q = Math.pow(pressure, K.W_GAMMA);
  const shape = K.W_BASE + K.W_GAIN * q;
  return W * ((1 - inkI) + inkI * shape);
}