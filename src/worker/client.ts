import type {
  GlyphPack,
  RawGlyphSample,
  ValidationResult,
} from '@engine';
import type {
  GeneratePdfParams,
  ImportOutcome,
  JobId,
  JobOpts,
  PdfStats,
  PdfWarning,
  ProgressInfo,
  WorkerRequest,
  WorkerResponse,
} from './protocol';

interface LastPack {
  revision: number;
  pack: GlyphPack;
}

interface QueueEntry {
  id: JobId;
  makeRequest: (id: JobId) => WorkerRequest;
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onProgress?: (progress: ProgressInfo) => void;
  abortListener?: () => void;
  watchdogTimer?: ReturnType<typeof setTimeout>;
  cancelTimer?: ReturnType<typeof setTimeout>;
  cancelRequested: boolean;
}

export class WorkerJobError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'WorkerJobError';
  }
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function defaultFactory(): Worker {
  return new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error('worker failed');
}

export class WorkerClient {
  private readonly queue: QueueEntry[] = [];
  private worker: Worker | null = null;
  private active: QueueEntry | null = null;
  private lastPack: LastPack | null = null;
  private counter = 0;
  private rehydratingId: JobId | null = null;
  private disposed = false;

  constructor(private readonly factory: () => Worker = defaultFactory) {}

  buildPack(
    samples: RawGlyphSample[],
    nowIso: string,
    revision: number,
    opts: JobOpts = {},
  ): Promise<{ revision: number; pack: GlyphPack }> {
    return this.enqueue(opts, 'build-pack', (jobId) => ({
      type: 'build-pack',
      jobId,
      revision,
      samples,
      nowIso,
    })).then((response) => {
      if (response.type !== 'pack-ready') throw new Error('unexpected build-pack response');
      return { revision: response.revision, pack: response.pack };
    });
  }

  loadPack(pack: GlyphPack, revision: number, opts: JobOpts = {}): Promise<{ revision: number }> {
    return this.enqueue(opts, 'load-pack', (jobId) => ({ type: 'load-pack', jobId, pack, revision }))
      .then((response) => {
        if (response.type !== 'pack-ready') throw new Error('unexpected load-pack response');
        return { revision: response.revision };
      });
  }

  generatePdf(
    params: Omit<GeneratePdfParams, 'packRevision'>,
    opts: JobOpts = {},
  ): Promise<{ blob: Blob; stats: PdfStats; warnings: PdfWarning[] }> {
    return this.enqueue(opts, 'generate-pdf', (jobId) => ({
      type: 'generate-pdf',
      jobId,
      params: { ...params, packRevision: this.lastPack?.revision ?? -1 },
    })).then((response) => {
      if (response.type !== 'pdf-done') throw new Error('unexpected generate-pdf response');
      return {
        blob: new Blob([response.buffer], { type: 'application/pdf' }),
        stats: response.stats,
        warnings: response.warnings,
      };
    });
  }

  importJson(text: string, opts: JobOpts = {}): Promise<ImportOutcome> {
    return this.enqueue(opts, 'import-json', (jobId) => ({ type: 'import-json', jobId, text }))
      .then((response) => {
        if (response.type !== 'import-result') throw new Error('unexpected import response');
        return response.ok
          ? { ok: true, pack: response.pack, rawSamples: response.rawSamples }
          : { ok: false, issues: response.issues };
      });
  }

  exportJson(
    pack: GlyphPack,
    rawSamples: RawGlyphSample[] | null,
    exportedAtIso: string,
    opts: JobOpts = {},
  ): Promise<ValidationResult<string>> {
    return this.enqueue(opts, 'export-json', (jobId) => ({
      type: 'export-json',
      jobId,
      pack,
      rawSamples,
      exportedAtIso,
    })).then((response) => {
      if (response.type !== 'export-result') throw new Error('unexpected export response');
      return response.ok
        ? { ok: true, value: response.json }
        : { ok: false, issues: response.issues };
    });
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    const error = new Error('worker client disposed');
    if (this.active) this.finish(this.active, undefined, error);
    for (const entry of this.queue.splice(0)) this.finish(entry, undefined, error);
    this.rehydratingId = null;
  }

  private enqueue(
    opts: JobOpts,
    kind: Exclude<WorkerRequest['type'], 'cancel'>,
    makeRequest: (jobId: JobId) => WorkerRequest,
  ): Promise<WorkerResponse> {
    if (this.disposed) return Promise.reject(new Error('worker client disposed'));
    if (opts.signal?.aborted) return Promise.reject(abortError());

    return new Promise<WorkerResponse>((resolve, reject) => {
      const entry: QueueEntry = {
        id: `${kind}-${++this.counter}`,
        makeRequest,
        resolve,
        reject,
        signal: opts.signal,
        onProgress: opts.onProgress,
        cancelRequested: false,
      };
      if (entry.signal) {
        entry.abortListener = () => this.abort(entry);
        entry.signal.addEventListener('abort', entry.abortListener);
      }
      this.queue.push(entry);
      this.pump();
    });
  }

  private pump(): void {
    if (this.disposed || this.active || this.rehydratingId || this.queue.length === 0) return;
    const entry = this.queue.shift();
    if (!entry) return;
    this.active = entry;
    try {
      const worker = this.ensureWorker();
      const request = entry.makeRequest(entry.id);
      if (request.type === 'load-pack') this.lastPack = { revision: request.revision, pack: request.pack };
      worker.postMessage(request);
      this.resetWatchdog(entry);
    } catch (error) {
      this.finish(entry, undefined, asError(error));
      this.pump();
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = this.factory();
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.onMessage(worker, event.data);
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      this.onWorkerFailure(worker, new Error(event.message || 'worker error'));
    };
    this.worker = worker;
    return worker;
  }

  private onMessage(worker: Worker, response: WorkerResponse): void {
    if (this.worker !== worker) return;
    if (response.type === 'ready') return;

    if (response.jobId === this.rehydratingId) {
      this.rehydratingId = null;
      if (response.type === 'pack-ready') {
        this.lastPack = { revision: response.revision, pack: response.pack };
        this.pump();
      } else {
        this.lastPack = null;
        const error = response.type === 'error'
          ? new WorkerJobError(response.code, response.message)
          : new Error('worker pack restore failed');
        for (const entry of this.queue.splice(0)) this.finish(entry, undefined, error);
      }
      return;
    }

    const entry = this.active;
    if (!entry || response.jobId !== entry.id) return;
    this.resetWatchdog(entry);
    if (response.type === 'progress') {
      entry.onProgress?.(response.info);
      return;
    }
    if (response.type === 'pack-ready') {
      this.lastPack = { revision: response.revision, pack: response.pack };
      this.finish(entry, response);
    } else if (response.type === 'cancelled') {
      this.finish(entry, undefined, abortError());
    } else if (response.type === 'error') {
      this.finish(entry, undefined, new WorkerJobError(response.code, response.message));
    } else {
      this.finish(entry, response);
    }
    this.pump();
  }

  private abort(entry: QueueEntry): void {
    if (this.active === entry) {
      if (entry.cancelRequested) return;
      entry.cancelRequested = true;
      try {
        this.worker?.postMessage({ type: 'cancel', jobId: entry.id } satisfies WorkerRequest);
      } catch {
        this.hardCancel(entry);
        return;
      }
      entry.cancelTimer = setTimeout(() => this.hardCancel(entry), 1_000);
      return;
    }
    const index = this.queue.indexOf(entry);
    if (index >= 0) {
      this.queue.splice(index, 1);
      this.finish(entry, undefined, abortError());
    }
  }

  private hardCancel(entry: QueueEntry): void {
    if (this.active !== entry) return;
    this.clearTimers(entry);
    this.removeAbortListener(entry);
    this.active = null;
    entry.reject(abortError());
    this.respawn();
    this.pump();
  }

  private resetWatchdog(entry: QueueEntry): void {
    if (entry.watchdogTimer) clearTimeout(entry.watchdogTimer);
    entry.watchdogTimer = setTimeout(() => {
      if (this.active !== entry) return;
      this.finish(entry, undefined, new Error('worker stalled'));
      this.respawn();
      this.pump();
    }, 10_000);
  }

  private onWorkerFailure(worker: Worker, error: Error): void {
    if (this.worker !== worker) return;
    if (this.active) this.finish(this.active, undefined, error);
    this.respawn();
    this.pump();
  }

  private respawn(): void {
    this.worker?.terminate();
    this.worker = null;
    this.rehydratingId = null;
    const saved = this.lastPack;
    if (this.disposed) return;
    try {
      const worker = this.ensureWorker();
      if (!saved) return;
      const id = `load-pack-${++this.counter}`;
      this.rehydratingId = id;
      worker.postMessage({ type: 'load-pack', jobId: id, revision: saved.revision, pack: saved.pack });
    } catch (error) {
      this.rehydratingId = null;
      const failure = asError(error);
      for (const entry of this.queue.splice(0)) this.finish(entry, undefined, failure);
    }
  }

  private finish(entry: QueueEntry, response?: WorkerResponse, error?: Error): void {
    this.clearTimers(entry);
    this.removeAbortListener(entry);
    if (this.active === entry) this.active = null;
    if (error) entry.reject(error);
    else if (response) entry.resolve(response);
    else entry.reject(new Error('worker job finished without a result'));
  }

  private clearTimers(entry: QueueEntry): void {
    if (entry.watchdogTimer) clearTimeout(entry.watchdogTimer);
    if (entry.cancelTimer) clearTimeout(entry.cancelTimer);
    entry.watchdogTimer = undefined;
    entry.cancelTimer = undefined;
  }

  private removeAbortListener(entry: QueueEntry): void {
    if (entry.signal && entry.abortListener) {
      entry.signal.removeEventListener('abort', entry.abortListener);
      entry.abortListener = undefined;
    }
  }
}
