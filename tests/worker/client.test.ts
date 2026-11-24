import type { GlyphPack } from '@engine';
import type { WorkerRequest, WorkerResponse } from '../../src/worker/protocol';
import { WorkerClient } from '../../src/worker/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_PACK, SAMPLE_RAW_SAMPLES } from '../fixtures/samplePack';

class FakeWorker {
  readonly posted: WorkerRequest[] = [];
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: WorkerResponse): void {
    this.onmessage?.(new MessageEvent<WorkerResponse>('message', { data: message }));
  }

  asWorker(): Worker {
    return this as unknown as Worker;
  }
}

function setup(): { client: WorkerClient; workers: FakeWorker[] } {
  const workers: FakeWorker[] = [];
  const client = new WorkerClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker.asWorker();
  });
  return { client, workers };
}

function loaded(worker: FakeWorker, request: WorkerRequest): void {
  if (request.type !== 'load-pack') throw new Error('expected load-pack');
  worker.emit({
    type: 'pack-ready',
    jobId: request.jobId,
    revision: request.revision,
    pack: request.pack,
  });
}

const PDF_PARAMS = {
  text: 'l',
  variance: {
    seed: 1,
    slantJitter: 0.5,
    baselineDrift: 0.5,
    spacingVariance: 0.5,
    inkPressure: 0.5,
    mode: 'print' as const,
    poolSize: 4,
  },
  template: 'ruled' as const,
  xHeightPt: 10,
  inkRgb: [0, 0, 0] as [number, number, number],
  maxPages: 1,
  documentDateIso: '2026-01-01T00:00:00.000Z',
};

function emptyStats() {
  return {
    pages: 1,
    glyphsPlaced: 1,
    xobjects: 1,
    ligatures: 0,
    bytes: 1,
    durationMs: 1,
    truncated: false,
    missingChars: [],
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('WorkerClient', () => {
  it('preserves FIFO order and fills the PDF revision at dispatch', async () => {
    const { client, workers } = setup();
    const loading = client.loadPack(SAMPLE_PACK, 4);
    const pdf = client.generatePdf(PDF_PARAMS);
    const worker = workers[0];
    expect(worker.posted[0]?.type).toBe('load-pack');
    loaded(worker, worker.posted[0]!);
    await loading;

    const request = worker.posted[1];
    expect(request?.type).toBe('generate-pdf');
    if (request?.type !== 'generate-pdf') throw new Error('expected generate-pdf');
    expect(request.params.packRevision).toBe(4);
    worker.emit({
      type: 'pdf-done',
      jobId: request.jobId,
      buffer: new ArrayBuffer(1),
      stats: emptyStats(),
      warnings: [],
    });
    const result = await pdf;
    expect(result.blob.type).toBe('application/pdf');
    client.dispose();
  });

  it('rejects an already-aborted signal without posting a job', async () => {
    const { client, workers } = setup();
    const controller = new AbortController();
    controller.abort();

    await expect(client.importJson('{}', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(workers).toHaveLength(0);
    client.dispose();
  });

  it('removes a queued job when its signal aborts before start', async () => {
    const { client, workers } = setup();
    const active = client.loadPack(SAMPLE_PACK, 1);
    const controller = new AbortController();
    const queued = client.importJson('{}', { signal: controller.signal });
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0]?.posted).toHaveLength(1);
    loaded(workers[0]!, workers[0]!.posted[0]!);
    await active;
    client.dispose();
  });

  it('hard-cancels after 1000 ms and restores the last pack in the new worker', async () => {
    vi.useFakeTimers();
    const { client, workers } = setup();
    const loading = client.loadPack(SAMPLE_PACK, 5);
    loaded(workers[0]!, workers[0]!.posted[0]!);
    await loading;

    const controller = new AbortController();
    const pdf = client.generatePdf(PDF_PARAMS, { signal: controller.signal });
    controller.abort();
    expect(workers[0]!.posted[2]?.type).toBe('cancel');
    const aborted = expect(pdf).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(999);
    expect(workers[0]!.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await aborted;

    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers[1]!.posted[0]).toMatchObject({
      type: 'load-pack',
      revision: 5,
      pack: SAMPLE_PACK,
    });
    client.dispose();
  });

  it('restores the pre-build pack after a build-pack hard cancel', async () => {
    vi.useFakeTimers();
    const { client, workers } = setup();
    const loading = client.loadPack(SAMPLE_PACK, 5);
    loaded(workers[0]!, workers[0]!.posted[0]!);
    await loading;

    const controller = new AbortController();
    const build = client.buildPack(
      SAMPLE_RAW_SAMPLES,
      '2026-01-01T00:00:00.000Z',
      6,
      { signal: controller.signal },
    );
    controller.abort();
    const aborted = expect(build).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1_000);
    await aborted;

    expect(workers[1]!.posted[0]).toMatchObject({
      type: 'load-pack',
      revision: 5,
      pack: SAMPLE_PACK,
    });
    client.dispose();
  });

  it('terminates and respawns a silent worker after 10 seconds', async () => {
    vi.useFakeTimers();
    const { client, workers } = setup();
    const importPromise = client.importJson('{}');
    const stalled = expect(importPromise).rejects.toThrow('worker stalled');

    await vi.advanceTimersByTimeAsync(10_000);
    await stalled;
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    client.dispose();
  });

  it('keeps the most recently accepted pack available for reload', async () => {
    const { client, workers } = setup();
    const alternatePack: GlyphPack = { ...SAMPLE_PACK, createdAt: '2026-02-01T00:00:00.000Z' };
    const loading = client.loadPack(alternatePack, 8);
    loaded(workers[0]!, workers[0]!.posted[0]!);
    await loading;

    const pdf = client.generatePdf(PDF_PARAMS);
    const request = workers[0]!.posted[1];
    if (request?.type !== 'generate-pdf') throw new Error('expected generate-pdf');
    expect(request.params.packRevision).toBe(8);
    workers[0]!.emit({
      type: 'pdf-done',
      jobId: request.jobId,
      buffer: new ArrayBuffer(1),
      stats: emptyStats(),
      warnings: [],
    });
    await pdf;
    client.dispose();
  });
});
