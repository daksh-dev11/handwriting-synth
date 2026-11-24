import { describe, expect, it } from 'vitest';
import { InstanceCache } from '../../src/engine/layout/instanceCache';
import { layoutText } from '../../src/engine/layout/layoutText';
import { pageMetrics, TEMPLATE_SPECS } from '../../src/engine/layout/templates';
import { normalizeChar } from '../../src/engine/charset';
import { DEFAULT_VARIANCE } from '../../src/engine/types';
import type { LayoutGeometry, VarianceConfig } from '../../src/engine/types';
import { SAMPLE_PACK } from '../fixtures/samplePack';

const CFG: VarianceConfig = { ...DEFAULT_VARIANCE };

const geom = (maxPages = 10): LayoutGeometry => ({
  lineWidthEm: pageMetrics('ruled', 10).lineWidthEm,
  linesPerPage: TEMPLATE_SPECS.ruled.linesPerPage,
  maxPages,
});

const run = (text: string, cfg: VarianceConfig = CFG, geometry: LayoutGeometry = geom()) =>
  layoutText(text, SAMPLE_PACK, cfg, geometry, new InstanceCache(SAMPLE_PACK, cfg));

describe('layout determinism', () => {
  it('produces a deep-equal result on a second run', () => {
    const text = 'e m a c e n o w';
    expect(run(text)).toEqual(run(text));
  });

  it('gives the same placement for a glyph at k regardless of following text', () => {
    const single = run('e').placements;
    const full = run('eeeeeeeeeeee').placements;
    expect(full[0]).toEqual(single[0]);
  });

  it('never changes placements before k when text after k is edited', () => {
    const a = run('eeee');
    const b = run('eeeecccc');
    const beforeA = a.placements.filter((p) => p.k < 4);
    const beforeB = b.placements.filter((p) => p.k < 4);
    expect(beforeB).toEqual(beforeA);
  });
});

describe('InstanceCache', () => {
  it('keeps instance identity when inkPressure changes but seed does not', () => {
    const cache = new InstanceCache(SAMPLE_PACK, CFG);
    const first = cache.instance('e#0', 1);
    cache.reconfigure({ ...CFG, inkPressure: 0.72 });
    expect(cache.instance('e#0', 1)).toBe(first);
  });

  it('drops instance identity when the seed changes', () => {
    const cache = new InstanceCache(SAMPLE_PACK, CFG);
    const first = cache.instance('e#0', 1);
    cache.reconfigure({ ...CFG, seed: 54321 });
    expect(cache.instance('e#0', 1)).not.toBe(first);
  });

  it('drops instance identity when the pool size changes', () => {
    const cache = new InstanceCache(SAMPLE_PACK, CFG);
    const first = cache.instance('e#0', 1);
    cache.reconfigure({ ...CFG, poolSize: 2 });
    expect(cache.instance('e#0', 1)).not.toBe(first);
  });

  it('returns an unperturbed base for instance index 0 and a copy for m >= 1', () => {
    const cache = new InstanceCache(SAMPLE_PACK, CFG);
    const base = cache.instance('e#0', 0);
    expect(base).toBe(SAMPLE_PACK.glyphs.e[0]);
    const perturbed = cache.instance('e#0', 1);
    expect(perturbed).not.toBe(base);
    expect(perturbed.bbox).toEqual(base.bbox);
    expect(perturbed.advance).toBe(base.advance);
    expect(perturbed.id).toBe(base.id);
  });

  it('throws CACHE_CFG_MISMATCH when layout is called with a different config', () => {
    const cache = new InstanceCache(SAMPLE_PACK, CFG);
    const other: VarianceConfig = { ...CFG, seed: 999 };
    expect(() => layoutText('e', SAMPLE_PACK, other, geom(), cache)).toThrow(RangeError);
    expect(() => layoutText('e', SAMPLE_PACK, other, geom(), cache)).toThrow('CACHE_CFG_MISMATCH');
  });
});

describe('normalizeChar dash fallback', () => {
  it('keeps a drawn en/em dash and only falls back when missing', () => {
    expect(normalizeChar('\u2013', (c) => c === '\u2013')).toBe('\u2013');
    expect(normalizeChar('\u2014', (c) => c === '\u2014')).toBe('\u2014');
    expect(normalizeChar('\u2013', (c) => c === '-')).toBe('-');
    expect(normalizeChar('\u2014', () => false)).toBe('-');
  });

  it('always normalizes smart quotes', () => {
    expect(normalizeChar('\u201C', () => true)).toBe('"');
    expect(normalizeChar('\u201D', () => false)).toBe('"');
    expect(normalizeChar('\u2018', () => true)).toBe("'");
    expect(normalizeChar('\u2019', () => false)).toBe("'");
  });
});