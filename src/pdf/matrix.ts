import { EM, PAGE, TEMPLATE_SPECS } from '@engine';
import type { Placement, TemplateId } from '@engine';
import { fmt } from './num';

export type PlacementMatrix = readonly [number, number, number, number, number, number];

export function placementMatrix(
  placement: Placement,
  template: TemplateId,
  xHeightPt: number,
): PlacementMatrix {
  const spec = TEMPLATE_SPECS[template];
  const scale = xHeightPt / EM.xHeight;
  const cos = Math.cos(placement.thetaRad);
  const sin = Math.sin(placement.thetaRad);
  const baselineFromTop = spec.firstBaselineFromTopPt + placement.line * spec.linePitchPt;
  return [
    scale * cos,
    -scale * sin,
    -scale * sin,
    -scale * cos,
    spec.textLeftPt + scale * (
      placement.originX + placement.pivX - cos * placement.pivX + sin * EM.baselineY
    ),
    PAGE.heightPt - baselineFromTop - scale * (
      placement.dy - sin * placement.pivX - cos * EM.baselineY
    ),
  ];
}

export function matrixToOps(matrix: PlacementMatrix): string {
  return `${fmt(matrix[0], 4)} ${fmt(matrix[1], 4)} ${fmt(matrix[2], 4)} ` +
    `${fmt(matrix[3], 4)} ${fmt(matrix[4], 2)} ${fmt(matrix[5], 2)} cm`;
}
