import { EM } from '../constants';
import type { Placement, Pt } from '../types';

export function rotatedLocal(anchor: Pt, thetaRad: number, pivX: number): Pt {
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  const dx = anchor.x - pivX;
  const dy = anchor.y - EM.baselineY;
  return { x: pivX + c * dx - s * dy, y: s * dx + c * dy };
}

export function placeAnchor(originX: number, dy: number, thetaRad: number, pivX: number, anchor: Pt): Pt {
  const local = rotatedLocal(anchor, thetaRad, pivX);
  return { x: originX + local.x, y: dy + local.y };
}

export function placementToLine(p: Placement, x: number, y: number): Pt {
  const c = Math.cos(p.thetaRad);
  const s = Math.sin(p.thetaRad);
  const dx = x - p.pivX;
  const dy = y - EM.baselineY;
  return { x: p.originX + p.pivX + c * dx - s * dy, y: p.dy + s * dx + c * dy };
}