import { describe, expect, it } from 'vitest';
import { catmullRomToBeziers } from '../../src/engine/ink/catmullRom';
import type { RibbonSample } from '../../src/engine/ink/ribbon';
import { ribbonOutlineFromSamples } from '../../src/engine/ink/ribbon';
import { inkWidth } from '../../src/engine/ink/width';
import { synthesizePressureAtVelocity } from '../../src/engine/normalize/n6Pressure';
import { TV2A, TV2B, TV2C } from '../fixtures/testVectors';

const expectPoint = (actual: { x: number; y: number }, expected: { x: number; y: number }): void => {
  expect(actual.x).toBeCloseTo(expected.x, 4);
  expect(actual.y).toBeCloseTo(expected.y, 4);
};

describe('TV2 curves and ink geometry', () => {
  it('TV2A Catmull-Rom to Bezier', () => {
    const segments = catmullRomToBeziers(TV2A.points);
    expect(segments).toHaveLength(3);
    segments.forEach((seg, i) => {
      const expected = TV2A.segments[i];
      expectPoint(seg.p0, expected.p0);
      expectPoint(seg.p1, expected.p1);
      expectPoint(seg.p2, expected.p2);
      expectPoint(seg.p3, expected.p3);
    });
  });

  it('TV2B ribbon left edge, right edge, and end cap', () => {
    const samples: RibbonSample[] = TV2B.centerline.map((c, i) => ({
      c,
      t: { x: 1, y: 0 },
      n: { x: 0, y: -1 },
      half: TV2B.half[i],
    }));
    const path = ribbonOutlineFromSamples(samples);

    expect(path[0]).toEqual({ op: 'M', x: 0, y: -10 });

    const c0 = path[1];
    expect(c0.op).toBe('C');
    if (c0.op === 'C') {
      expectPoint({ x: c0.x1, y: c0.y1 }, TV2B.leftCubics[0].p1);
      expectPoint({ x: c0.x2, y: c0.y2 }, TV2B.leftCubics[0].p2);
      expectPoint({ x: c0.x, y: c0.y }, TV2B.leftCubics[0].p3);
    }

    const c1 = path[2];
    expect(c1.op).toBe('C');
    if (c1.op === 'C') {
      expectPoint({ x: c1.x1, y: c1.y1 }, TV2B.leftCubics[1].p1);
      expectPoint({ x: c1.x2, y: c1.y2 }, TV2B.leftCubics[1].p2);
      expectPoint({ x: c1.x, y: c1.y }, TV2B.leftCubics[1].p3);
    }

    const arc1 = path[3];
    expect(arc1.op).toBe('C');
    if (arc1.op === 'C') {
      expectPoint({ x: arc1.x1, y: arc1.y1 }, TV2B.endCap.arc1.c1);
      expectPoint({ x: arc1.x2, y: arc1.y2 }, TV2B.endCap.arc1.c2);
      expectPoint({ x: arc1.x, y: arc1.y }, TV2B.endCap.arc1.end);
    }

    const arc2 = path[4];
    expect(arc2.op).toBe('C');
    if (arc2.op === 'C') {
      expectPoint({ x: arc2.x1, y: arc2.y1 }, TV2B.endCap.arc2.c1);
      expectPoint({ x: arc2.x2, y: arc2.y2 }, TV2B.endCap.arc2.c2);
      expectPoint({ x: arc2.x, y: arc2.y }, TV2B.endCap.arc2.end);
    }

    const right0 = path[5];
    expect(right0.op).toBe('C');
    if (right0.op === 'C') expectPoint({ x: right0.x, y: right0.y }, TV2B.right[1]);
    const right1 = path[6];
    expect(right1.op).toBe('C');
    if (right1.op === 'C') expectPoint({ x: right1.x, y: right1.y }, TV2B.right[0]);

    expect(path[path.length - 1]).toEqual({ op: 'Z' });
  });

  it('TV2C width and synthesized pressure', () => {
    expect(inkWidth(TV2C.W, TV2C.p, TV2C.I)).toBeCloseTo(TV2C.width, 4);
    expect(inkWidth(TV2C.W, TV2C.p, 0)).toBe(TV2C.widthNoPressure);
    expect(synthesizePressureAtVelocity(0)).toBeCloseTo(TV2C.synthesizedAtV0, 4);
    expect(synthesizePressureAtVelocity(2400)).toBeCloseTo(TV2C.synthesizedAtV2400, 4);
  });

  it('two-point Catmull-Rom is a straight cubic', () => {
    const seg = catmullRomToBeziers([{ x: 0, y: 0 }, { x: 30, y: 0 }])[0];
    expectPoint(seg.p1, { x: 10, y: 0 });
    expectPoint(seg.p2, { x: 20, y: 0 });
  });
});