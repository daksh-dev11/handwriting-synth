import { EM } from '../constants';
import { clamp } from '../mathUtil';

export const PAGE = { widthPt: 595.276, heightPt: 841.89 } as const;

export type TemplateId = 'ruled' | 'grid' | 'dotted' | 'cornell';

export interface TemplateSpec {
  id: TemplateId;
  linePitchPt: number;
  textLeftPt: number;
  textRightPt: number;
  firstBaselineFromTopPt: number;
  linesPerPage: number;
}

export const TEMPLATE_SPECS: Record<TemplateId, TemplateSpec> = {
  ruled: { id: 'ruled', linePitchPt: 28.346, textLeftPt: 56.693, textRightPt: 552.756, firstBaselineFromTopPt: 113.385, linesPerPage: 24 },
  grid: { id: 'grid', linePitchPt: 28.346, textLeftPt: 56.693, textRightPt: 552.756, firstBaselineFromTopPt: 113.385, linesPerPage: 24 },
  dotted: { id: 'dotted', linePitchPt: 28.346, textLeftPt: 56.693, textRightPt: 552.756, firstBaselineFromTopPt: 113.385, linesPerPage: 24 },
  cornell: { id: 'cornell', linePitchPt: 28.346, textLeftPt: 240.945, textRightPt: 552.756, firstBaselineFromTopPt: 113.385, linesPerPage: 18 },
};

export const BACKDROP = {
  gridPitchPt: 14.173,
  cornellCueDividerXPt: 226.772,
  cornellSummaryRuleYPt: 640,
  ruleX0Pt: 28.346,
  ruleX1Pt: 566.929,
  marginXPt: 42.52,
  cornellTopPt: 70.866,
  ruleRgb: '#B8D0EB',
  marginRgb: '#E5A8A8',
  gridRgb: '#CCCCCC',
  dotRgb: '#BDBDBD',
  ruleWidthPt: 0.5,
  marginWidthPt: 0.75,
  gridWidthPt: 0.35,
  dotRadiusPt: 0.6,
} as const;

export interface PageMetrics {
  S: number;
  lineWidthEm: number;
  linePitchEm: number;
  xHeightPt: number;
}

export const X_HEIGHT_PT_MIN = 6;
export const X_HEIGHT_PT_MAX = 10.5;
export const X_HEIGHT_PT_DEFAULT = 10;

export function pageMetrics(template: TemplateId, xHeightPt: number): PageMetrics {
  const clamped = Number.isFinite(xHeightPt) ? clamp(xHeightPt, X_HEIGHT_PT_MIN, X_HEIGHT_PT_MAX) : X_HEIGHT_PT_DEFAULT;
  const S = clamped / EM.xHeight;
  const spec = TEMPLATE_SPECS[template] ?? TEMPLATE_SPECS.ruled;
  return {
    S,
    lineWidthEm: (spec.textRightPt - spec.textLeftPt) / S,
    linePitchEm: spec.linePitchPt / S,
    xHeightPt: clamped,
  };
}