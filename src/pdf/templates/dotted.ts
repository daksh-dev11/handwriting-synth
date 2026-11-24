import { BACKDROP, K, PAGE } from '@engine';
import type { TemplateSpec } from '@engine';
import { fmt } from '../num';
import { hex2rg } from './shared';

export function dotted(_spec: TemplateSpec): string {
  void _spec;
  const pitch = BACKDROP.gridPitchPt;
  const radius = BACKDROP.dotRadiusPt;
  const c = K.KAPPA * radius;
  const ops = ['q', `${hex2rg(BACKDROP.dotRgb)} rg`];
  for (let i = 1; i < Math.floor(PAGE.widthPt / pitch); i++) {
    const cx = i * pitch;
    for (let j = 1; j < Math.floor(PAGE.heightPt / pitch); j++) {
      const cy = PAGE.heightPt - j * pitch;
      ops.push(
        `${fmt(cx + radius, 2)} ${fmt(cy, 2)} m ` +
        `${fmt(cx + radius, 2)} ${fmt(cy + c, 2)} ${fmt(cx + c, 2)} ${fmt(cy + radius, 2)} ${fmt(cx, 2)} ${fmt(cy + radius, 2)} c ` +
        `${fmt(cx - c, 2)} ${fmt(cy + radius, 2)} ${fmt(cx - radius, 2)} ${fmt(cy + c, 2)} ${fmt(cx - radius, 2)} ${fmt(cy, 2)} c ` +
        `${fmt(cx - radius, 2)} ${fmt(cy - c, 2)} ${fmt(cx - c, 2)} ${fmt(cy - radius, 2)} ${fmt(cx, 2)} ${fmt(cy - radius, 2)} c ` +
        `${fmt(cx + c, 2)} ${fmt(cy - radius, 2)} ${fmt(cx + radius, 2)} ${fmt(cy - c, 2)} ${fmt(cx + radius, 2)} ${fmt(cy, 2)} c f`,
      );
    }
  }
  ops.push('Q');
  return ops.join('\n');
}
