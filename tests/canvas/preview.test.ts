import { afterEach, describe, expect, it, vi } from 'vitest';
import { EM, DEFAULT_VARIANCE, PAGE, TEMPLATE_SPECS, placementToLine } from '@engine';
import type { Placement } from '@engine';
import { Path2DMemo } from '../../src/canvas/inkRenderer';
import { placementTransform, PreviewController } from '../../src/canvas/PreviewController';
import type { CanvasRuntime } from '../../src/canvas/viewport';
import { SAMPLE_PACK } from '../fixtures/samplePack';

class FakePath2D {
  readonly commands: string[] = [];

  moveTo(): void {
    this.commands.push('M');
  }

  bezierCurveTo(): void {
    this.commands.push('C');
  }

  closePath(): void {
    this.commands.push('Z');
  }
}

function fakeContext(): CanvasRenderingContext2D {
  const context = {
    fillStyle: '',
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    arc() {},
    clearRect() {},
    fillRect() {},
    setTransform() {},
    setLineDash() {},
    drawImage() {},
    save() {},
    restore() {},
  };
  return context as unknown as CanvasRenderingContext2D;
}

class FakeCanvas {
  style: Record<string, string> = {};
  width = 0;
  height = 0;
  readonly context = fakeContext();

  getContext(): CanvasRenderingContext2D {
    return this.context;
  }
}

function makeRuntime() {
  let now = 0;
  let frameId = 0;
  let timerId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, { callback: () => void; due: number }>();
  const runtime: CanvasRuntime = {
    now: () => now,
    requestFrame: (callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    },
    cancelFrame: (id) => frames.delete(id),
    devicePixelRatio: () => 1,
    setTimer: (callback, delay) => {
      timerId += 1;
      timers.set(timerId, { callback, due: now + delay });
      return timerId;
    },
    clearTimer: (id) => timers.delete(id),
    createCanvas: () => new FakeCanvas() as unknown as HTMLCanvasElement,
  };
  return {
    runtime,
    frames,
    advanceTime(ms: number) {
      now += ms;
      const ready = [...timers.entries()].filter(([, timer]) => timer.due <= now);
      for (const [id, timer] of ready) {
        timers.delete(id);
        timer.callback();
      }
    },
    runFrame() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(now);
    },
    pendingTimers: () => timers.size,
  };
}

function input(text: string, onResult: (result: { placements: Placement[] }) => void) {
  return {
    pack: SAMPLE_PACK,
    text,
    cfg: { ...DEFAULT_VARIANCE },
    template: 'ruled' as const,
    xHeightPt: 10,
    inkRgb: [0.1, 0.2, 0.3] as [number, number, number],
    onResult,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PreviewController', () => {
  it('coalesces updates to the latest layout in one frame', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    const scheduler = makeRuntime();
    const backdrop = new FakeCanvas();
    const ink = new FakeCanvas();
    const results: number[] = [];
    const controller = new PreviewController(
      backdrop as unknown as HTMLCanvasElement,
      ink as unknown as HTMLCanvasElement,
      () => undefined,
      scheduler.runtime,
    );
    controller.setSheetWidth(595);
    controller.update(input('e', (result) => results.push(result.placements.length)), 'immediate');
    controller.update(input('eeee', (result) => results.push(result.placements.length)), 'immediate');

    expect(scheduler.frames.size).toBe(1);
    scheduler.runFrame();
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(4);
    controller.destroy();
  });

  it('debounces text updates for 120 ms', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    const scheduler = makeRuntime();
    const results: number[] = [];
    const controller = new PreviewController(
      new FakeCanvas() as unknown as HTMLCanvasElement,
      new FakeCanvas() as unknown as HTMLCanvasElement,
      () => undefined,
      scheduler.runtime,
    );
    controller.setSheetWidth(595);
    controller.update(input('e', (result) => results.push(result.placements.length)), 'text');
    scheduler.advanceTime(119);
    expect(scheduler.frames.size).toBe(0);
    scheduler.advanceTime(1);
    expect(scheduler.frames.size).toBe(1);
    scheduler.runFrame();
    expect(results).toEqual([1]);
    controller.destroy();
  });

  it('retains non-ink-keyed paths while invalidating a different ink key', () => {
    vi.stubGlobal('Path2D', FakePath2D);
    const memo = new Path2DMemo();
    const make = () => [{ op: 'M' as const, x: 0, y: 0 }];
    const expected = memo.get('g|0|1|5000', make);
    const unkeyed = memo.get('retained', make);
    memo.get('g|0|1|6000', make);
    memo.retainInk(5000);
    expect(memo.get('g|0|1|5000', make)).toBe(expected);
    expect(memo.get('retained', make)).toBe(unkeyed);
    expect(memo.get('g|0|1|6000', make)).not.toBe(expected);
  });

  it('maps the pivot baseline to the scaled placementToLine result', () => {
    const placement: Placement = {
      k: 7,
      line: 3,
      glyphId: 'l#0',
      composite: 1,
      bucket: 2,
      originX: 713.25,
      dy: -13.5,
      thetaRad: 0.127,
      pivX: 84.25,
      ligatureFromPrev: null,
    };
    const scale = 9.5 / EM.xHeight;
    const ratio = 420 / PAGE.widthPt;
    const spec = TEMPLATE_SPECS.ruled;
    const baseline = spec.firstBaselineFromTopPt + placement.line * spec.linePitchPt;
    const matrix = placementTransform(placement, scale, ratio, baseline, spec.textLeftPt);
    const local = { x: placement.pivX, y: EM.baselineY };
    const line = placementToLine(placement, local.x, local.y);
    expect(matrix.a * local.x + matrix.c * local.y + matrix.e).toBeCloseTo(
      ratio * (spec.textLeftPt + scale * line.x),
      10,
    );
    expect(matrix.b * local.x + matrix.d * local.y + matrix.f).toBeCloseTo(
      ratio * (baseline + scale * line.y),
      10,
    );
  });

  it('clears pending timers and frame callbacks on destroy', () => {
    const scheduler = makeRuntime();
    const controller = new PreviewController(
      new FakeCanvas() as unknown as HTMLCanvasElement,
      new FakeCanvas() as unknown as HTMLCanvasElement,
      () => undefined,
      scheduler.runtime,
    );
    controller.setSheetWidth(595);
    controller.update(input('e', () => undefined), 'text');
    expect(scheduler.pendingTimers()).toBe(1);
    controller.destroy();
    expect(scheduler.pendingTimers()).toBe(0);
    expect(scheduler.frames.size).toBe(0);
  });
});
