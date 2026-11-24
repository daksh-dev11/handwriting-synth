import { describe, expect, it } from 'vitest';
import { gauss, hash32, perlin1, u01 } from '../../src/engine/rng';
import {
  deltaVar,
  deltaYGlyph,
  deltaYLine,
  deltaYWord,
  fatigue,
  lineTiltDeg,
  pressureTerms,
  slantTerms,
  softClamp,
  waveTerm,
} from '../../src/engine/variance/perVariance';
import { opticalKernDelta } from '../../src/engine/variance/kerning';
import { ligatureCompatible, ligatureCubic, ligatureGeometry } from '../../src/engine/variance/ligature';
import { createVariantHistory, selectVariant } from '../../src/engine/variance/variants';
import { placementToLine } from '../../src/engine/variance/placement';
import type { Placement } from '../../src/engine/types';

const SEED = 12345;
const deg = (rad: number): number => (rad * 180) / Math.PI;
const rad = (d: number): number => (d * Math.PI) / 180;

describe('TV3A hash / rng / noise', () => {
  it('hash32 is exact', () => {
    expect(hash32(12345, 0, 1)).toBe(3410609713);
    expect(hash32(12345, 1, 1)).toBe(838824340);
    expect(hash32(0, 0, 0)).toBe(1380512277);
  });

  it('u01 matches', () => {
    expect(u01(12345, 0, 9)).toBeCloseTo(0.9901504, 6);
    expect(u01(12345, 1, 9)).toBeCloseTo(0.2321985, 6);
    expect(u01(12345, 2, 9)).toBeCloseTo(0.204712, 6);
  });

  it('gauss matches', () => {
    expect(gauss(12345, 0, 1)).toBeCloseTo(-0.7216972, 6);
    expect(gauss(12345, 1, 1)).toBeCloseTo(0.9982477, 6);
    expect(gauss(12345, 2, 1)).toBeCloseTo(2.3140881, 6);
  });

  it('perlin1 matches', () => {
    expect(perlin1(12345, 3, 0)).toBeCloseTo(0, 6);
    expect(perlin1(12345, 3, 0.25)).toBeCloseTo(-0.2451686, 6);
    expect(perlin1(12345, 3, 0.5)).toBeCloseTo(-0.3040658, 6);
    expect(perlin1(12345, 3, 1.5)).toBeCloseTo(0.2716124, 6);
    expect(perlin1(12345, 3, 2.75)).toBeCloseTo(0.105041, 6);
  });
});

describe('TV3B per-glyph variance', () => {
  const X = [0, 180, 355.5];

  it('fatigue envelope', () => {
    expect(fatigue(0)).toBeCloseTo(1.0, 6);
    expect(fatigue(1)).toBeCloseTo(1.001248, 6);
    expect(fatigue(2)).toBeCloseTo(1.002494, 6);
  });

  it('slant theta (deg)', () => {
    expect(slantTerms(SEED, 0, 0.5).thetaDeg).toBeCloseTo(-1.082546, 4);
    expect(slantTerms(SEED, 1, 0.5).thetaDeg).toBeCloseTo(1.447676, 4);
    expect(slantTerms(SEED, 2, 0.5).thetaDeg).toBeCloseTo(3.376332, 4);
  });

  it('glyph baseline offset', () => {
    expect(deltaYGlyph(SEED, 0, 0.5)).toBeCloseTo(-5.23802, 4);
    expect(deltaYGlyph(SEED, 1, 0.5)).toBeCloseTo(4.853332, 4);
    expect(deltaYGlyph(SEED, 2, 0.5)).toBeCloseTo(-5.352345, 4);
  });

  it('line terms and total offset', () => {
    expect(lineTiltDeg(SEED, 0)).toBeCloseTo(-0.074925, 4);
    expect(waveTerm(SEED, 0, 0, 0.5)).toBeCloseTo(0, 4);
    expect(waveTerm(SEED, 180, 0, 0.5)).toBeCloseTo(0.211735, 4);
    expect(waveTerm(SEED, 355.5, 0, 0.5)).toBeCloseTo(0.581524, 4);
    expect(deltaYLine(SEED, 0, 0, 0.5)).toBeCloseTo(0, 4);
    expect(deltaYLine(SEED, 180, 0, 0.5)).toBeCloseTo(-0.02365, 4);
    expect(deltaYLine(SEED, 355.5, 0, 0.5)).toBeCloseTo(0.116639, 4);
    expect(deltaYWord(SEED, 0, 0.5)).toBeCloseTo(-3.605098, 4);
  });

  it('soft-clamped total dY', () => {
    const raw = [0, 1, 2].map(
      (k) => deltaYGlyph(SEED, k, 0.5) + deltaYLine(SEED, X[k], 0, 0.5) + deltaYWord(SEED, 0, 0.5),
    );
    expect(raw[0]).toBeCloseTo(-8.843118, 4);
    expect(raw[1]).toBeCloseTo(1.224585, 4);
    expect(raw[2]).toBeCloseTo(-8.840804, 4);
    expect(softClamp(raw[0])).toBeCloseTo(-8.779638, 4);
    expect(softClamp(raw[1])).toBeCloseTo(1.224415, 4);
    expect(softClamp(raw[2])).toBeCloseTo(-8.777374, 4);
  });

  it('spacing and pressure variation', () => {
    expect(deltaVar(SEED, 0, 0.5)).toBeCloseTo(1.516304, 4);
    expect(deltaVar(SEED, 1, 0.5)).toBeCloseTo(1.750433, 4);
    expect(deltaVar(SEED, 2, 0.5)).toBeCloseTo(8.583518, 4);
    expect(pressureTerms(SEED, 0, 0.5).mP).toBeCloseTo(0.95425, 4);
    expect(pressureTerms(SEED, 1, 0.5).mP).toBeCloseTo(0.924409, 4);
    expect(pressureTerms(SEED, 2, 0.5).mP).toBeCloseTo(0.98214, 4);
    expect(pressureTerms(SEED, 0, 0.5).bucket).toBe(1);
    expect(pressureTerms(SEED, 1, 0.5).bucket).toBe(0);
    expect(pressureTerms(SEED, 2, 0.5).bucket).toBe(1);
  });
});

describe('TV3C placement transform', () => {
  it('rotates a local point into line space', () => {
    const placement: Placement = {
      k: 1,
      line: 0,
      glyphId: 'x#0',
      composite: 0,
      bucket: 1,
      originX: 180,
      dy: 1.224415,
      thetaRad: rad(1.447676),
      pivX: 60,
      ligatureFromPrev: null,
    };
    const out = placementToLine(placement, 60, 400);
    expect(out.x).toBeCloseTo(247.579208, 4);
    expect(out.y).toBeCloseTo(-298.679829, 4);
  });
});

describe('TV3D optical kerning', () => {
  it('computes the mean gap and damped delta', () => {
    const delta = opticalKernDelta(170, [100, 100, 100, null], [40, 40, 60, null], [1, 1, 1, 1]);
    expect(delta).toBeCloseTo(-29.75, 4);
  });
});

describe('TV3E ligature', () => {
  const E = { x: 300, y: 700 };
  const S = { x: 340, y: 640 };
  const phiA = rad(-20);
  const psiB = rad(-50);

  it('compatibility passes', () => {
    expect(ligatureCompatible(E, phiA, S, psiB)).toBe(true);
  });

  it('computes the blended tangents and control points', () => {
    const g = ligatureGeometry(E, phiA, S, psiB);
    expect(deg(g.chi)).toBeCloseTo(-56.309932, 4);
    expect(deg(g.phi)).toBeCloseTo(-34.523973, 4);
    expect(deg(g.psi)).toBeCloseTo(-52.523973, 4);
    expect(g.d).toBeCloseTo(72.111026, 4);
    expect(g.h).toBeCloseTo(27.40219, 4);

    const cubic = ligatureCubic(E, phiA, S, psiB, 0.5, 0.4);
    expect(cubic.p0.x).toBeCloseTo(300, 6);
    expect(cubic.p0.y).toBeCloseTo(700, 6);
    expect(cubic.p1.x).toBeCloseTo(322.576366, 4);
    expect(cubic.p1.y).toBeCloseTo(684.469781, 4);
    expect(cubic.p2.x).toBeCloseTo(323.327701, 4);
    expect(cubic.p2.y).toBeCloseTo(661.746596, 4);
    expect(cubic.p3.x).toBeCloseTo(340, 6);
    expect(cubic.p3.y).toBeCloseTo(640, 6);
    expect(cubic.pressureStart).toBe(0.5);
    expect(cubic.pressureEnd).toBe(0.4);
  });

  it('rejects a glyph that is off the baseline/x-height level', () => {
    expect(ligatureCompatible({ x: 300, y: 300 }, phiA, S, psiB)).toBe(false);
  });
});

describe('TV3F variant selection', () => {
  const nBase: Record<string, number> = { e: 3, a: 3 };

  function run(stream: string): number[] {
    const history = createVariantHistory();
    const picks: number[] = [];
    for (let k = 0; k < stream.length; k++) {
      picks.push(selectVariant(12345, k, stream[k], nBase[stream[k]] ?? 1, 1, history));
    }
    return picks;
  }

  it('matches the reference picks', () => {
    expect(run('eeeeeeeeaaaa')).toEqual([2, 0, 1, 2, 0, 2, 1, 2, 2, 1, 0, 1]);
  });

  it('never repeats the same composite for consecutive occurrences', () => {
    const stream = 'eeeeeeeeaaaa';
    const picks = run(stream);
    for (let k = 1; k < stream.length; k++) {
      if (stream[k] === stream[k - 1]) {
        expect(picks[k]).not.toBe(picks[k - 1]);
      }
    }
  });

  it('with nEff == 1 always picks 0 without touching history', () => {
    const history = createVariantHistory();
    expect(selectVariant(12345, 0, 'l', 1, 1, history)).toBe(0);
    expect(history.characters.size).toBe(0);
  });
});