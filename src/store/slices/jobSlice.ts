import type { StateCreator } from 'zustand';
import { sanitizeSettings, sanitizeVariance } from '@engine';
import { WorkerJobError } from '@worker/client';
import type { ErrorCode, PdfStats, PdfWarning, ProgressInfo } from '@worker/protocol';
import { downloadBlob } from '../download';
import type { AppState } from '../useAppStore';

export type JobPhase = 'idle' | 'validate' | 'layout' | 'emit' | 'finalize' | 'done' | 'cancelled' | 'failed';
type StoreErrorCode = ErrorCode | 'STALLED';

export interface JobSlice {
  phase: JobPhase;
  progress: ProgressInfo | null;
  result: { blob: Blob; stats: PdfStats; warnings: PdfWarning[] } | null;
  warnings: PdfWarning[];
  error: { code: StoreErrorCode; message: string } | null;
  abort: AbortController | null;
  startExport(): Promise<void>;
  cancelExport(): void;
  dismissJob(): void;
}

function isExportable(state: AppState): boolean {
  return Boolean(
    state.pack
    && Object.keys(state.pack.glyphs).length >= 1
    && state.text.trim() !== ''
    && ['idle', 'done', 'cancelled', 'failed'].includes(state.phase),
  );
}

export const createJobSlice: StateCreator<AppState, [], [], JobSlice> = (set, get) => ({
  phase: 'idle',
  progress: null,
  result: null,
  warnings: [],
  error: null,
  abort: null,
  startExport: async () => {
    get().dismissJob();
    const state = get();
    if (!isExportable(state)) return;
    if (!state.client || !state.pack) {
      state.pushToast({ text: 'Your hand is not ready to export.' });
      return;
    }

    const abort = new AbortController();
    const settings = sanitizeSettings({
      variance: sanitizeVariance(state.variance),
      template: state.template,
      xHeightPt: state.xHeightPt,
      inkRgb: state.inkRgb,
      maxPages: state.maxPages,
      draft: state.text,
    });
    set({
      phase: 'validate',
      progress: null,
      result: null,
      warnings: [],
      error: null,
      abort,
    });
    try {
      const params = {
        text: settings.draft,
        variance: settings.variance,
        template: settings.template,
        xHeightPt: settings.xHeightPt,
        inkRgb: settings.inkRgb,
        maxPages: settings.maxPages,
        documentDateIso: new Date().toISOString(),
      };
      const opts = {
        signal: abort.signal,
        onProgress: (progress: ProgressInfo) => {
          const phase = progress.phase === 'normalize' ? 'validate' : progress.phase;
          set({ phase, progress });
        },
      };
      let result: Awaited<ReturnType<typeof state.client.generatePdf>>;
      try {
        result = await state.client.generatePdf(params, opts);
      } catch (error) {
        if (!shouldRetry(error) || abort.signal.aborted) throw error;
        await state.client.loadPack(state.pack, state.revision, { signal: abort.signal });
        result = await state.client.generatePdf(params, opts);
      }
      set({
        phase: 'done',
        result,
        warnings: result.warnings,
        progress: null,
        abort: null,
      });
      downloadBlob(result.blob, 'handwriting.pdf');
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      set({
        phase: aborted ? 'cancelled' : 'failed',
        abort: null,
        progress: null,
        result: null,
        warnings: [],
        error: aborted
          ? null
          : {
            code: getErrorCode(error),
            message: error instanceof Error ? error.message : 'PDF generation failed',
          },
      });
    }
  },
  cancelExport: () => get().abort?.abort(),
  dismissJob: () => {
    get().abort?.abort();
    set({
      phase: 'idle',
      progress: null,
      result: null,
      warnings: [],
      error: null,
      abort: null,
    });
  },
});

function getErrorCode(error: unknown): StoreErrorCode {
  const code = error instanceof WorkerJobError ? error.code : error instanceof Error ? error.message : '';
  switch (code) {
    case 'VALIDATION_FAILED':
    case 'PACK_NOT_LOADED':
    case 'REVISION_MISMATCH':
    case 'LIMIT_EXCEEDED':
    case 'EMPTY_TEXT':
    case 'NO_GLYPHS':
    case 'BUSY':
    case 'UNSUPPORTED_REQUEST':
    case 'STALLED':
      return code;
    default:
      if (code === 'worker stalled') return 'STALLED';
      return 'INTERNAL';
  }
}

function shouldRetry(error: unknown): boolean {
  if (!(error instanceof WorkerJobError)) return false;
  return error.code === 'PACK_NOT_LOADED'
    || error.code === 'REVISION_MISMATCH'
    || error.code === 'BUSY';
}
