import { buildGlyphPackSteps, validateGlyphPack } from '@engine';
import type { GlyphPack, RawGlyphSample, ValidationIssue } from '@engine';
import type { JobContext } from './jobTypes';
import { JobFailure } from './jobTypes';

export interface BuildPackResult {
  revision: number;
  pack: GlyphPack;
}

function packIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
}

export async function buildPackJob(
  samples: RawGlyphSample[],
  nowIso: string,
  revision: number,
  ctx: JobContext,
): Promise<BuildPackResult> {
  const iterator = buildGlyphPackSteps(samples, nowIso);
  let step = iterator.next();
  for (; !step.done; step = iterator.next()) {
    const progress = step.value;
    await ctx.checkpoint(() => ({
      phase: 'normalize',
      fraction: progress.total === 0 ? 1 : progress.done / progress.total,
      pagesDone: 0,
      pagesTotal: 0,
      glyphsDone: progress.done,
      glyphsTotal: progress.total,
      xobjectsBuilt: 0,
      bytesEstimate: 0,
    }));
  }

  const validated = validateGlyphPack(step.value);
  if (!validated.ok) throw new JobFailure('VALIDATION_FAILED', packIssues(validated.issues));
  return { revision, pack: validated.value };
}
