import { EM, InstanceCache, PAGE, TEMPLATE_SPECS } from '@engine';
import type { TemplateId, VarianceConfig, GlyphPack, Placement } from '@engine';
import {
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFRef,
} from 'pdf-lib';
import type { PDFContext } from 'pdf-lib';
import { fmt } from './num';
import { matrixToOps, placementMatrix } from './matrix';
import { pathToOps } from './pathOps';
import { buildTemplateXObject } from './templates';
import { XObjectRegistry } from './xobjectRegistry';
import { ligatureOutline } from '@engine';

export interface PdfBuilderOptions {
  documentDateIso: string;
  template: TemplateId;
  inkRgb: readonly [number, number, number];
}

export class PdfBuilder {
  readonly document: PDFDocument;
  readonly context: PDFContext;
  readonly registry: XObjectRegistry;
  readonly xobjects: PDFDict;
  readonly resourcesRef: PDFRef;
  readonly templateRef: PDFRef;

  private constructor(
    document: PDFDocument,
    options: PdfBuilderOptions,
    pack: GlyphPack,
    variance: VarianceConfig,
  ) {
    this.document = document;
    this.context = document.context;

    this.xobjects = PDFDict.withContext(this.context);
    this.templateRef = buildTemplateXObject(this.context, options.template);
    this.xobjects.set(PDFName.of('Tpl'), this.templateRef);

    const resources = PDFDict.withContext(this.context);
    resources.set(PDFName.of('XObject'), this.context.register(this.xobjects));
    this.resourcesRef = this.context.register(resources);
    this.registry = new XObjectRegistry(
      this.context,
      this.xobjects,
      new InstanceCache(pack, variance),
    );
    const date = new Date(options.documentDateIso);
    this.document.setProducer('Handwriting Synthesis');
    this.document.setCreator('Handwriting Synthesis');
    this.document.setCreationDate(date);
    this.document.setModificationDate(date);
  }

  static async create(
    options: PdfBuilderOptions,
    pack: GlyphPack,
    variance: VarianceConfig,
  ): Promise<PdfBuilder> {
    const document = await PDFDocument.create({ updateMetadata: false });
    return new PdfBuilder(document, options, pack, variance);
  }

  addPage(content: string): number {
    const page = this.document.addPage([PAGE.widthPt, PAGE.heightPt]);
    page.node.set(PDFName.of('Resources'), this.resourcesRef);
    const stream = this.context.flateStream(content);
    page.node.addContentStream(this.context.register(stream));
    page.node.set(PDFName.of('Resources'), this.resourcesRef);
    return stream.getContentsSize();
  }

  placementOps(
    placement: Placement,
    template: TemplateId,
    xHeightPt: number,
  ): string {
    const xobject = this.registry.get(placement);
    return `q ${matrixToOps(placementMatrix(placement, template, xHeightPt))} /${xobject.name} Do Q`;
  }

  ligatureOps(
    placement: Placement,
    pack: GlyphPack,
    variance: VarianceConfig,
    template: TemplateId,
    xHeightPt: number,
  ): string | null {
    const ligature = placement.ligatureFromPrev;
    if (!ligature) return null;
    const path = ligatureOutline(ligature, pack.style.strokeWeight, variance.inkPressure);
    const spec = TEMPLATE_SPECS[template];
    const scale = xHeightPt / EM.xHeight;
    const baselineFromTop = spec.firstBaselineFromTopPt + placement.line * spec.linePitchPt;
    const pagePath = path.map((command) => {
      if (command.op === 'Z') return command;
      if (command.op === 'M') {
        return {
          op: 'M' as const,
          x: spec.textLeftPt + scale * command.x,
          y: PAGE.heightPt - baselineFromTop - scale * command.y,
        };
      }
      return {
        op: 'C' as const,
        x1: spec.textLeftPt + scale * command.x1,
        y1: PAGE.heightPt - baselineFromTop - scale * command.y1,
        x2: spec.textLeftPt + scale * command.x2,
        y2: PAGE.heightPt - baselineFromTop - scale * command.y2,
        x: spec.textLeftPt + scale * command.x,
        y: PAGE.heightPt - baselineFromTop - scale * command.y,
      };
    });
    return `${pathToOps(pagePath, 2)} f`;
  }

  addPageContent(page: string): number {
    return this.addPage(page);
  }

  async save(): Promise<Uint8Array> {
    return this.document.save({ useObjectStreams: true, addDefaultPage: false });
  }

  inkRgbOps(rgb: readonly [number, number, number]): string {
    return `${fmt(rgb[0], 3)} ${fmt(rgb[1], 3)} ${fmt(rgb[2], 3)} rg`;
  }
}

