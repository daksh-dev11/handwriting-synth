import { describe, expect, it } from 'vitest';
import { buildGlyphPack, buildGlyphPackSteps } from '../../src/engine/normalize/pipeline';
import type { NormalizedGlyph } from '../../src/engine/types';
import { SAMPLE_NOW_ISO, SAMPLE_PACK, SAMPLE_RAW_SAMPLES } from '../fixtures/samplePack';
import { TV1A } from '../fixtures/testVectors';

const allGlyphs = (): NormalizedGlyph[] => Object.values(SAMPLE_PACK.glyphs).flat();

describe('buildGlyphPack invariants', () => {
  it('yields monotonic progress and drains to the same pack', () => {
    const steps: { done: number; total: number }[] = [];
    const iterator = buildGlyphPackSteps(SAMPLE_RAW_SAMPLES, SAMPLE_NOW_ISO);
    let result = iterator.next();
    while (!result.done) {
      steps.push(result.value);
      result = iterator.next();
    }
    expect(steps).toHaveLength(SAMPLE_RAW_SAMPLES.length);
    steps.forEach((step, i) => {
      expect(step.total).toBe(SAMPLE_RAW_SAMPLES.length);
      expect(step.done).toBe(i + 1);
    });
    expect(result.value.createdAt).toBe(SAMPLE_NOW_ISO);
    expect(result.value.glyphs).toEqual(SAMPLE_PACK.glyphs);
    expect(buildGlyphPack(SAMPLE_RAW_SAMPLES, SAMPLE_NOW_ISO).glyphs).toEqual(SAMPLE_PACK.glyphs);
  });

  it('is G1-continuous at interior knots', () => {
    for (const glyph of allGlyphs()) {
      for (const stroke of glyph.strokes) {
        if (stroke.isDot) continue;
        for (let i = 0; i + 1 < stroke.segments.length; i++) {
          const a = stroke.segments[i];
          const b = stroke.segments[i + 1];
          expect(Math.hypot(a.p3.x - b.p0.x, a.p3.y - b.p0.y)).toBeLessThanOrEqual(1e-9);
          const v1 = { x: a.p3.x - a.p2.x, y: a.p3.y - a.p2.y };
          const v2 = { x: b.p1.x - b.p0.x, y: b.p1.y - b.p0.y };
          const m1 = Math.hypot(v1.x, v1.y);
          const m2 = Math.hypot(v2.x, v2.y);
          if (m1 > 1e-9 && m2 > 1e-9) {
            const cross = Math.abs(v1.x * v2.y - v1.y * v2.x) / (m1 * m2);
            expect(cross).toBeLessThan(1e-6);
            expect(v1.x * v2.x + v1.y * v2.y).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('has 32-row profiles and the documented advance formula', () => {
    for (const glyph of allGlyphs()) {
      expect(glyph.leftProfile).toHaveLength(32);
      expect(glyph.rightProfile).toHaveLength(32);
      for (const value of [...glyph.leftProfile, ...glyph.rightProfile]) {
        if (value !== null) expect(Number.isFinite(value)).toBe(true);
      }
    }
    expect(glyph0('l').bbox.minX).toBeCloseTo(40, 9);
    expect(glyph0('l').lsb).toBe(40);
    expect(glyph0('l').rsb).toBe(40);
    expect(glyph0('l').advance).toBeCloseTo(
      glyph0('l').lsb + (glyph0('l').bbox.maxX - glyph0('l').bbox.minX) + glyph0('l').rsb,
      3,
    );
    expect(glyph0('l').measuredSlantDeg).toBeCloseTo(TV1A.slantDeg, 4);
  });

  it('turns a single tap into a degenerate dot and stays NaN-free', () => {
    const dot = glyph0('o');
    expect(dot.strokes).toHaveLength(1);
    expect(dot.strokes[0].isDot).toBe(true);
    expect(dot.strokes[0].segments).toHaveLength(1);
    const seg = dot.strokes[0].segments[0];
    expect(seg.p0).toEqual(seg.p1);
    expect(seg.p1).toEqual(seg.p2);
    expect(seg.p2).toEqual(seg.p3);
    expect(dot.strokes[0].pressure).toEqual([
      { u: 0, p: dot.strokes[0].pressure[0].p },
      { u: 1, p: dot.strokes[0].pressure[0].p },
    ]);
  });

  it('is NaN-free with a single-tap X-class sample (audit #8)', () => {
    for (const glyph of allGlyphs()) {
      for (const stroke of glyph.strokes) {
        for (const seg of stroke.segments) {
          for (const p of [seg.p0, seg.p1, seg.p2, seg.p3]) {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
          }
        }
        expect(stroke.pressure.length).toBeGreaterThanOrEqual(2);
        expect(stroke.pressure[0].u).toBe(0);
        expect(stroke.pressure[stroke.pressure.length - 1].u).toBe(1);
        for (let i = 1; i < stroke.pressure.length; i++) {
          expect(stroke.pressure[i].u - stroke.pressure[i - 1].u).toBeGreaterThanOrEqual(1e-9);
        }
        for (const knot of stroke.pressure) {
          expect(knot.p).toBeGreaterThanOrEqual(0);
          expect(knot.p).toBeLessThanOrEqual(1);
        }
      }
      for (const p of [glyph.entry, glyph.exit]) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(Number.isFinite(p.tangentRad)).toBe(true);
      }
    }
    expect(Number.isFinite(SAMPLE_PACK.style.strokeWeight)).toBe(true);
    expect(Number.isFinite(SAMPLE_PACK.style.slantDeg)).toBe(true);
    expect(Number.isFinite(SAMPLE_PACK.style.aspectRatio)).toBe(true);
    expect(Number.isFinite(SAMPLE_PACK.style.driftSlopePerIndex)).toBe(true);
  });

  it('dense-reindexes variants in ascending captured variant order', () => {
    const variants = SAMPLE_PACK.glyphs.e;
    expect(variants).toHaveLength(2);
    expect(variants.map((g) => g.id)).toEqual(['e#0', 'e#1']);
    expect(variants.map((g) => g.variantIndex)).toEqual([0, 1]);
    expect(variants.every((g) => g.char === 'e')).toBe(true);
    for (const [char, glyphs] of Object.entries(SAMPLE_PACK.glyphs)) {
      glyphs.forEach((glyph, index) => {
        expect(glyph.id).toBe(`${char}#${index}`);
        expect(glyph.variantIndex).toBe(index);
      });
    }
  });
});

function glyph0(char: string): NormalizedGlyph {
  const list = SAMPLE_PACK.glyphs[char];
  expect(list).toBeDefined();
  return list[0];
}