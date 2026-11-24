import { BACKDROP, PAGE } from '@engine';
import type { TemplateSpec } from '@engine';
import { fmt } from '../num';
import { hex2rg } from './shared';

export function grid(_spec: TemplateSpec): string {
  void _spec;
  const pitch = BACKDROP.gridPitchPt;
  const ops = ['q', `${hex2rg(BACKDROP.gridRgb)} RG`, `${fmt(BACKDROP.gridWidthPt, 2)} w`];
  for (let i = 1; i < Math.floor(PAGE.widthPt / pitch); i++) {
    const x = i * pitch;
    ops.push(`${fmt(x, 2)} 0 m ${fmt(x, 2)} ${fmt(PAGE.heightPt, 2)} l S`);
  }
  for (let j = 1; j < Math.floor(PAGE.heightPt / pitch); j++) {
    const y = PAGE.heightPt - j * pitch;
    ops.push(`0 ${fmt(y, 2)} m ${fmt(PAGE.widthPt, 2)} ${fmt(y, 2)} l S`);
  }
  ops.push('Q');
  return ops.join('\n');
}
