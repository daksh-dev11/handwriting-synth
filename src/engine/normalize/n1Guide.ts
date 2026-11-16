import type { PointerKind, RawStrokePoint } from '../types';

export interface EmPoint {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  t: number;
  pointerType: PointerKind;
  dpr: number;
}

export function n1MapPoint(p: RawStrokePoint, s: number, guideBaselinePx: number): EmPoint {
  return {
    x: s * p.x,
    y: 700 + (p.y - guideBaselinePx) * s,
    pressure: p.pressure,
    tiltX: p.tiltX,
    tiltY: p.tiltY,
    t: p.t,
    pointerType: p.pointerType,
    dpr: p.dpr,
  };
}

export function n1MapStrokes(
  strokes: readonly RawStrokePoint[][],
  s: number,
  guideBaselinePx: number,
): EmPoint[][] {
  return strokes.map((stroke) => stroke.map((p) => n1MapPoint(p, s, guideBaselinePx)));
}