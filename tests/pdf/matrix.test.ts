import { EM, PAGE, TEMPLATE_SPECS, placementToLine } from '@engine';
import type { Placement } from '@engine';
import { describe, expect, it } from 'vitest';
import { matrixToOps, placementMatrix } from '../../src/pdf/matrix';

describe('PDF placement matrix', () => {
  it('maps deterministic random local points to placementToLine for each template', () => {
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

    for (const template of Object.keys(TEMPLATE_SPECS) as Array<keyof typeof TEMPLATE_SPECS>) {
      const matrix = placementMatrix(placement, template, 9.5);
      const scale = 9.5 / EM.xHeight;
      const spec = TEMPLATE_SPECS[template];
      const baseline = spec.firstBaselineFromTopPt + placement.line * spec.linePitchPt;

      for (let i = 0; i < 80; i++) {
        const x = ((i * 193) % 4_001) - 200;
        const y = ((i * 317) % 3_001) - 1_000;
        const linePoint = placementToLine(placement, x, y);
        const pdfX = matrix[0] * x + matrix[2] * y + matrix[4];
        const pdfY = matrix[1] * x + matrix[3] * y + matrix[5];
        expect(pdfX).toBeCloseTo(spec.textLeftPt + scale * linePoint.x, 10);
        expect(pdfY).toBeCloseTo(PAGE.heightPt - baseline - scale * linePoint.y, 10);
      }
    }
  });

  it('serializes matrix coefficients at their specified precision', () => {
    expect(matrixToOps([1 / 3, 0, 0, -1 / 3, 56.6934, 728.355])).toBe(
      '0.3333 0 0 -0.3333 56.69 728.36 cm',
    );
  });
});
