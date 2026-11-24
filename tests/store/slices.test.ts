import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_PACK, SAMPLE_RAW_SAMPLES } from '../fixtures/samplePack';
import { DEFAULT_VARIANCE, LIMITS } from '@engine';
import type { GlyphPack, RawGlyphSample, RawStrokePoint, ValidationResult } from '@engine';
import { DEMO_CAPTURED_AT } from '../../src/demo/constants';
import type { ImportOutcome, JobOpts, PdfStats, PdfWarning } from '../../src/worker/protocol';
import { WorkerClient, WorkerJobError } from '../../src/worker/client';
import type { WorkerRequest, WorkerResponse } from '../../src/worker/protocol';
import { boot } from '../../src/store/boot';
import { DB_NAME, openDb, put } from '../../src/store/db';
import type { Db } from '../../src/store/db';
import { debounce } from '../../src/store/debounce';
import type { PackCacheRecord, SessionMeta } from '../../src/store/persistence';
import { computeFingerprint, replaceAll } from '../../src/store/persistence';
import { DRAFT_MS, REBUILD_MS, SETTINGS_MS } from '../../src/store/timing';
import { createAppStore, selectCanExport, useAppStore } from '../../src/store/useAppStore';
import type { WorkerApi } from '../../src/store/useAppStore';

vi.mock('../../src/store/download', () => ({ downloadBlob: vi.fn() }));

const session: SessionMeta = {
  nextSessionIndex: 10,
  guideBaselinePx: 340,
  guideXHeightPx: 120,
  penWidthPx: 16,
};

function memoryDb(): Db {
  return {
    idb: null,
    mem: { raw: new Map(), pack: new Map(), meta: new Map() },
    onClose: null,
  };
}

class ClientStub implements WorkerApi {
  buildCalls = 0;
  loadCalls = 0;
  generateCalls = 0;
  buildImplementation: ((samples: RawGlyphSample[], nowIso: string, revision: number, opts?: JobOpts) => Promise<{ revision: number; pack: GlyphPack }>) | null = null;
  generateImplementation: (() => Promise<{ blob: Blob; stats: PdfStats; warnings: PdfWarning[] }>) | null = null;

  buildPack(samples: RawGlyphSample[], nowIso: string, revision: number, opts?: JobOpts): Promise<{ revision: number; pack: GlyphPack }> {
    this.buildCalls++;
    return this.buildImplementation?.(samples, nowIso, revision, opts)
      ?? Promise.resolve({ revision, pack: SAMPLE_PACK });
  }

  loadPack(_pack: GlyphPack, revision: number): Promise<{ revision: number }> {
    this.loadCalls++;
    return Promise.resolve({ revision });
  }

  generatePdf(): Promise<{ blob: Blob; stats: PdfStats; warnings: PdfWarning[] }> {
    this.generateCalls++;
    if (this.generateImplementation) return this.generateImplementation();
    return Promise.resolve({
      blob: new Blob(['pdf'], { type: 'application/pdf' }),
      stats: {
        pages: 1,
        glyphsPlaced: 1,
        xobjects: 1,
        ligatures: 0,
        bytes: 3,
        durationMs: 1,
        truncated: false,
        missingChars: [],
      },
      warnings: [],
    });
  }

  importJson(): Promise<ImportOutcome> {
    return Promise.resolve({ ok: false, issues: [] });
  }

  exportJson(): Promise<ValidationResult<string>> {
    return Promise.resolve({ ok: true, value: '{}' });
  }
}

class AutoWorker {
  readonly posted: WorkerRequest[] = [];
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
    if (message.type !== 'build-pack' && message.type !== 'load-pack') return;
    const pack = message.type === 'load-pack' ? message.pack : SAMPLE_PACK;
    queueMicrotask(() => this.onmessage?.(new MessageEvent<WorkerResponse>('message', {
      data: { type: 'pack-ready', jobId: message.jobId, revision: message.revision, pack },
    })));
  }

  terminate(): void {}

  asWorker(): Worker {
    return this as unknown as Worker;
  }
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: (value) => resolvePromise(value) };
}

async function deleteDatabase(): Promise<void> {
  useAppStore.getState().db?.idb?.close();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('DELETE_FAILED'));
    request.onblocked = () => reject(new Error('DELETE_BLOCKED'));
  });
}

afterEach(async () => {
  vi.useRealTimers();
  await deleteDatabase();
});

describe('store slices', () => {
  it('does not persist strokes until commit, then clears undo and redo history', async () => {
    vi.useFakeTimers();
    const store = createAppStore();
    const db = memoryDb();
    store.getState().setDb(db);
    store.getState().setClient(new ClientStub());
    const points = SAMPLE_RAW_SAMPLES.find((sample) => sample.char === 'a')!.strokes[0]!;

    store.getState().pushStroke(points);
    expect(db.mem.raw.size).toBe(0);
    store.getState().pushStroke(points);
    store.getState().undoStroke();
    expect(store.getState().redoStack).toHaveLength(1);
    await store.getState().commitDraft();

    expect(db.mem.raw.has('a#0')).toBe(true);
    expect(store.getState().draftState).toBe('idle');
    expect(store.getState().draftStrokes).toHaveLength(0);
    expect(store.getState().redoStack).toHaveLength(0);
  });

  it('snapshots draft guides, applies floor/ceil baseline clamps, and aborts on navigation', async () => {
    const store = createAppStore();
    const db = memoryDb();
    let aborted = 0;
    store.getState().setDb(db);
    store.getState().setCaptureAbort(() => { aborted++; });
    store.getState().setGuides(500, 62);
    expect(store.getState().guideBaselinePx).toBe(428);

    store.getState().onDrawingChange(true);
    store.getState().setGuides(350, 120);
    store.getState().pushStroke(SAMPLE_RAW_SAMPLES[0]!.strokes[0]!);
    store.getState().onDrawingChange(false);
    store.getState().pushStroke(SAMPLE_RAW_SAMPLES[0]!.strokes[0]!);
    store.getState().undoStroke();
    await store.getState().commitDraft();

    const saved = db.mem.raw.get('a#0') as RawGlyphSample | undefined;
    expect(saved?.guides.baselineY).toBe(428);
    expect(store.getState().redoStack).toHaveLength(0);

    store.getState().pushStroke(SAMPLE_RAW_SAMPLES[0]!.strokes[0]!);
    store.getState().undoStroke();
    store.getState().next();
    expect(aborted).toBe(1);
    expect(store.getState().draftStrokes).toHaveLength(0);
    expect(store.getState().redoStack).toHaveLength(0);
  });

  it('thins a draft before enforcing the total raw-point cap', async () => {
    vi.useFakeTimers();
    const store = createAppStore();
    const db = memoryDb();
    store.getState().setDb(db);
    store.getState().setClient(new ClientStub());
    const baseSample = SAMPLE_RAW_SAMPLES[0]!;
    const basePoint = baseSample.strokes[0]![0]!;
    const existing = ['g', 'h', 'i', 'j', 'k', 'l'].map((char, index) => ({
      ...baseSample,
      char,
      variantIndex: 0,
      sessionIndex: index,
      strokes: [[...new Array(20_000 - (index === 5 ? 2 : 0)).fill(basePoint)]],
    }));
    store.getState().replaceRaw(existing, session);

    const point: RawStrokePoint = {
      ...SAMPLE_RAW_SAMPLES.find((sample) => sample.char === 'a')!.strokes[0]![0]!,
    };
    const draft = [
      point,
      { ...point, t: point.t + 1 },
      { ...point, t: point.t + 2 },
    ];
    store.getState().pushStroke(draft);
    await store.getState().commitDraft();

    const saved = db.mem.raw.get('a#0') as RawGlyphSample | undefined;
    expect(saved?.strokes[0]).toHaveLength(2);
    expect(store.getState().draftState).toBe('idle');
    expect(Object.values(store.getState().rawByKey)
      .reduce((total, sample) => total + sample.strokes.reduce((count, stroke) => count + stroke.length, 0), 0))
      .toBe(LIMITS.MAX_RAW_POINTS_TOTAL);
  });

  it('debounces settings, text drafts, and pack rebuilding at 300, 500, and 400 ms', async () => {
    vi.useFakeTimers();
    const settings = vi.fn();
    const draft = vi.fn();
    const rebuild = vi.fn();
    const settingsDebounce = debounce(settings, SETTINGS_MS);
    const draftDebounce = debounce(draft, DRAFT_MS);
    settingsDebounce();
    draftDebounce();
    const store = createAppStore();
    const client = new ClientStub();
    client.buildImplementation = async (_samples, _now, revision) => {
      rebuild();
      return { revision, pack: SAMPLE_PACK };
    };
    store.getState().setDb(memoryDb());
    store.getState().setClient(client);
    store.getState().replaceRaw(SAMPLE_RAW_SAMPLES, session);
    store.getState().scheduleRebuild();

    await vi.advanceTimersByTimeAsync(299);
    expect(settings).not.toHaveBeenCalled();
    expect(draft).not.toHaveBeenCalled();
    expect(rebuild).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settings).toHaveBeenCalledTimes(1);
    expect(rebuild).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(REBUILD_MS - SETTINGS_MS);
    expect(rebuild).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DRAFT_MS - REBUILD_MS);
    expect(draft).toHaveBeenCalledTimes(1);
  });

  it('discards stale build tokens and never caches an old pack under a newer fingerprint', async () => {
    const store = createAppStore();
    const db = memoryDb();
    const client = new ClientStub();
    const first = deferred<{ revision: number; pack: GlyphPack }>();
    const second = deferred<{ revision: number; pack: GlyphPack }>();
    let buildIndex = 0;
    client.buildImplementation = () => {
      buildIndex++;
      return buildIndex === 1 ? first.promise : second.promise;
    };
    store.getState().setDb(db);
    store.getState().setClient(client);
    store.getState().replaceRaw(SAMPLE_RAW_SAMPLES, session);

    const staleBuild = store.getState().rebuildNow();
    const currentBuild = store.getState().rebuildNow();
    const latestPack = { ...SAMPLE_PACK, createdAt: '2026-03-01T00:00:00.000Z' };
    second.resolve({ revision: 2, pack: latestPack });
    await currentBuild;
    first.resolve({ revision: 1, pack: SAMPLE_PACK });
    await staleBuild;
    expect(store.getState().pack).toEqual(latestPack);
    expect(store.getState().revision).toBe(1);

    const snapshot = SAMPLE_RAW_SAMPLES;
    const snapshotFingerprint = computeFingerprint(snapshot);
    store.getState().replaceRaw([snapshot[0]!], session);
    const staleFingerprintBuild = deferred<{ revision: number; pack: GlyphPack }>();
    client.buildImplementation = () => staleFingerprintBuild.promise;
    const pending = store.getState().rebuildNow();
    store.getState().replaceRaw([snapshot[0]!, snapshot[1]!], session);
    staleFingerprintBuild.resolve({ revision: 3, pack: SAMPLE_PACK });
    await pending;

    const cached = db.mem.pack.get('current') as PackCacheRecord | undefined;
    expect(store.getState().packStatus).toBe('stale');
    expect(cached?.sourceFingerprint).toBe(computeFingerprint([snapshot[0]!]));
    expect(cached?.sourceFingerprint).not.toBe(computeFingerprint([snapshot[0]!, snapshot[1]!]));
    expect(cached?.sourceFingerprint).not.toBe(snapshotFingerprint);
  });

  it('rebuilds on a fingerprint mismatch, engine revision mismatch, or corrupt cached pack', async () => {
    const scenarios = ['fingerprint', 'engineSpec', 'corrupt'] as const;
    for (const scenario of scenarios) {
      await deleteDatabase();
      const db = await openDb();
      const fingerprint = computeFingerprint(SAMPLE_RAW_SAMPLES);
      await replaceAll(db, { raw: SAMPLE_RAW_SAMPLES, pack: null, session });
      await put(db, 'pack', 'current', {
        engineSpec: scenario === 'engineSpec' ? 'MathEngine/old' : 'MathEngine/1',
        sourceFingerprint: scenario === 'fingerprint' ? 'fingerprint-mismatch' : fingerprint,
        pack: scenario === 'corrupt' ? {} : SAMPLE_PACK,
        savedAt: '2026-01-01T00:00:00.000Z',
      });

      const worker = new AutoWorker();
      const client = new WorkerClient(() => worker.asWorker());
      await boot(client);
      expect(worker.posted.some((message) => message.type === 'build-pack')).toBe(true);
      expect(useAppStore.getState().packStatus).toBe('ready');
      client.dispose();
      db.idb?.close();
    }
  });

  it('sanitizes boot settings and advances the session index past hydrated samples', async () => {
    await deleteDatabase();
    const db = await openDb();
    await replaceAll(db, { raw: SAMPLE_RAW_SAMPLES, pack: null, session: {
      nextSessionIndex: 0,
      guideBaselinePx: 500,
      guideXHeightPx: 62,
      penWidthPx: 99,
    } });
    await put(db, 'meta', 'settings', {
      variance: { seed: Number.NaN, slantJitter: 3, poolSize: 10_000, mode: 'unknown' },
      template: 'unknown',
      xHeightPt: Number.NaN,
      inkRgb: [2, -1, 0.5],
      maxPages: 99,
    });
    await put(db, 'meta', 'draft', 'x'.repeat(LIMITS.MAX_TEXT_CHARS + 1));
    await put(db, 'pack', 'current', {
      engineSpec: 'MathEngine/1',
      sourceFingerprint: computeFingerprint(SAMPLE_RAW_SAMPLES),
      pack: SAMPLE_PACK,
      savedAt: '2026-01-01T00:00:00.000Z',
    });

    const worker = new AutoWorker();
    const client = new WorkerClient(() => worker.asWorker());
    await boot(client);
    const state = useAppStore.getState();
    expect(state.text).toHaveLength(LIMITS.MAX_TEXT_CHARS);
    expect(state.variance).toMatchObject({
      seed: DEFAULT_VARIANCE.seed,
      slantJitter: 1,
      poolSize: LIMITS.MAX_POOL_SIZE,
      mode: 'print',
    });
    expect(state.template).toBe('ruled');
    expect(state.xHeightPt).toBe(10);
    expect(state.inkRgb).toEqual([1, 0, 0.5]);
    expect(state.maxPages).toBe(10);
    expect(state.guideBaselinePx).toBe(428);
    expect(state.guideXHeightPx).toBe(62);
    expect(state.penWidthPx).toBe(32);
    expect(state.nextSessionIndex).toBe(10);
    client.dispose();
    db.idb?.close();
  });

  it('rebuilds imported raw samples and marks pack-only imports as imported', async () => {
    const store = createAppStore();
    const db = memoryDb();
    const client = new ClientStub();
    store.getState().setDb(db);
    store.getState().setClient(client);
    await store.getState().applyImported(SAMPLE_PACK, SAMPLE_RAW_SAMPLES);
    expect(client.buildCalls).toBe(1);
    const rawCache = db.mem.pack.get('current') as PackCacheRecord;
    expect(rawCache.sourceFingerprint).toBe(computeFingerprint(SAMPLE_RAW_SAMPLES));
    expect(client.buildCalls).toBe(1);
    expect(db.mem.raw.size).toBe(SAMPLE_RAW_SAMPLES.length);

    await store.getState().applyImported(SAMPLE_PACK, null);
    const packOnlyCache = db.mem.pack.get('current') as PackCacheRecord;
    expect(packOnlyCache.sourceFingerprint).toBe('imported');
    expect(db.mem.raw.size).toBe(0);
    expect(store.getState().importedNoRaw).toBe(true);
    expect(client.loadCalls).toBe(1);
  });

  it('loads demo samples only through the injected loader', async () => {
    const store = createAppStore();
    const db = memoryDb();
    const client = new ClientStub();
    const demoSamples = SAMPLE_RAW_SAMPLES.map((sample, sessionIndex) => ({
      ...sample,
      sessionIndex,
      capturedAt: DEMO_CAPTURED_AT,
    }));
    store.getState().setDb(db);
    store.getState().setClient(client);
    store.getState().setDemoLoader(async () => ({
      buildDemoSamples: () => demoSamples,
    }));

    await store.getState().loadDemo();

    expect(store.getState().rawByKey).toHaveProperty('a#0');
    expect(store.getState().importedNoRaw).toBe(false);
    expect(store.getState().packStatus).toBe('ready');
    expect(client.buildCalls).toBe(1);
  });

  it('allows export after terminal job phases and retries one worker revision failure', async () => {
    const store = createAppStore();
    const client = new ClientStub();
    store.getState().setClient(client);
    store.getState().setPackFromCache(SAMPLE_PACK, 'fingerprint');
    store.getState().setText('l');

    for (const phase of ['idle', 'done', 'cancelled', 'failed'] as const) {
      store.setState({ phase });
      expect(selectCanExport(store.getState())).toBe(true);
    }

    client.generateImplementation = async () => {
      if (client.generateCalls === 1) throw new WorkerJobError('PACK_NOT_LOADED', 'pack missing');
      return {
        blob: new Blob(['pdf'], { type: 'application/pdf' }),
        stats: {
          pages: 1,
          glyphsPlaced: 1,
          xobjects: 1,
          ligatures: 0,
          bytes: 3,
          durationMs: 1,
          truncated: false,
          missingChars: [],
        },
        warnings: [],
      };
    };
    await store.getState().startExport();

    expect(client.generateCalls).toBe(2);
    expect(client.loadCalls).toBe(1);
    expect(store.getState().phase).toBe('done');
  });

});
