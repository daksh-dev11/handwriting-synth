import { CH, EM, K } from '../constants';
import { clamp, wrap } from '../mathUtil';
import { gauss } from '../rng';
import type { LigatureCubic, Pt } from '../types';

export type LigatureLevel = 'low' | 'high' | 'none';

export function level(y: number): LigatureLevel {
  if (Math.abs(y - EM.baselineY) <= K.LEVEL_TOL) return 'low';
  if (Math.abs(y - EM.xHeightY) <= K.LEVEL_TOL) return 'high';
  return 'none';
}

export function ligatureCompatible(E: Pt, phiA: number, S: Pt, psiB: number): boolean {
  if (level(E.y) === 'none' || level(S.y) === 'none') return false;
  const d = Math.hypot(S.x - E.x, S.y - E.y);
  if (d > K.LIG_D_MAX) return false;
  const chi = Math.atan2(S.y - E.y, S.x - E.x);
  const tol = (K.LIG_ANG_TOL_DEG * Math.PI) / 180;
  if (Math.abs(wrap(phiA - chi)) > tol) return false;
  if (Math.abs(wrap(psiB - chi)) > tol) return false;
  return true;
}

export interface LigatureGeometry {
  chi: number;
  phi: number;
  psi: number;
  d: number;
  h: number;
}

export function ligatureGeometry(E: Pt, phiA: number, S: Pt, psiB: number): LigatureGeometry {
  const chi = Math.atan2(S.y - E.y, S.x - E.x);
  const oneMinusBeta = 1 - K.LIG_BETA;
  const phi = chi + oneMinusBeta * wrap(phiA - chi);
  const psi = chi + oneMinusBeta * wrap(psiB - chi);
  const d = Math.hypot(S.x - E.x, S.y - E.y);
  const h = K.LIG_KAPPA * d;
  return { chi, phi, psi, d, h };
}

export function ligatureCubic(
  E: Pt,
  phiA: number,
  S: Pt,
  psiB: number,
  pressureStart: number,
  pressureEnd: number,
): LigatureCubic {
  const g = ligatureGeometry(E, phiA, S, psiB);
  return {
    p0: { x: E.x, y: E.y },
    p1: { x: E.x + g.h * Math.cos(g.phi), y: E.y + g.h * Math.sin(g.phi) },
    p2: { x: S.x - g.h * Math.cos(g.psi), y: S.y - g.h * Math.sin(g.psi) },
    p3: { x: S.x, y: S.y },
    pressureStart,
    pressureEnd,
  };
}

export function ligatureGap(seed: number, k: number, sS: number): number {
  return K.LIG_GAP * (1 + 0.25 * sS * clamp(gauss(seed, k, CH.LIG), -2, 2));
}