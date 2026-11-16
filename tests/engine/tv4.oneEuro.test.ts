import { describe, expect, it } from 'vitest';
import { K } from '../../src/engine/constants';
import { smoothOneEuro } from '../../src/engine/normalize/n7OneEuro';
import type { Pt } from '../../src/engine/types';
import { TV4_CIRCLE } from '../fixtures/testVectors';

describe('TV4 One Euro smoothing', () => {
  it('pins both ends and removes the end hook on a radius-150 circle', () => {
    const radius = TV4_CIRCLE.radius;
    const step = K.RESAMPLE_DS;
    const circumference = 2 * Math.PI * radius;

    const targets: number[] = [];
    const nFull = Math.floor(circumference / step);
    for (let m = 0; m <= nFull; m++) targets.push(m * step);
    const last = targets[targets.length - 1];
    if (circumference - last >= 0.4 * step) targets.push(circumference);
    else targets[targets.length - 1] = circumference;

    const n = targets.length;
    expect(n).toBeGreaterThan(90);

    const points: Pt[] = targets.map((s) => ({
      x: radius * Math.cos(s / radius),
      y: radius * Math.sin(s / radius),
    }));
    const dt = TV4_CIRCLE.durationSeconds / (n - 1);
    const times = targets.map((_, i) => i * dt);

    const filtered = smoothOneEuro(points, times);
    expect(filtered).toHaveLength(n);

    expect(filtered[0].x).toBeCloseTo(points[0].x, 9);
    expect(filtered[0].y).toBeCloseTo(points[0].y, 9);
    expect(filtered[n - 1].x).toBeCloseTo(points[n - 1].x, 9);
    expect(filtered[n - 1].y).toBeCloseTo(points[n - 1].y, 9);

    const endStep = Math.hypot(filtered[n - 1].x - filtered[n - 2].x, filtered[n - 1].y - filtered[n - 2].y);
    expect(endStep).toBeLessThanOrEqual(3 * K.RESAMPLE_DS);

    for (const p of filtered) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});