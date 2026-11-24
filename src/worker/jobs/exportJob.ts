import { serializePackFile } from '@engine';
import type { GlyphPack, RawGlyphSample, ValidationIssue } from '@engine';
import { JobFailure } from './jobTypes';

export type ExportOutcome =
  | { ok: true; json: string }
  | { ok: false; issues: ValidationIssue[] };

export function exportJob(
  pack: GlyphPack,
  rawSamples: RawGlyphSample[] | null,
  exportedAtIso: string,
): ExportOutcome {
  const result = serializePackFile({ pack, rawSamples }, exportedAtIso);
  if (!result.ok && result.issues.some((issue) => issue.code === 'FILE_TOO_LARGE')) {
    throw new JobFailure('LIMIT_EXCEEDED', 'serialized file exceeds the size cap');
  }
  return result.ok
    ? { ok: true, json: result.value }
    : { ok: false, issues: result.issues };
}
