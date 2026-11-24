import { buildGlyphPack, serializePackFile } from '@engine';
import { describe, expect, it } from 'vitest';
import { importJob } from '../../src/worker/jobs/importJob';
import { SAMPLE_PACK, SAMPLE_RAW_SAMPLES } from '../fixtures/samplePack';

const DATE = '2026-03-01T00:00:00.000Z';

describe('importJob', () => {
  it('rebuilds the pack from raw samples and ignores the envelope pack', async () => {
    const importedPack = {
      ...SAMPLE_PACK,
      createdAt: DATE,
      style: { ...SAMPLE_PACK.style, slantDeg: SAMPLE_PACK.style.slantDeg + 1 },
    };
    const serialized = serializePackFile(
      { pack: importedPack, rawSamples: SAMPLE_RAW_SAMPLES },
      DATE,
    );
    if (!serialized.ok) throw new Error('test fixture could not be serialized');

    const result = await importJob(serialized.value, {
      jobId: 'import',
      post: () => undefined,
      checkpoint: async () => undefined,
      now: () => 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rawSamples).toEqual(SAMPLE_RAW_SAMPLES);
    expect(result.pack).toEqual(buildGlyphPack(SAMPLE_RAW_SAMPLES, DATE));
    expect(result.pack.style.slantDeg).not.toBe(importedPack.style.slantDeg);
  });

  it('retains the validated pack when the import has no raw samples', async () => {
    const serialized = serializePackFile({ pack: SAMPLE_PACK, rawSamples: null }, DATE);
    if (!serialized.ok) throw new Error('test fixture could not be serialized');

    const result = await importJob(serialized.value, {
      jobId: 'import-pack-only',
      post: () => undefined,
      checkpoint: async () => undefined,
      now: () => 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack).toEqual(SAMPLE_PACK);
    expect(result.rawSamples).toBeNull();
  });
});
