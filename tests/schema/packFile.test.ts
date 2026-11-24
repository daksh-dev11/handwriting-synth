import { describe, expect, it } from 'vitest';
import { parsePackFile, serializePackFile } from '../../src/engine/schema/packFile';
import { SAMPLE_PACK, SAMPLE_RAW_SAMPLES } from '../fixtures/samplePack';import type { PackFileContents } from '../../src/engine/schema/packFile';
import type { ValidationIssue } from '../../src/engine/schema/validate';

const EXPORTED_AT = '2026-02-02T03:04:05.000Z';
const codes = (issues: ValidationIssue[]): string[] => issues.map((i) => i.code);

function serialize(contents: PackFileContents): string {
  const result = serializePackFile(contents, EXPORTED_AT);
  if (!result.ok) throw new Error(`serialize failed: ${JSON.stringify(result.issues)}`);
  return result.value;
}

describe('pack file round trip', () => {
  it('losslessly round-trips pack and raw samples', () => {
    const json = serialize({ pack: SAMPLE_PACK, rawSamples: SAMPLE_RAW_SAMPLES });
    const parsed = parsePackFile(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.pack).toEqual(SAMPLE_PACK);
      expect(parsed.value.rawSamples).toEqual(SAMPLE_RAW_SAMPLES);
    }
  });

  it('round-trips a pack-only file with null raw samples', () => {
    const json = serialize({ pack: SAMPLE_PACK, rawSamples: null });
    const parsed = parsePackFile(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.rawSamples).toBeNull();
      expect(parsed.value.pack).toEqual(SAMPLE_PACK);
    }
  });

  it('is stable across a second export/import cycle', () => {
    const first = serialize({ pack: SAMPLE_PACK, rawSamples: SAMPLE_RAW_SAMPLES });
    const parsed = parsePackFile(first);
    if (!parsed.ok) throw new Error('parse failed');
    const second = serialize(parsed.value);
    expect(second).toBe(first);
  });
});

describe('pack file validation', () => {
  const json = (): string => serialize({ pack: SAMPLE_PACK, rawSamples: null });

  it('rejects a non-ISO exportedAt on export', () => {
    const result = serializePackFile({ pack: SAMPLE_PACK, rawSamples: null }, 'not-a-date');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('BAD_DATE');
  });

  it('rejects an invalid pack on export', () => {
    const bad = JSON.parse(JSON.stringify(SAMPLE_PACK)) as typeof SAMPLE_PACK;
    bad.glyphs.l[0].advance += 5;
    const result = serializePackFile({ pack: bad, rawSamples: null }, EXPORTED_AT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('INVARIANT_FAILED');
  });

  it('reports CHECKSUM_MISMATCH', () => {
    const obj = JSON.parse(json()) as Record<string, unknown>;
    obj.checksum = '00000000';
    const result = parsePackFile(JSON.stringify(obj));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('CHECKSUM_MISMATCH');
  });

  it('reports ENGINE_SPEC_MISMATCH', () => {
    const obj = JSON.parse(json()) as Record<string, unknown>;
    obj.engineSpec = 'MathEngine/999';
    const result = parsePackFile(JSON.stringify(obj));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('ENGINE_SPEC_MISMATCH');
  });

  it('reports UNKNOWN_KEY for an unexpected envelope key', () => {
    const obj = JSON.parse(json()) as Record<string, unknown>;
    obj.surprise = 1;
    const result = parsePackFile(JSON.stringify(obj));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('UNKNOWN_KEY');
  });

  it('reports MISSING_KEY when pack is absent', () => {
    const obj = JSON.parse(json()) as Record<string, unknown>;
    delete obj.pack;
    const result = parsePackFile(JSON.stringify(obj));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('MISSING_KEY');
  });

  it('reports JSON_SYNTAX and NOT_OBJECT', () => {
    const a = parsePackFile('{ not json');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(codes(a.issues)).toContain('JSON_SYNTAX');
    const b = parsePackFile('[]');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(codes(b.issues)).toContain('NOT_OBJECT');
  });

  it('reports CAP_EXCEEDED for a nesting bomb before parsing (audit #19)', () => {
    const bomb = `${'['.repeat(20)}${']'.repeat(20)}`;
    const result = parsePackFile(bomb);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].code).toBe('CAP_EXCEEDED');
      expect(result.issues[0].path).toBe('/');
    }
  });

  it('reports INVARIANT_FAILED for duplicate raw samples', () => {
    const obj = JSON.parse(serialize({ pack: SAMPLE_PACK, rawSamples: SAMPLE_RAW_SAMPLES })) as Record<string, unknown>;
    const list = obj.rawSamples as unknown[];
    obj.rawSamples = [list[0], list[0]];
    const result = parsePackFile(JSON.stringify(obj));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain('INVARIANT_FAILED');
  });
});