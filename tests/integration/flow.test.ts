import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RawStrokePoint } from '@engine';
import { CaptureController } from '../../src/canvas/CaptureController';
import { createDispatcher } from '../../src/worker/dispatcher';
import { WorkerClient } from '../../src/worker/client';
import type { WorkerRequest, WorkerResponse } from '../../src/worker/protocol';
import { createAppStore } from '../../src/store/useAppStore';
import type { Db } from '../../src/store/db';

vi.mock('../../src/store/download', () => ({ downloadBlob: vi.fn() }));

class DispatchWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  private readonly dispatch: (request: WorkerRequest) => void;

  constructor() {
    this.dispatch = createDispatcher(
      (message) => this.onmessage?.(new MessageEvent<WorkerResponse>('message', { data: message })),
      () => 0,
      async () => undefined,
    );
  }

  postMessage(message: WorkerRequest): void {
    queueMicrotask(() => this.dispatch(message));
  }

  terminate(): void {}

  asWorker(): Worker {
    return this as unknown as Worker;
  }
}

class CanvasStub {
  readonly style: Record<string, string> = {};
  readonly width = 640;
  readonly height = 480;
  readonly listeners = new Map<string, EventListenerOrEventListenerObject[]>();
  readonly captures = new Set<number>();
  readonly context = {
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    arc() {},
    clearRect() {},
    setTransform() {},
    setLineDash() {},
  } as unknown as CanvasRenderingContext2D;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener) return;
    const entries = this.listeners.get(type) ?? [];
    entries.push(listener);
    this.listeners.set(type, entries);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    const entries = this.listeners.get(type);
    if (entries && listener) this.listeners.set(type, entries.filter((entry) => entry !== listener));
  }

  getContext(): CanvasRenderingContext2D {
    return this.context;
  }

  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 640, height: 480 } as DOMRect;
  }

  setPointerCapture(id: number): void {
    this.captures.add(id);
  }

  hasPointerCapture(id: number): boolean {
    return this.captures.has(id);
  }

  releasePointerCapture(id: number): void {
    this.captures.delete(id);
  }

  emit(type: string, point: Partial<PointerEvent> = {}): void {
    const event = {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 100,
      clientY: 340,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      timeStamp: 10,
      preventDefault() {},
      ...point,
    } as PointerEvent;
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
    }
  }
}

function memoryDb(): Db {
  return { idb: null, mem: { raw: new Map(), pack: new Map(), meta: new Map() }, onClose: null };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('capture to worker flow', () => {
  it('captures, commits, builds a pack, and exports through the worker client', async () => {
    const store = createAppStore();
    const client = new WorkerClient(() => new DispatchWorker().asWorker());
    store.getState().setDb(memoryDb());
    store.getState().setClient(client);
    store.getState().setText('a');

    const raw = new CanvasStub();
    const ribbon = new CanvasStub();
    const captured: RawStrokePoint[][] = [];
    const capture = new CaptureController(
      raw as unknown as HTMLCanvasElement,
      ribbon as unknown as HTMLCanvasElement,
      {
        onStrokeEnd: (points) => {
          captured.push(points);
          store.getState().pushStroke(points);
        },
        onDrawingChange: (drawing) => store.getState().onDrawingChange(drawing),
        onLimit: () => store.getState().pushToast({ text: 'Capture limit reached.' }),
      },
      {
        now: () => 100,
        requestFrame: () => 1,
        cancelFrame: () => undefined,
        devicePixelRatio: () => 1,
      },
    );

    store.getState().setCaptureAbort(() => capture.abortActive());
    raw.emit('pointerdown', { clientX: 100, clientY: 340, timeStamp: 10 });
    raw.emit('pointermove', { clientX: 120, clientY: 280, timeStamp: 20 });
    raw.emit('pointerup', { clientX: 140, clientY: 220, timeStamp: 30 });
    expect(captured).toHaveLength(1);

    await store.getState().commitDraft();
    expect(store.getState().rawByKey['a#0']).toBeDefined();
    await store.getState().rebuildNow();
    expect(store.getState().packStatus).toBe('ready');
    expect(store.getState().pack?.glyphs.a).toHaveLength(1);

    await store.getState().startExport();
    expect(store.getState().phase).toBe('done');
    expect(store.getState().result?.blob.type).toBe('application/pdf');
    expect(store.getState().result?.stats.bytes).toBeGreaterThan(0);

    capture.destroy();
    client.dispose();
  });
});
