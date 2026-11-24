import { PAGE, TEMPLATE_SPECS } from '@engine';
import type { TemplateId, TemplateSpec } from '@engine';
import { PDFNumber } from 'pdf-lib';
import type { PDFContext, PDFRef } from 'pdf-lib';
import { cornell } from './cornell';
import { dotted } from './dotted';
import { grid } from './grid';
import { ruled } from './ruled';

export const EMITTERS: Record<TemplateId, (spec: TemplateSpec) => string> = {
  ruled,
  grid,
  dotted,
  cornell,
};

export function buildTemplateXObject(ctx: PDFContext, id: TemplateId): PDFRef {
  const stream = ctx.flateStream(EMITTERS[id](TEMPLATE_SPECS[id]), {
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(PAGE.widthPt), PDFNumber.of(PAGE.heightPt)],
    Resources: ctx.obj({}),
  });
  return ctx.register(stream);
}
