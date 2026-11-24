import { describe, expect, it } from 'vitest';
import { validateRawSample } from '@engine';
import { parsePackFile, serializePackFile } from '../../src/engine/schema/packFile';
import { SAMPLE_PACK } from '../fixtures/samplePack';

const exportedAt = '2026-02-02T03:04:05.000Z';

describe('hostile schema input', () => {
  it('rejects nesting beyond the parser guard before JSON parsing', () => {
    const result = parsePackFile(`${'['.repeat(13)}${']'.repeat(13)}`);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'CAP_EXCEEDED', path: '/' }],
    });
  });

  it('rejects prototype-like keys in a pack-file envelope', () => {
    const valid = serializePackFile({ pack: SAMPLE_PACK, rawSamples: null }, exportedAt);
    if (!valid.ok) throw new Error('fixture serialization failed');
    const hostile = JSON.parse(valid.value) as Record<string, unknown>;
    Object.defineProperty(hostile, 'constructor', {
      value: { prototype: { polluted: true } },
      enumerable: true,
    });
    const result = parsePackFile(JSON.stringify(hostile));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.code === 'UNKNOWN_KEY')).toBe(true);
  });

  it('rejects control and surrogate code points as sample keys', () => {
    const base = {
      char: '\u0000',
      variantIndex: 0,
      sessionIndex: 0,
      guides: { ascenderY: 100, xHeightY: 220, baselineY: 340, descenderY: 420 },
      penWidthPx: 16,
      strokes: [[{
        x: 100,
        y: 340,
        pressure: 0.5,
        tiltX: 0,
        tiltY: 0,
        t: 1,
        pointerType: 'mouse',
        dpr: 1,
      }]],
      capturedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(validateRawSample(base).ok).toBe(false);
    expect(validateRawSample({ ...base, char: '\uD800' }).ok).toBe(false);
  });
});
