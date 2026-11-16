import { describe, expect, it } from 'vitest';
import { EM, K } from '../../src/engine/constants';
import { n1MapStrokes } from '../../src/engine/normalize/n1Guide';
import type { EmPoint } from '../../src/engine/normalize/n1Guide';
import { applyDrift, driftScale, fitDrift } from '../../src/engine/normalize/n2Drift';
import { n3SnapStrokes } from '../../src/engine/normalize/n3Snap';
import { n4Translate } from '../../src/engine/normalize/n4Translate';
import { measureSampleSlant } from '../../src/engine/normalize/n9Style';
import { makeSample } from '../fixtures/samplePack';
import { TV1A, TV1B, TV1C, TV1_GUIDES, TV1_PEN_WIDTH_PX, TV1_S, TV1_W } from '../fixtures/testVectors';

const expectPoint = (actual: { x: number; y: number }, expected: { x: number; y: number }): void => {
  expect(actual.x).toBeCloseTo(expected.x, 4);
  expect(actual.y).toBeCloseTo(expected.y, 4);
};

const heightOf = (strokes: readonly EmPoint[][]): number => {
  let min = Infinity;
  let max = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.y < min) min = p.y;
      if (p.y > max) max = p.y;
    }
  }
  return max - min;
};

const emStroke = (h: number): EmPoint[][] => [
  [
    { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0, t: 0, pointerType: 'mouse', dpr: 1 },
    { x: 0, y: h, pressure: 0.5, tiltX: 0, tiltY: 0, t: 8, pointerType: 'mouse', dpr: 1 },
  ],
];

describe('TV1 normalization', () => {
  it('TV1A letter l: N1, N4, bbox, advance, slant', () => {
    const sample = makeSample('l', 0, 0, [TV1A.raw.map((p) => [p.x, p.y] as const)]);

    const n1 = n1MapStrokes(sample.strokes, TV1_S, TV1_GUIDES.baselineY);
    expect(n1).toHaveLength(1);
    n1[0].forEach((p, i) => expectPoint(p, TV1A.n1[i]));

    const n4 = n4Translate(n1, TV1_W);
    n4.strokes[0].forEach((p, i) => expectPoint(p, TV1A.n4[i]));

    expect(n4.bbox.minX).toBeCloseTo(TV1A.bbox.minX, 6);
    expect(n4.bbox.minY).toBeCloseTo(TV1A.bbox.minY, 6);
    expect(n4.bbox.maxX).toBeCloseTo(TV1A.bbox.maxX, 6);
    expect(n4.bbox.maxY).toBeCloseTo(TV1A.bbox.maxY, 6);
    expect(n4.advance).toBeCloseTo(TV1A.advance, 6);

    expect(measureSampleSlant(n4.strokes)).toBeCloseTo(TV1A.slantDeg, 4);

    expect(TV1_PEN_WIDTH_PX * TV1_S).toBeCloseTo(TV1_W, 12);
  });

  it('TV1B comma: N1, N3 snapping, N4, bbox, advance', () => {
    const sample = makeSample(',', 0, 0, [TV1B.raw.map((p) => [p.x, p.y] as const)]);

    const n1 = n1MapStrokes(sample.strokes, TV1_S, TV1_GUIDES.baselineY);
    n1[0].forEach((p, i) => expectPoint(p, TV1B.n1[i]));

    const n3 = n3SnapStrokes(',', n1, TV1_W);
    n3[0].forEach((p, i) => expectPoint(p, TV1B.n3[i]));

    const n4 = n4Translate(n3, TV1_W);
    n4.strokes[0].forEach((p, i) => expectPoint(p, TV1B.n4[i]));

    expect(n4.bbox.minX).toBeCloseTo(TV1B.bbox.minX, 6);
    expect(n4.bbox.minY).toBeCloseTo(TV1B.bbox.minY, 6);
    expect(n4.bbox.maxX).toBeCloseTo(TV1B.bbox.maxX, 6);
    expect(n4.bbox.maxY).toBeCloseTo(TV1B.bbox.maxY, 6);
    expect(n4.advance).toBeCloseTo(TV1B.advance, 6);
  });

  it('TV1C session drift: median, slope, per-index scale, corrected heights', () => {
    const inputs = TV1C.heights.map((h, i) => ({ char: 'o', sessionIndex: i, strokes: emStroke(h) }));
    const fit = fitDrift(inputs);

    expect(fit.medianHeight).toBeCloseTo(TV1C.medianHeight, 4);
    expect(fit.meanIndex).toBeCloseTo(TV1C.meanIndex, 12);
    expect(fit.b).toBeCloseTo(TV1C.b, 4);

    TV1C.k.forEach((expected, i) => {
      expect(driftScale(fit.b, fit.meanIndex, i)).toBeCloseTo(expected, 4);
      const corrected = applyDrift(emStroke(TV1C.heights[i]), i, fit);
      expect(heightOf(corrected)).toBeCloseTo(TV1C.correctedHeight, 4);
    });
  });

  it('audit #8: zero-height X-class samples are excluded from the fit only', () => {
    const valid = TV1C.heights.map((h, i) => ({ char: 'o', sessionIndex: i, strokes: emStroke(h) }));
    const tap = { char: 'o', sessionIndex: 6, strokes: emStroke(0) };

    const fit = fitDrift([...valid, tap]);
    expect(fit.count).toBe(6);
    expect(Number.isFinite(fit.b)).toBe(true);
    expect(fit.b).toBeCloseTo(TV1C.b, 4);

    const correctedTap = applyDrift(emStroke(0), 6, fit);
    expect(Number.isFinite(heightOf(correctedTap))).toBe(true);

    const sparse = fitDrift([...valid.slice(0, 5), tap]);
    expect(sparse.count).toBe(0);
    expect(sparse.b).toBe(0);
    expect(sparse.meanIndex).toBe(0);
    expect(driftScale(sparse.b, sparse.meanIndex, 9)).toBe(1);
    expect(driftScale(Number.NaN, 0, 3)).toBe(1);
  });

  it('uses the audit-patched slant sign: top is the smaller-y chord endpoint', () => {
    const topDown = emStroke(EM.xHeight).map((stroke) => stroke.map((p) => ({ ...p })));
    topDown[0][0] = { ...topDown[0][0], x: 100 + Math.tan((10 * Math.PI) / 180) * (EM.baselineY - EM.ascenderY), y: EM.ascenderY };
    topDown[0][1] = { ...topDown[0][1], x: 100, y: EM.baselineY };
    expect(measureSampleSlant(topDown)).toBeCloseTo(10, 3);

    const reversed = topDown.map((stroke) => stroke.slice().reverse());
    expect(measureSampleSlant(reversed)).toBeCloseTo(10, 3);
  });

  it('keeps K drift constants patched', () => {
    expect(K.DRIFT_MIN_H).toBe(75);
    expect(K.ONE_EURO_MIN_CUTOFF).toBe(8);
    expect(Object.prototype.hasOwnProperty.call(K, 'LIG_DY_MAX')).toBe(false);
  });
});