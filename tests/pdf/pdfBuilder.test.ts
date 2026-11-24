import { DEFAULT_VARIANCE, LIMITS } from '@engine';
import type { Placement } from '@engine';
import { PDFDict, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { PdfBuilder } from '../../src/pdf/pdfBuilder';
import { SAMPLE_PACK } from '../fixtures/samplePack';
import { fmt } from '../../src/pdf/num';
import { generatePdfJob } from '../../src/worker/jobs/generatePdfJob';

const DATE = '2026-01-01T00:00:00.000Z';

function onePlacement(): Placement {
  const glyph = SAMPLE_PACK.glyphs.l[0];
  return {
    k: 0,
    line: 0,
    glyphId: 'l#0',
    composite: 0,
    bucket: 1,
    originX: 0,
    dy: 0,
    thetaRad: 0,
    pivX: (glyph.bbox.minX + glyph.bbox.maxX) / 2,
    ligatureFromPrev: null,
  };
}

describe('PDF object assembly', () => {
  it('reuses one XObject for repeated placement identities', async () => {
    const builder = await PdfBuilder.create(
      { documentDateIso: DATE, template: 'ruled', inkRgb: [0, 0, 0] },
      SAMPLE_PACK,
      DEFAULT_VARIANCE,
    );
    const placement = onePlacement();

    for (let i = 0; i < 100; i++) builder.registry.get(placement);

    expect(builder.registry.size).toBe(1);
    expect(builder.xobjects.keys()).toHaveLength(2);
    expect(builder.xobjects.has(PDFName.of('G1'))).toBe(true);
  });

  it('produces same-process byte-identical PDFs with fixed metadata', async () => {
    async function render(): Promise<Uint8Array> {
      const builder = await PdfBuilder.create(
        { documentDateIso: DATE, template: 'ruled', inkRgb: [0, 0, 0] },
        SAMPLE_PACK,
        DEFAULT_VARIANCE,
      );
      const placement = onePlacement();
      const content = [
        'q 0 0 0 rg /Tpl Do',
        builder.placementOps(placement, 'ruled', 10),
        'Q',
      ].join('\n');
      builder.addPageContent(content);
      return builder.save();
    }

    expect(await render()).toEqual(await render());
  });

  it('keeps the ten-page fixture under the configured PDF budget', async () => {
    const result = await generatePdfJob(
      SAMPLE_PACK,
      1,
      {
        packRevision: 1,
        text: 'l'.repeat(LIMITS.MAX_TEXT_CHARS),
        variance: DEFAULT_VARIANCE,
        template: 'ruled',
        xHeightPt: 10,
        inkRgb: [0, 0, 0],
        maxPages: LIMITS.MAX_PAGES,
        documentDateIso: DATE,
      },
      {
        jobId: 'budget',
        post: () => undefined,
        checkpoint: async () => undefined,
        now: () => 0,
      },
    );

    expect(result.stats.pages).toBe(LIMITS.MAX_PAGES);
    expect(result.bytes.byteLength).toBeLessThanOrEqual(LIMITS.PDF_BUDGET_BYTES);
  }, 30_000);

  it('formats finite coordinates and rejects non-finite values', () => {
    expect(fmt(0, 2)).toBe('0');
    expect(fmt(-0, 2)).toBe('0');
    expect(() => fmt(Number.NaN, 2)).toThrowError(new RangeError('NON_FINITE'));
    expect(() => fmt(Number.POSITIVE_INFINITY, 2)).toThrowError(new RangeError('NON_FINITE'));
  });

  it('keeps XObject resources indirect and shared across pages', async () => {
    const builder = await PdfBuilder.create(
      { documentDateIso: DATE, template: 'cornell', inkRgb: [0.1, 0.2, 0.3] },
      SAMPLE_PACK,
      DEFAULT_VARIANCE,
    );
    builder.addPageContent('q 0.1 0.2 0.3 rg /Tpl Do Q');
    builder.addPageContent('q 0.1 0.2 0.3 rg /Tpl Do Q');
    const resourceRef = builder.resourcesRef;
    const pages = builder.document.getPages();
    expect(pages).toHaveLength(2);
    expect(pages[0].node.get(PDFName.of('Resources'))).toEqual(resourceRef);
    expect(pages[1].node.get(PDFName.of('Resources'))).toEqual(resourceRef);
    expect(builder.context.lookup(resourceRef, PDFDict)).toBeTruthy();
  });
});
