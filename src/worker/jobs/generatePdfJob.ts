import {
  InstanceCache,
  LIMITS,
  TEMPLATE_SPECS,
  layoutTextSteps,
  pageMetrics,
  sanitizeVariance,
} from '@engine';
import type {
  GlyphPack,
  LayoutResult,
  TemplateId,
  VarianceConfig,
} from '@engine';
import type { GeneratePdfParams } from '../protocol';
import { PdfBuilder } from '../../pdf/pdfBuilder';
import type { PdfStats, PdfWarning, ProgressInfo } from '../protocol';
import type { JobContext } from './jobTypes';
import { JobFailure } from './jobTypes';

export interface GeneratePdfResult {
  bytes: Uint8Array;
  stats: PdfStats;
  warnings: PdfWarning[];
}

function isTemplate(value: unknown): value is TemplateId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TEMPLATE_SPECS, value);
}

function validInkRgb(value: unknown): value is [number, number, number] {
  return Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) =>
      typeof component === 'number' && Number.isFinite(component) && component >= 0 && component <= 1,
    );
}

function progress(
  phase: ProgressInfo['phase'],
  fraction: number,
  layout: LayoutResult | null,
  pagesDone: number,
  pagesTotal: number,
  xobjectsBuilt: number,
  bytesEstimate: number,
  glyphsDone = layout?.placements.length ?? 0,
  glyphsTotal = layout?.placements.length ?? 0,
): ProgressInfo {
  return {
    phase,
    fraction,
    pagesDone,
    pagesTotal,
    glyphsDone,
    glyphsTotal,
    xobjectsBuilt,
    bytesEstimate,
  };
}

export async function generatePdfJob(
  pack: GlyphPack | null,
  packRevision: number | null,
  params: Omit<GeneratePdfParams, 'packRevision'> & { packRevision?: number },
  ctx: JobContext,
): Promise<GeneratePdfResult> {
  const startedAt = ctx.now();
  if (!pack) throw new JobFailure('PACK_NOT_LOADED', 'no glyph pack is loaded');
  if (params.packRevision !== packRevision) {
    throw new JobFailure('REVISION_MISMATCH', 'requested pack revision is not loaded');
  }
  if (typeof params.text !== 'string' || params.text.trim().length === 0) {
    throw new JobFailure('EMPTY_TEXT', 'text is empty');
  }
  if (params.text.length > LIMITS.MAX_TEXT_CHARS) {
    throw new JobFailure('LIMIT_EXCEEDED', 'text exceeds the size limit');
  }
  if (!Number.isInteger(params.maxPages) || params.maxPages < 1 || params.maxPages > LIMITS.MAX_PAGES) {
    throw new JobFailure('LIMIT_EXCEEDED', 'maxPages is outside the supported range');
  }
  if (!isTemplate(params.template)) {
    throw new JobFailure('VALIDATION_FAILED', 'template is invalid');
  }
  if (!validInkRgb(params.inkRgb)) {
    throw new JobFailure('VALIDATION_FAILED', 'inkRgb must contain three values in [0, 1]');
  }
  if (typeof params.documentDateIso !== 'string' || !Number.isFinite(new Date(params.documentDateIso).getTime())) {
    throw new JobFailure('VALIDATION_FAILED', 'documentDateIso is invalid');
  }

  const variance: VarianceConfig = sanitizeVariance(params.variance);
  const metrics = pageMetrics(params.template, params.xHeightPt);
  const templateSpec = TEMPLATE_SPECS[params.template];
  const cache = new InstanceCache(pack, variance);
  let layout: LayoutResult | null = null;
  const iterator = layoutTextSteps(
    params.text,
    pack,
    variance,
    {
      lineWidthEm: metrics.lineWidthEm,
      linesPerPage: templateSpec.linesPerPage,
      maxPages: params.maxPages,
    },
    cache,
  );
  let step = iterator.next();
  for (; !step.done; step = iterator.next()) {
    const consumed = step.value.consumedChars;
    await ctx.checkpoint(() => progress(
      'layout',
      0.1 + 0.25 * consumed / params.text.length,
      layout,
      0,
      0,
      0,
      0,
      consumed,
      params.text.length,
    ));
  }
  layout = step.value;
  if (layout.placements.length === 0) {
    throw new JobFailure('NO_GLYPHS', 'text contains no printable glyphs');
  }

  const builder = await PdfBuilder.create(
    { documentDateIso: params.documentDateIso, template: params.template, inkRgb: params.inkRgb },
    pack,
    variance,
  );
  const pagesTotal = layout.pageCount;
  const warnings: PdfWarning[] = [];
  let placementsDone = 0;
  let ligatures = 0;
  let bytesEstimate = 0;
  let previousRegistryBytes = 0;
  for (let pageIndex = 0; pageIndex < pagesTotal; pageIndex++) {
    await ctx.checkpoint(() => progress(
      'emit',
      0.35 + 0.6 * pageIndex / pagesTotal,
      layout,
      pageIndex,
      pagesTotal,
      builder.registry.size,
      bytesEstimate,
    ), true);
    const ops = ['q', `${builder.inkRgbOps(params.inkRgb)} /Tpl Do`];
    for (const placement of layout.placements) {
      if (Math.floor(placement.line / templateSpec.linesPerPage) !== pageIndex) continue;
      ops.push(builder.placementOps(placement, params.template, metrics.xHeightPt));
      const ligature = builder.ligatureOps(
        placement,
        pack,
        variance,
        params.template,
        metrics.xHeightPt,
      );
      if (ligature !== null) {
        ops.push(ligature);
        ligatures += 1;
      }
      placementsDone += 1;
      if (placementsDone % 400 === 0) {
        await ctx.checkpoint(() => progress(
          'emit',
          0.35 + 0.6 * placementsDone / layout!.placements.length,
          layout,
          pageIndex,
          pagesTotal,
          builder.registry.size,
          bytesEstimate,
        ));
      }
    }
    ops.push('Q');
    bytesEstimate += builder.addPageContent(ops.join('\n'));
    bytesEstimate += builder.registry.bytes - previousRegistryBytes;
    previousRegistryBytes = builder.registry.bytes;
  }

  await ctx.checkpoint(() => progress(
    'finalize',
    0.99,
    layout,
    pagesTotal,
    pagesTotal,
    builder.registry.size,
    bytesEstimate,
  ), true);
  const bytes = await builder.save();
  if (bytes.length > LIMITS.PDF_BUDGET_BYTES) {
    warnings.push({ code: 'SIZE_OVER_BUDGET', message: 'PDF exceeds the configured size budget' });
  }
  if (layout.truncated) warnings.push({ code: 'TRUNCATED', message: 'Text was truncated at the page limit' });
  if (layout.missingChars.length > 0) {
    warnings.push({ code: 'MISSING_GLYPHS', message: 'Some characters are not present in the glyph pack' });
  }

  const completed = progress(
    'finalize',
    1,
    layout,
    pagesTotal,
    pagesTotal,
    builder.registry.size,
    bytes.length,
  );
  ctx.post({ type: 'progress', jobId: ctx.jobId, info: completed });
  return {
    bytes,
    warnings,
    stats: {
      pages: pagesTotal,
      glyphsPlaced: layout.placements.length,
      xobjects: builder.registry.size,
      ligatures,
      bytes: bytes.length,
      durationMs: Math.max(0, ctx.now() - startedAt),
      truncated: layout.truncated,
      missingChars: layout.missingChars.slice(0, 200),
    },
  };
}
