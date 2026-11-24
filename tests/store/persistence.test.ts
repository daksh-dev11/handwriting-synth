import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { SAMPLE_PACK, SAMPLE_RAW_SAMPLES } from '../fixtures/samplePack';
import { DB_NAME, get, openDb, tx } from '../../src/store/db';
import type { Db } from '../../src/store/db';
import {
  computeFingerprint,
  loadAllRaw,
  replaceAll,
  savePackCache,
} from '../../src/store/persistence';
import type { SessionMeta } from '../../src/store/persistence';
import type { RawGlyphSample } from '@engine';

let activeDb: Db | null = null;

const session: SessionMeta = {
  nextSessionIndex: 10,
  guideBaselinePx: 340,
  guideXHeightPx: 120,
  penWidthPx: 16,
};

async function deleteDatabase(): Promise<void> {
  activeDb?.idb?.close();
  activeDb = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('DELETE_FAILED'));
    request.onblocked = () => reject(new Error('DELETE_BLOCKED'));
  });
}

afterEach(async () => {
  await deleteDatabase();
});

describe('store persistence', () => {
  it('fingerprints a sorted raw manifest and changes when its manifest changes', () => {
    const samples = SAMPLE_RAW_SAMPLES;
    expect(computeFingerprint(samples)).toBe(computeFingerprint([...samples].reverse()));
    const changed = samples.map((sample, index) => index === 0
      ? { ...sample, capturedAt: '2026-02-01T00:00:00.000Z' }
      : sample);
    expect(computeFingerprint(changed)).not.toBe(computeFingerprint(samples));
  });

  it('uses one replaceAll transaction and preserves old records after a synchronous throw', async () => {
    activeDb = await openDb();
    await replaceAll(activeDb, { raw: [SAMPLE_RAW_SAMPLES[0]!], pack: null, session });
    const broken: RawGlyphSample = { ...SAMPLE_RAW_SAMPLES[1]! };
    Object.defineProperty(broken, 'char', {
      get: () => { throw new Error('synchronous sample key failure'); },
    });

    await expect(replaceAll(activeDb, {
      raw: [SAMPLE_RAW_SAMPLES[2]!, broken],
      pack: null,
      session,
    })).rejects.toThrow('synchronous sample key failure');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const entries = await loadAllRaw(activeDb);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual([
      `${SAMPLE_RAW_SAMPLES[0]!.char}#${SAMPLE_RAW_SAMPLES[0]!.variantIndex}`,
      SAMPLE_RAW_SAMPLES[0],
    ]);
    expect(await get(activeDb, 'meta', 'session')).toEqual(session);
  });

  it('rolls back queued requests when a transaction callback throws', async () => {
    activeDb = await openDb();
    await replaceAll(activeDb, { raw: [SAMPLE_RAW_SAMPLES[0]!], pack: null, session });
    await expect(tx(activeDb, ['raw', 'pack'], 'readwrite', (stores) => {
      stores.raw.clear();
      stores.pack.put(SAMPLE_PACK, 'current');
      throw new Error('abort this transaction');
    })).rejects.toThrow('abort this transaction');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const entries = await loadAllRaw(activeDb);
    expect(entries).toHaveLength(1);
    expect(await get(activeDb, 'pack', 'current')).toBeUndefined();
  });

  it('stores the pack cache independently from raw data', async () => {
    activeDb = await openDb();
    const cache = {
      engineSpec: 'MathEngine/1',
      sourceFingerprint: computeFingerprint(SAMPLE_RAW_SAMPLES),
      pack: SAMPLE_PACK,
      savedAt: '2026-01-01T00:00:00.000Z',
    };
    await savePackCache(activeDb, cache);
    expect(await get(activeDb, 'pack', 'current')).toEqual(cache);
    expect(await loadAllRaw(activeDb)).toEqual([]);
  });
});
