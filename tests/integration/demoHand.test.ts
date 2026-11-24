import { describe, expect, it } from 'vitest';
import {
  buildGlyphPack,
  LIMITS,
  REQUIRED_KEYS,
  validateRawSample,
} from '@engine';
import { buildDemoSamples } from '../../src/demo/demoHand';
import { DEMO_CAPTURED_AT } from '../../src/demo/constants';

describe('built-in demo hand', () => {
  it('creates exactly the required deterministic, valid samples within the raw point cap', () => {
    const first = buildDemoSamples();
    const second = buildDemoSamples();
    expect(first).toHaveLength(REQUIRED_KEYS.length);
    expect(first).toEqual(second);
    expect(first.map(({ char, variantIndex }) => `${char}#${variantIndex}`)).toEqual(
      REQUIRED_KEYS.map(({ key }) => key),
    );

    let totalPoints = 0;
    for (const sample of first) {
      expect(validateRawSample(sample).ok).toBe(true);
      expect(sample.capturedAt).toBe(DEMO_CAPTURED_AT);
      let previousTime = -1;
      for (const stroke of sample.strokes) {
        for (const point of stroke) {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
          expect(point.t).toBeGreaterThan(previousTime);
          previousTime = point.t;
          totalPoints += 1;
        }
      }
    }
    expect(totalPoints).toBeLessThan(LIMITS.MAX_RAW_POINTS_TOTAL);
  });

  it('builds a pack containing every required key and measures the demo l slant', () => {
    const samples = buildDemoSamples();
    const pack = buildGlyphPack(samples, DEMO_CAPTURED_AT);
    expect(Object.keys(pack.glyphs).sort()).toEqual(
      [...new Set(REQUIRED_KEYS.map(({ char }) => char))].sort(),
    );
    expect(pack.glyphs.l?.[0]?.measuredSlantDeg).toBeCloseTo(10, 0);
  });
});
