import { describe, expect, it } from 'vitest';
import { DEFAULT_VARIANCE, LIMITS, sanitizeSettings, sanitizeVariance } from '@engine';

describe('settings sanitizers', () => {
  it('uses safe defaults for corrupted values and bounds UI settings', () => {
    const result = sanitizeSettings({
      variance: { seed: -1, poolSize: 1_000_000, slantJitter: Number.NaN },
      template: 'unknown',
      xHeightPt: Number.POSITIVE_INFINITY,
      inkRgb: [-2, 0.5, 3],
      maxPages: 99,
      nextSessionIndex: -1,
      guideXHeightPx: 200,
      guideBaselinePx: 1,
      penWidthPx: 50,
      draft: 'a'.repeat(LIMITS.MAX_TEXT_CHARS + 1),
    });

    expect(result.variance).toEqual({
      ...DEFAULT_VARIANCE,
      poolSize: LIMITS.MAX_POOL_SIZE,
    });
    expect(result.template).toBe('ruled');
    expect(result.xHeightPt).toBe(10);
    expect(result.inkRgb).toEqual([0, 0.5, 1]);
    expect(result.maxPages).toBe(LIMITS.MAX_PAGES);
    expect(result.nextSessionIndex).toBe(0);
    expect(result.guideXHeightPx).toBe(160);
    expect(result.guideBaselinePx).toBeGreaterThanOrEqual(2 * result.guideXHeightPx + 10);
    expect(result.penWidthPx).toBe(32);
    expect(result.draft).toHaveLength(LIMITS.MAX_TEXT_CHARS);
  });

  it('clamps variance fields and validates uint32 seeds', () => {
    expect(sanitizeVariance({
      seed: 4294967295,
      baselineDrift: 2,
      spacingVariance: -1,
      inkPressure: Number.NaN,
      mode: 'semi-cursive',
      poolSize: 2.4,
    })).toEqual({
      seed: 4294967295,
      slantJitter: DEFAULT_VARIANCE.slantJitter,
      baselineDrift: 1,
      spacingVariance: 0,
      inkPressure: DEFAULT_VARIANCE.inkPressure,
      mode: 'semi-cursive',
      poolSize: 2,
    });
  });
});
