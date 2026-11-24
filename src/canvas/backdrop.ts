import { BACKDROP, PAGE, TEMPLATE_SPECS } from '@engine';
import type { TemplateId } from '@engine';

export function drawBackdrop(
  context: CanvasRenderingContext2D,
  template: TemplateId,
  sheetCssW: number,
): void {
  const ratio = sheetCssW / PAGE.widthPt;
  const cssHeight = PAGE.heightPt * ratio;
  context.clearRect(0, 0, sheetCssW, cssHeight);
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, sheetCssW, cssHeight);

  const spec = TEMPLATE_SPECS[template];
  if (template === 'ruled' || template === 'cornell') {
    context.beginPath();
    context.strokeStyle = BACKDROP.ruleRgb;
    context.lineWidth = BACKDROP.ruleWidthPt * ratio;
    for (let y = spec.firstBaselineFromTopPt; y < PAGE.heightPt; y += spec.linePitchPt) {
      context.moveTo(BACKDROP.ruleX0Pt * ratio, y * ratio);
      context.lineTo(BACKDROP.ruleX1Pt * ratio, y * ratio);
    }
    context.stroke();
    context.beginPath();
    context.strokeStyle = BACKDROP.marginRgb;
    context.lineWidth = BACKDROP.marginWidthPt * ratio;
    context.moveTo(BACKDROP.marginXPt * ratio, 0);
    context.lineTo(BACKDROP.marginXPt * ratio, cssHeight);
    context.stroke();
  } else if (template === 'grid') {
    context.beginPath();
    context.strokeStyle = BACKDROP.gridRgb;
    context.lineWidth = BACKDROP.gridWidthPt * ratio;
    for (let x = 0; x <= PAGE.widthPt; x += BACKDROP.gridPitchPt) {
      context.moveTo(x * ratio, 0);
      context.lineTo(x * ratio, cssHeight);
    }
    for (let y = 0; y <= PAGE.heightPt; y += BACKDROP.gridPitchPt) {
      context.moveTo(0, y * ratio);
      context.lineTo(sheetCssW, y * ratio);
    }
    context.stroke();
  } else {
    context.fillStyle = BACKDROP.dotRgb;
    for (let x = 0; x <= PAGE.widthPt; x += BACKDROP.gridPitchPt) {
      for (let y = 0; y <= PAGE.heightPt; y += BACKDROP.gridPitchPt) {
        context.beginPath();
        context.arc(x * ratio, y * ratio, BACKDROP.dotRadiusPt * ratio, 0, 2 * Math.PI);
        context.fill();
      }
    }
  }

  if (template === 'cornell') {
    context.beginPath();
    context.strokeStyle = BACKDROP.marginRgb;
    context.lineWidth = BACKDROP.marginWidthPt * ratio;
    context.moveTo(BACKDROP.cornellCueDividerXPt * ratio, BACKDROP.cornellTopPt * ratio);
    context.lineTo(BACKDROP.cornellCueDividerXPt * ratio, cssHeight);
    context.moveTo(BACKDROP.cornellCueDividerXPt * ratio, BACKDROP.cornellSummaryRuleYPt * ratio);
    context.lineTo(BACKDROP.ruleX1Pt * ratio, BACKDROP.cornellSummaryRuleYPt * ratio);
    context.stroke();
  }
}
