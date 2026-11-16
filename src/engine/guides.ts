import type { CaptureGuides } from './types';

export function computeGuides(baselineY: number, xHeightPx: number): CaptureGuides {
  return {
    ascenderY: baselineY - 2 * xHeightPx,
    xHeightY: baselineY - xHeightPx,
    baselineY,
    descenderY: baselineY + (2 / 3) * xHeightPx,
  };
}