import { describe, expect, it } from 'vitest';
import type { CaptureGuides, RawStrokePoint } from '@engine';
import { CaptureController } from '../../src/canvas/CaptureController';

type PointerLike = {
  pointerId: number;
  pointerType: string;
  button: number;
  buttons: number;
  clientX: number;
  clientY: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  timeStamp: number;
  preventDefault(): void;
  getCoalescedEvents?(): PointerEvent[];
};

function fakeContext(): CanvasRenderingContext2D {
  const context = {
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    arc() {},
    clearRect() {},
    setTransform() {},
    setLineDash() {},
    save() {},
    restore() {},
  };
  return context as unknown as CanvasRenderingContext2D;
}

class FakeCanvas {
  style: Record<string, string> = {};
  width = 640;
  height = 480;
  rectReads = 0;
  readonly captured = new Set<number>();
  readonly listeners = new Map<string, EventListenerOrEventListenerObject[]>();
  readonly context = fakeContext();

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
    this.rectReads += 1;
    return { left: 10, top: 20, width: 640, height: 480 } as DOMRect;
  }

  setPointerCapture(pointerId: number): void {
    this.captured.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.captured.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.captured.delete(pointerId);
  }

  emit(type: string, point: PointerLike): void {
    const event = point as unknown as Event;
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
    }
  }
}

function pointer(overrides: Partial<PointerLike> = {}): PointerLike {
  return {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    clientX: 15,
    clientY: 25,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    timeStamp: 10,
    preventDefault() {},
    ...overrides,
  };
}

function makePoint(index: number): RawStrokePoint {
  return {
    x: index,
    y: index,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    t: index,
    pointerType: 'mouse',
    dpr: 1,
  };
}

function setup() {
  let now = 100;
  let frameId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const raw = new FakeCanvas();
  const ribbon = new FakeCanvas();
  const strokes: RawStrokePoint[][] = [];
  const drawing: boolean[] = [];
  const limits: string[] = [];
  const controller = new CaptureController(
    raw as unknown as HTMLCanvasElement,
    ribbon as unknown as HTMLCanvasElement,
    {
      onStrokeEnd: (points) => strokes.push(points),
      onDrawingChange: (value) => drawing.push(value),
      onLimit: (kind) => limits.push(kind),
    },
    {
      now: () => now,
      requestFrame: (callback) => {
        frameId += 1;
        frames.set(frameId, callback);
        return frameId;
      },
      cancelFrame: (id) => frames.delete(id),
      devicePixelRatio: () => 1,
    },
  );
  return {
    controller,
    raw,
    ribbon,
    strokes,
    drawing,
    limits,
    setNow(value: number) {
      now = value;
    },
  };
}

describe('CaptureController', () => {
  it('expands coalesced events in CSS pixels and rounds captured values', () => {
    const { controller, raw, strokes } = setup();
    raw.emit('pointerdown', pointer({ clientX: 15.126, clientY: 25.124, timeStamp: 10.126 }));
    raw.emit('pointermove', pointer({
      clientX: 50,
      clientY: 60,
      getCoalescedEvents: () => [
        pointer({ clientX: 18.345, clientY: 28.345, timeStamp: 12.345 }) as unknown as PointerEvent,
        pointer({ clientX: 20.678, clientY: 30.678, timeStamp: 13.678 }) as unknown as PointerEvent,
      ],
    }));
    raw.emit('pointerup', pointer({ clientX: 20.678, clientY: 30.678, timeStamp: 13.678 }));

    expect(strokes).toHaveLength(1);
    expect(strokes[0]?.map(({ x, y, t }) => [x, y, t])).toEqual([
      [5.13, 5.12, 10.13],
      [8.34, 8.34, 12.35],
      [10.68, 10.68, 13.68],
    ]);
    expect(raw.rectReads).toBe(1);
    controller.destroy();
  });

  it('rejects touch near a pen, then lets the pen replace an active touch stroke', () => {
    const { controller, raw, strokes, drawing, setNow } = setup();
    let prevented = false;
    raw.emit('pointerenter', pointer({ pointerType: 'pen' }));
    raw.emit('pointerdown', pointer({
      pointerType: 'touch',
      preventDefault: () => { prevented = true; },
    }));
    expect(prevented).toBe(true);
    expect(drawing).toEqual([]);

    setNow(1200);
    raw.emit('pointerdown', pointer({ pointerId: 2, pointerType: 'touch' }));
    raw.emit('pointerdown', pointer({ pointerId: 3, pointerType: 'pen' }));
    raw.emit('pointerup', pointer({ pointerId: 3, pointerType: 'pen', clientX: 16, clientY: 26 }));

    expect(strokes).toHaveLength(1);
    expect(strokes[0]?.every((point) => point.pointerType === 'pen')).toBe(true);
    expect(drawing).toEqual([true, false, true, false]);
    expect(raw.captured.has(2)).toBe(false);
    raw.emit('pointermove', pointer({ pointerId: 99, pointerType: 'pen' }));
    let movePrevented = false;
    raw.emit('pointerdown', pointer({
      pointerId: 4,
      pointerType: 'touch',
      preventDefault: () => { movePrevented = true; },
    }));
    expect(movePrevented).toBe(true);
    expect(drawing).toEqual([true, false, true, false]);
    controller.destroy();
  });

  it('ignores pen erasers and rejects additional strokes after the 16-stroke cap', () => {
    const { controller, raw, limits } = setup();
    const draft = Array.from({ length: 16 }, () => [makePoint(1)]);
    controller.setDraft(draft, null, [0, 0, 0]);
    raw.emit('pointerdown', pointer({ pointerType: 'pen', button: 5, buttons: 32 }));
    expect(limits).toEqual([]);

    raw.emit('pointerdown', pointer());
    expect(limits).toEqual(['strokes']);
    controller.destroy();
  });

  it('enforces the 4,000-point stroke cap and the 20,000-point sample cap', () => {
    const first = setup();
    first.raw.emit('pointerdown', pointer());
    const points = Array.from({ length: 3999 }, (_, index) =>
      pointer({ clientX: 16 + index, clientY: 25, timeStamp: 20 + index }) as unknown as PointerEvent);
    first.raw.emit('pointermove', pointer({ getCoalescedEvents: () => points }));
    first.raw.emit('pointermove', pointer({ clientX: 5000, clientY: 25, timeStamp: 5000 }));
    expect(first.strokes[0]).toHaveLength(4000);
    expect(first.limits).toEqual(['stroke-points']);
    first.controller.destroy();

    const second = setup();
    second.controller.setDraft([[...Array.from({ length: 19998 }, (_, index) => makePoint(index))]], null, [0, 0, 0]);
    second.raw.emit('pointerdown', pointer());
    second.raw.emit('pointermove', pointer({ clientX: 16, clientY: 25, timeStamp: 20 }));
    second.raw.emit('pointermove', pointer({ clientX: 17, clientY: 25, timeStamp: 21 }));
    expect(second.strokes[0]).toHaveLength(2);
    expect(second.limits).toEqual(['sample-points']);
    second.controller.destroy();

    const third = setup();
    third.controller.setDraft([[...Array.from({ length: 20000 }, (_, index) => makePoint(index))]], null, [0, 0, 0]);
    third.raw.emit('pointerdown', pointer());
    expect(third.limits).toEqual(['sample-points']);
    third.controller.destroy();
  });

  it('uses the captured guide values while drawing and stops on every terminal path', () => {
    const { controller, raw, drawing } = setup();
    const guides: CaptureGuides = {
      ascenderY: 100,
      xHeightY: 220,
      baselineY: 340,
      descenderY: 420,
    };
    controller.setGuides(guides, 16);
    raw.emit('pointerdown', pointer());
    raw.emit('pointercancel', pointer());
    expect(drawing).toEqual([true, false]);
    raw.emit('pointerdown', pointer());
    raw.emit('pointermove', pointer({ clientX: 16, clientY: 26 }));
    raw.emit('pointercancel', pointer());
    expect(drawing).toEqual([true, false, true, false]);
    controller.destroy();
  });
});
