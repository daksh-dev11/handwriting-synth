import { describe, expect, it } from 'vitest';
import { K } from '../../src/engine/constants';
import { InstanceCache } from '../../src/engine/layout/instanceCache';
import { layoutText, layoutTextSteps } from '../../src/engine/layout/layoutText';
import { BACKDROP, PAGE, TEMPLATE_SPECS, pageMetrics } from '../../src/engine/layout/templates';
import { buildGlyphPack } from '../../src/engine/normalize/pipeline';
import { DEFAULT_VARIANCE } from '../../src/engine/types';
import type { LayoutGeometry, VarianceConfig } from '../../src/engine/types';
import { makeSample, SAMPLE_NOW_ISO, SAMPLE_PACK } from '../fixtures/samplePack';

const CFG: VarianceConfig = { ...DEFAULT_VARIANCE };
const SEMI: VarianceConfig = { ...DEFAULT_VARIANCE, mode: 'semi-cursive' };

const ruledWidth = pageMetrics('ruled', 10).lineWidthEm;
const wide: LayoutGeometry = { lineWidthEm: ruledWidth, linesPerPage: TEMPLATE_SPECS.ruled.linesPerPage, maxPages: 10 };
const narrow: LayoutGeometry = { lineWidthEm: 600, linesPerPage: 24, maxPages: 10 };

const run = (text: string, cfg: VarianceConfig, geometry: LayoutGeometry) =>
  layoutText(text, SAMPLE_PACK, cfg, geometry, new InstanceCache(SAMPLE_PACK, cfg));

describe('template geometry', () => {
  it('computes the ruled line width in em (audit #5)', () => {
    expect(pageMetrics('ruled', 10).lineWidthEm).toBeCloseTo(14881.9, 1);
    expect(pageMetrics('ruled', 10).S).toBeCloseTo(1 / 30, 12);
    expect(pageMetrics('ruled', 10).linePitchEm).toBeCloseTo(28.346 * 30, 6);
  });

  it('falls back to 10 for a non-finite x-height', () => {
    expect(pageMetrics('ruled', Number.NaN).xHeightPt).toBe(10);
    expect(pageMetrics('grid', Number.POSITIVE_INFINITY).xHeightPt).toBe(10);
    expect(pageMetrics('dotted', 100).xHeightPt).toBe(10.5);
    expect(pageMetrics('cornell', 0).xHeightPt).toBe(6);
  });

  it('exposes the page and backdrop constants', () => {
    expect(PAGE.widthPt).toBeCloseTo(595.276, 3);
    expect(PAGE.heightPt).toBeCloseTo(841.89, 3);
    expect(BACKDROP.gridPitchPt).toBeCloseTo(14.173, 3);
    expect(BACKDROP.ruleWidthPt).toBeCloseTo(0.5, 6);
    expect(TEMPLATE_SPECS.cornell.linesPerPage).toBe(18);
  });
});

describe('text flow', () => {
  it('wrap-and-retry never alters variant history', () => {
    const text = 'eeee mmmm eeee llll cccc';
    const a = run(text, CFG, wide);
    const b = run(text, CFG, narrow);
    expect(b.placements.map((p) => [p.k, p.composite])).toEqual(a.placements.map((p) => [p.k, p.composite]));
    expect(b.missingChars).toEqual(a.missingChars);
    expect(b.placements.some((p) => p.line > 0)).toBe(true);
  });

  it('a single newline advances L and keeps k', () => {
    const res = run('e\ne', CFG, wide);
    expect(res.placements.map((p) => p.k)).toEqual([0, 2]);
    expect(res.placements.map((p) => p.line)).toEqual([0, 1]);
    expect(res.lineCount).toBe(2);
  });

  it('a paragraph break resets k and advances L exactly once', () => {
    const res = run('e\n\ne', CFG, wide);
    expect(res.placements.map((p) => p.k)).toEqual([0, 0]);
    expect(res.placements.map((p) => p.line)).toEqual([0, 1]);
    expect(res.lineCount).toBe(2);
  });

  it('a tab advances by four word spaces', () => {
    const cache = new InstanceCache(SAMPLE_PACK, CFG);
    const res = layoutText('e\te', SAMPLE_PACK, CFG, wide, cache);
    const first = res.placements[0];
    const adv0 = cache.instance(first.glyphId, first.composite).advance;
    expect(res.placements[1].originX - first.originX).toBeCloseTo(adv0 + 4 * K.WORD_SPACE, 6);
  });

  it('records missing glyphs by paragraph index', () => {
    const res = run('e|z', CFG, wide);
    expect(res.placements.map((p) => p.k)).toEqual([0]);
    expect(res.missingChars).toEqual([1, 2]);
  });

  it('paginates and truncates at maxPages', () => {
    const geometry: LayoutGeometry = { lineWidthEm: 3000, linesPerPage: 24, maxPages: 1 };
    const res = run('e'.repeat(500), CFG, geometry);
    expect(res.truncated).toBe(true);
    expect(res.pageCount).toBe(1);
    expect(res.lineCount).toBeLessThanOrEqual(24);
  });

  it('terminates an over-long word within maxPages * linesPerPage lines', () => {
    const wPack = buildGlyphPack([makeSample('W', 0, 0, [[[100, 110], [260, 340]]])], SAMPLE_NOW_ISO);
    const cfg: VarianceConfig = { ...DEFAULT_VARIANCE };
    const geometry: LayoutGeometry = { lineWidthEm: ruledWidth, linesPerPage: 24, maxPages: 10 };
    const res = layoutText('W'.repeat(30000), wPack, cfg, geometry, new InstanceCache(wPack, cfg));
    expect(res.lineCount).toBeLessThanOrEqual(240);
    expect(res.truncated).toBe(true);
  });
});

describe('ligature placement', () => {
  it('never carries a ligature onto a line start', () => {
    const geometry: LayoutGeometry = { lineWidthEm: 2000, linesPerPage: 24, maxPages: 10 };
    const res = run('eeeeeeeeeeeeeeeeeeeeeeee', SEMI, geometry);
    for (const p of res.placements) {
      if (p.originX === 0) expect(p.ligatureFromPrev).toBeNull();
    }
  });

  it('never ligates across a missing-glyph gap', () => {
    const res = run('ee|ee', SEMI, wide);
    const gap = res.missingChars[0];
    const after = res.placements.find((p) => p.k === gap + 1);
    expect(after).toBeDefined();
    expect(after?.ligatureFromPrev).toBeNull();
  });
});

describe('layoutTextSteps', () => {
  it('drains to the same result as layoutText and reports consumedChars', () => {
    const text = 'eeee mmmm\n\neeee';
    const steps: { consumedChars: number }[] = [];
    const iterator = layoutTextSteps(text, SAMPLE_PACK, CFG, wide, new InstanceCache(SAMPLE_PACK, CFG));
    let step = iterator.next();
    while (!step.done) {
      steps.push(step.value);
      step = iterator.next();
    }
    expect(steps.length).toBeGreaterThan(0);
    let prev = -1;
    for (const s of steps) {
      expect(s.consumedChars).toBeGreaterThanOrEqual(prev);
      prev = s.consumedChars;
    }
    expect(step.value).toEqual(run(text, CFG, wide));
  });
});