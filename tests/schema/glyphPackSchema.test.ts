import { describe, expect, it } from 'vitest';
import { validateGlyphPack, sanitizeGlyphPack } from '../../src/engine/schema/glyphPackSchema';
import { SAMPLE_PACK } from '../fixtures/samplePack';
import type { GlyphPack } from '../../src/engine/types';
import type { ValidationIssue } from '../../src/engine/schema/validate';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const codes = (issues: ValidationIssue[]): string[] => issues.map((i) => i.code);

describe('validateGlyphPack', () => {
  it('accepts a pack produced by buildGlyphPack', () => {
    const result = validateGlyphPack(SAMPLE_PACK);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.glyphs).toEqual(SAMPLE_PACK.glyphs);
  });

  it('rejects a non-object', () => {
    const result = validateGlyphPack(42);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('BAD_TYPE');
  });

  it('rejects an unknown key', () => {
    const bad = clone(SAMPLE_PACK) as GlyphPack & { extra?: unknown };
    bad.extra = 1;
    const result = validateGlyphPack(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('UNKNOWN_KEY');
  });

  it('rejects a wrong version and unitsPerEm', () => {
    const a = clone(SAMPLE_PACK) as unknown as { version: number };
    a.version = 2;
    expect(validateGlyphPack(a).ok).toBe(false);
    const b = clone(SAMPLE_PACK) as unknown as { unitsPerEm: number };
    b.unitsPerEm = 2048;
    expect(validateGlyphPack(b).ok).toBe(false);
  });

  it('rejects a broken advance', () => {
    const bad = clone(SAMPLE_PACK);
    bad.glyphs.l[0].advance += 10;
    const result = validateGlyphPack(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('INVARIANT_FAILED');
  });

  it('rejects a glyph whose id does not match its index', () => {
    const bad = clone(SAMPLE_PACK);
    bad.glyphs.e[1].id = 'e#7';
    const result = validateGlyphPack(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('INVARIANT_FAILED');
  });

  it('rejects equal pressure knots (audit #17)', () => {
    const bad = clone(SAMPLE_PACK);
    bad.glyphs.l[0].strokes[0].pressure[1].u = bad.glyphs.l[0].strokes[0].pressure[0].u;
    const result = validateGlyphPack(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('INVARIANT_FAILED');
  });

  it('rejects an off-range profile', () => {
    const bad = clone(SAMPLE_PACK);
    bad.glyphs.l[0].leftProfile[0] = 1e9;
    const result = validateGlyphPack(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('OUT_OF_RANGE');
  });

  it('sanitizeGlyphPack returns the pack or null', () => {
    expect(sanitizeGlyphPack(SAMPLE_PACK)?.version).toBe(1);
    expect(sanitizeGlyphPack({})).toBeNull();
  });
});