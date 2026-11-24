import { buildPackJob } from './buildPackJob';
import { parsePackFile } from '@engine';
import type { ImportOutcome } from '../protocol';
import type { JobContext } from './jobTypes';

export async function importJob(text: string, ctx: JobContext): Promise<ImportOutcome> {
  const parsed = parsePackFile(text);
  if (!parsed.ok) return { ok: false, issues: parsed.issues };

  if (parsed.value.rawSamples !== null) {
    const rebuilt = await buildPackJob(
      parsed.value.rawSamples,
      parsed.value.pack.createdAt,
      0,
      ctx,
    );
    return { ok: true, pack: rebuilt.pack, rawSamples: parsed.value.rawSamples };
  }

  return { ok: true, pack: parsed.value.pack, rawSamples: null };
}
