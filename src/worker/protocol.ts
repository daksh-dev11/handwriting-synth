import type {
  GlyphPack,
  RawGlyphSample,
  TemplateId,
  ValidationIssue,
  VarianceConfig,
} from '@engine';

export type JobId = string;

export interface GeneratePdfParams {
  packRevision: number;
  text: string;
  variance: VarianceConfig;
  template: TemplateId;
  xHeightPt: number;
  inkRgb: [number, number, number];
  maxPages: number;
  documentDateIso: string;
}

export type WorkerRequest =
  | { type: 'build-pack'; jobId: JobId; revision: number; samples: RawGlyphSample[]; nowIso: string }
  | { type: 'load-pack'; jobId: JobId; revision: number; pack: GlyphPack }
  | { type: 'generate-pdf'; jobId: JobId; params: GeneratePdfParams }
  | { type: 'import-json'; jobId: JobId; text: string }
  | {
      type: 'export-json';
      jobId: JobId;
      pack: GlyphPack;
      rawSamples: RawGlyphSample[] | null;
      exportedAtIso: string;
    }
  | { type: 'cancel'; jobId: JobId };

export type Phase = 'validate' | 'normalize' | 'layout' | 'emit' | 'finalize';

export interface ProgressInfo {
  phase: Phase;
  fraction: number;
  pagesDone: number;
  pagesTotal: number;
  glyphsDone: number;
  glyphsTotal: number;
  xobjectsBuilt: number;
  bytesEstimate: number;
}

export interface PdfStats {
  pages: number;
  glyphsPlaced: number;
  xobjects: number;
  ligatures: number;
  bytes: number;
  durationMs: number;
  truncated: boolean;
  missingChars: number[];
}

export type PdfWarning =
  | { code: 'TRUNCATED'; message: string }
  | { code: 'MISSING_GLYPHS'; message: string }
  | { code: 'SIZE_OVER_BUDGET'; message: string };

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'PACK_NOT_LOADED'
  | 'REVISION_MISMATCH'
  | 'LIMIT_EXCEEDED'
  | 'EMPTY_TEXT'
  | 'NO_GLYPHS'
  | 'BUSY'
  | 'UNSUPPORTED_REQUEST'
  | 'INTERNAL';

export type ImportOutcome =
  | { ok: true; pack: GlyphPack; rawSamples: RawGlyphSample[] | null }
  | { ok: false; issues: ValidationIssue[] };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; jobId: JobId; info: ProgressInfo }
  | { type: 'pack-ready'; jobId: JobId; revision: number; pack: GlyphPack }
  | { type: 'pdf-done'; jobId: JobId; buffer: ArrayBuffer; stats: PdfStats; warnings: PdfWarning[] }
  | { type: 'import-result'; jobId: JobId; ok: true; pack: GlyphPack; rawSamples: RawGlyphSample[] | null }
  | { type: 'import-result'; jobId: JobId; ok: false; issues: ValidationIssue[] }
  | { type: 'export-result'; jobId: JobId; ok: true; json: string }
  | { type: 'export-result'; jobId: JobId; ok: false; issues: ValidationIssue[] }
  | { type: 'cancelled'; jobId: JobId }
  | { type: 'error'; jobId: JobId; code: ErrorCode; message: string };

export interface JobOpts {
  signal?: AbortSignal;
  onProgress?: (progress: ProgressInfo) => void;
}
