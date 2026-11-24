import { BACKDROP, PAGE } from '@engine';
import type { TemplateSpec } from '@engine';
import { fmt } from '../num';
import { hex2rg } from './shared';

export function ruled(spec: TemplateSpec): string {
  const ops = ['q', `${hex2rg(BACKDROP.ruleRgb)} RG`, `${fmt(BACKDROP.ruleWidthPt, 2)} w`];
  for (let i = 0; i < spec.linesPerPage; i++) {
    const y = PAGE.heightPt - (spec.firstBaselineFromTopPt + i * spec.linePitchPt);
    ops.push(`${fmt(BACKDROP.ruleX0Pt, 2)} ${fmt(y, 2)} m ${fmt(BACKDROP.ruleX1Pt, 2)} ${fmt(y, 2)} l S`);
  }
  ops.push(
    `${hex2rg(BACKDROP.marginRgb)} RG`,
    `${fmt(BACKDROP.marginWidthPt, 2)} w`,
    `${fmt(BACKDROP.marginXPt, 2)} 0 m ${fmt(BACKDROP.marginXPt, 2)} ${fmt(PAGE.heightPt, 2)} l S`,
    'Q',
  );
  return ops.join('\n');
}
