export interface CanvasRuntime {
  now(): number;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
  devicePixelRatio(): number;
  setTimer(callback: () => void, delay: number): number;
  clearTimer(id: number): void;
  createCanvas(): HTMLCanvasElement;
}

export const browserCanvasRuntime: CanvasRuntime = {
  now: () => performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
  devicePixelRatio: () => window.devicePixelRatio || 1,
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (id) => window.clearTimeout(id),
  createCanvas: () => document.createElement('canvas'),
};

export function fitCanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  maxDpr = 3,
  devicePixelRatio = window.devicePixelRatio || 1,
): CanvasRenderingContext2D {
  const dpr = Math.min(devicePixelRatio, maxDpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return context;
}

export function toCss(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  rect: Pick<DOMRect, 'left' | 'top'>,
): { x: number; y: number } {
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
