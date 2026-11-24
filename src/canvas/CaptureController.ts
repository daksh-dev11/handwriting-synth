import { LIMITS } from '@engine';
import type { CaptureGuides, PathCmd, PointerKind, RawStrokePoint } from '@engine';
import { toPath2D } from './inkRenderer';
import { browserCanvasRuntime, toCss } from './viewport';
import type { CanvasRuntime } from './viewport';

export interface CaptureCallbacks {
  onStrokeEnd(points: RawStrokePoint[]): void;
  onDrawingChange(drawing: boolean): void;
  onLimit(kind: 'stroke-points' | 'strokes' | 'sample-points'): void;
}

type CaptureRuntime = Pick<
  CanvasRuntime,
  'now' | 'requestFrame' | 'cancelFrame' | 'devicePixelRatio'
>;

const PEN_HOVER_TIMEOUT_MS = 1000;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pointerKind(value: string): PointerKind | null {
  if (value === 'mouse' || value === 'pen' || value === 'touch') return value;
  return null;
}

function rgbCss(rgb: [number, number, number]): string {
  return `rgb(${rgb.map((component) => Math.round(component * 255)).join(' ')})`;
}

export class CaptureController {
  private readonly rawCanvas: HTMLCanvasElement;
  private readonly ribbonCanvas: HTMLCanvasElement;
  private readonly callbacks: CaptureCallbacks;
  private readonly runtime: CaptureRuntime;
  private readonly draft: RawStrokePoint[][] = [];
  private readonly pending: RawStrokePoint[] = [];
  private guides: CaptureGuides | null = null;
  private penWidthPx = 16;
  private activeId: number | null = null;
  private activeType: PointerKind | null = null;
  private penActive = false;
  private lastPenAt = Number.NEGATIVE_INFINITY;
  private strokeRect: DOMRect | null = null;
  private cur: RawStrokePoint[] = [];
  private strokeCount = 0;
  private samplePoints = 0;
  private frame = 0;
  private destroyed = false;

  constructor(
    rawCanvas: HTMLCanvasElement,
    ribbonCanvas: HTMLCanvasElement,
    callbacks: CaptureCallbacks,
    runtime: CaptureRuntime = browserCanvasRuntime,
  ) {
    this.rawCanvas = rawCanvas;
    this.ribbonCanvas = ribbonCanvas;
    this.callbacks = callbacks;
    this.runtime = runtime;
    rawCanvas.style.touchAction = 'none';
    rawCanvas.addEventListener('pointerenter', this.onPointerEnter);
    rawCanvas.addEventListener('pointerdown', this.onPointerDown);
    rawCanvas.addEventListener('pointermove', this.onPointerMove);
    rawCanvas.addEventListener('pointerup', this.onPointerUp);
    rawCanvas.addEventListener('pointercancel', this.onPointerCancel);
    rawCanvas.addEventListener('lostpointercapture', this.onLostPointerCapture);
  }

  setGuides(guides: CaptureGuides, penWidthPx: number): void {
    this.guides = guides;
    this.penWidthPx = penWidthPx;
    this.redrawRaw();
  }

  setDraft(
    strokes: RawStrokePoint[][],
    ribbon: PathCmd[] | null,
    inkRgb: [number, number, number],
  ): void {
    this.draft.splice(0, this.draft.length, ...strokes);
    this.strokeCount = strokes.length;
    this.samplePoints = strokes.reduce((total, stroke) => total + stroke.length, 0);
    this.redrawRaw();

    const context = this.ribbonCanvas.getContext('2d');
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
    context.clearRect(0, 0, this.ribbonCanvas.width, this.ribbonCanvas.height);
    if (ribbon) {
      context.fillStyle = rgbCss(inkRgb);
      context.fill(toPath2D(ribbon), 'nonzero');
    }

    this.setLayerVisibility(ribbon !== null && this.activeId === null);
  }

  abortActive(): void {
    if (this.activeId === null) return;
    this.discardActive(true);
    this.callbacks.onDrawingChange(false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abortActive();
    this.rawCanvas.removeEventListener('pointerenter', this.onPointerEnter);
    this.rawCanvas.removeEventListener('pointerdown', this.onPointerDown);
    this.rawCanvas.removeEventListener('pointermove', this.onPointerMove);
    this.rawCanvas.removeEventListener('pointerup', this.onPointerUp);
    this.rawCanvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.rawCanvas.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    if (this.frame) this.runtime.cancelFrame(this.frame);
    this.frame = 0;
  }

  private readonly onPointerEnter = (event: PointerEvent): void => {
    if (event.pointerType === 'pen') this.lastPenAt = this.runtime.now();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.destroyed) return;
    const kind = pointerKind(event.pointerType);
    if (!kind || (kind === 'mouse' && event.button !== 0)) return;
    if (kind === 'pen' && (event.button === 5 || (event.buttons & 32) !== 0)) return;
    if (kind === 'touch' && (this.penActive || this.runtime.now() - this.lastPenAt < PEN_HOVER_TIMEOUT_MS)) {
      event.preventDefault();
      return;
    }

    if (kind === 'pen' && this.activeId !== null && this.activeType === 'touch') {
      this.discardActive(true);
      this.callbacks.onDrawingChange(false);
    } else if (this.activeId !== null) {
      return;
    }

    if (this.samplePoints >= LIMITS.MAX_RAW_POINTS_PER_SAMPLE) {
      this.callbacks.onLimit('sample-points');
      return;
    }
    if (this.strokeCount >= LIMITS.MAX_RAW_STROKES_PER_SAMPLE) {
      this.callbacks.onLimit('strokes');
      return;
    }

    event.preventDefault();
    if (kind === 'pen') this.penActive = true;
    const rect = this.rawCanvas.getBoundingClientRect();
    this.strokeRect = rect;
    this.activeId = event.pointerId;
    this.activeType = kind;
    this.cur = [];
    this.pending.length = 0;
    this.rawCanvas.setPointerCapture(event.pointerId);
    this.setLayerVisibility(false);
    this.redrawRaw();
    this.pushPoint(event, rect);
    this.callbacks.onDrawingChange(true);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'pen') this.lastPenAt = this.runtime.now();
    if (this.activeId !== event.pointerId) return;
    const rect = this.strokeRect;
    if (!rect) return;
    const coalesced = event.getCoalescedEvents?.() ?? [];
    for (const point of coalesced.length > 0 ? coalesced : [event]) {
      this.pushPoint(point, rect);
      if (this.activeId === null) return;
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.activeId !== event.pointerId) return;
    const rect = this.strokeRect;
    if (!rect) return;
    this.pushPoint(event, rect);
    if (this.activeId !== null) this.finishActive(true, false);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.activeId === event.pointerId) this.finishActive(this.cur.length >= 2, true);
  };

  private readonly onLostPointerCapture = (event: PointerEvent): void => {
    if (this.activeId === event.pointerId) this.finishActive(this.cur.length >= 2, true);
  };

  private pushPoint(event: PointerEvent, rect: DOMRect): void {
    const position = toCss(event, rect);
    const css = { x: round2(position.x), y: round2(position.y) };
    const previous = this.cur[this.cur.length - 1];
    if (previous && previous.x === css.x && previous.y === css.y) return;

    if (this.cur.length >= LIMITS.MAX_RAW_POINTS_PER_STROKE) {
      this.finishActive(true, true);
      this.callbacks.onLimit('stroke-points');
      return;
    }
    if (this.samplePoints + this.cur.length >= LIMITS.MAX_RAW_POINTS_PER_SAMPLE) {
      this.finishActive(true, true);
      this.callbacks.onLimit('sample-points');
      return;
    }

    const kind = pointerKind(event.pointerType) ?? this.activeType ?? 'mouse';
    const point: RawStrokePoint = {
      x: css.x,
      y: css.y,
      pressure: event.pressure,
      tiltX: event.tiltX || 0,
      tiltY: event.tiltY || 0,
      t: round2(event.timeStamp),
      pointerType: kind,
      dpr: this.runtime.devicePixelRatio(),
    };
    this.cur.push(point);
    this.pending.push(point);
    if (!this.frame) this.frame = this.runtime.requestFrame(this.flushPending);
  }

  private readonly flushPending = (): void => {
    this.frame = 0;
    if (this.pending.length === 0) return;
    const context = this.rawCanvas.getContext('2d');
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');

    context.lineWidth = this.penWidthPx;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(28,25,23,.55)';
    context.fillStyle = 'rgba(28,25,23,.55)';
    const firstIndex = this.cur.length - this.pending.length;
    let previous = firstIndex > 0 ? this.cur[firstIndex - 1] ?? null : null;
    for (const point of this.pending) {
      if (previous) {
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(point.x, point.y);
        context.stroke();
      } else {
        context.beginPath();
        context.arc(point.x, point.y, this.penWidthPx / 2, 0, 2 * Math.PI);
        context.fill();
      }
      previous = point;
    }
    this.pending.length = 0;
  };

  private finishActive(commit: boolean, release: boolean): void {
    if (this.activeId === null) return;
    const id = this.activeId;
    const kind = this.activeType;
    if (this.frame) this.runtime.cancelFrame(this.frame);
    this.frame = 0;
    if (commit) {
      this.flushPending();
      this.strokeCount += 1;
      this.samplePoints += this.cur.length;
    } else {
      this.pending.length = 0;
      this.redrawRaw();
    }
    const points = this.cur;
    this.cur = [];
    this.activeId = null;
    this.activeType = null;
    this.strokeRect = null;
    if (kind === 'pen') this.penActive = false;
    if (release && this.rawCanvas.hasPointerCapture(id)) this.rawCanvas.releasePointerCapture(id);
    if (commit) this.callbacks.onStrokeEnd(points);
    this.callbacks.onDrawingChange(false);
  }

  private discardActive(release: boolean): void {
    if (this.activeId === null) return;
    const id = this.activeId;
    const kind = this.activeType;
    if (this.frame) this.runtime.cancelFrame(this.frame);
    this.frame = 0;
    this.pending.length = 0;
    this.cur = [];
    this.activeId = null;
    this.activeType = null;
    this.strokeRect = null;
    if (kind === 'pen') this.penActive = false;
    this.redrawRaw();
    if (release && this.rawCanvas.hasPointerCapture(id)) this.rawCanvas.releasePointerCapture(id);
  }

  private redrawRaw(): void {
    const context = this.rawCanvas.getContext('2d');
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
    context.clearRect(0, 0, this.rawCanvas.width, this.rawCanvas.height);
    if (this.guides) {
      const { ascenderY, xHeightY, baselineY, descenderY } = this.guides;
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(28,25,23,.10)';
      this.strokeHorizontal(context, ascenderY);
      this.strokeHorizontal(context, descenderY);
      context.strokeStyle = 'rgba(28,25,23,.14)';
      context.setLineDash([4, 4]);
      this.strokeHorizontal(context, xHeightY);
      context.setLineDash([]);
      context.strokeStyle = 'rgba(28,25,23,.22)';
      this.strokeHorizontal(context, baselineY);
    }
    context.lineWidth = this.penWidthPx;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(28,25,23,.55)';
    for (const stroke of this.draft) this.drawStroke(context, stroke);
  }

  private strokeHorizontal(context: CanvasRenderingContext2D, y: number): void {
    context.beginPath();
    context.moveTo(0, y);
    const width = this.rawCanvas.clientWidth || Number.parseFloat(this.rawCanvas.style.width) || this.rawCanvas.width;
    context.lineTo(width, y);
    context.stroke();
  }

  private drawStroke(context: CanvasRenderingContext2D, stroke: RawStrokePoint[]): void {
    const first = stroke[0];
    if (!first) return;
    if (stroke.length === 1) {
      context.beginPath();
      context.arc(first.x, first.y, this.penWidthPx / 2, 0, 2 * Math.PI);
      context.fillStyle = 'rgba(28,25,23,.55)';
      context.fill();
      return;
    }
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let index = 1; index < stroke.length; index++) {
      const point = stroke[index];
      if (point) context.lineTo(point.x, point.y);
    }
    context.stroke();
  }

  private setLayerVisibility(showRibbon: boolean): void {
    this.rawCanvas.style.opacity = showRibbon ? '0' : '1';
    this.ribbonCanvas.style.opacity = showRibbon ? '1' : '0';
    this.rawCanvas.style.transition = 'opacity var(--dur) var(--ease)';
    this.ribbonCanvas.style.transition = 'opacity var(--dur) var(--ease)';
  }
}
