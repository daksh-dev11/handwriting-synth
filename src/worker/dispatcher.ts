import { validateGlyphPack } from '@engine';
import type { GlyphPack, ValidationIssue } from '@engine';
import { CancelledError, makeCheckpoint } from './checkpoint';
import type { CheckpointCtx } from './checkpoint';
import type { ProgressInfo, WorkerRequest, WorkerResponse } from './protocol';
import { buildPackJob } from './jobs/buildPackJob';
import { exportJob } from './jobs/exportJob';
import { generatePdfJob } from './jobs/generatePdfJob';
import { importJob } from './jobs/importJob';
import { JobFailure } from './jobs/jobTypes';

type Post = (message: WorkerResponse, transfer?: Transferable[]) => void;
type Dispatcher = (request: WorkerRequest) => void;

interface LoadedPack {
  pack: GlyphPack;
  revision: number;
}

function issueMessage(issues: readonly ValidationIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
}

export function createDispatcher(
  post: Post,
  now: () => number = () => performance.now(),
  yieldFn?: () => Promise<void>,
): Dispatcher {
  const cancelled = new Set<string>();
  let runningJobId: string | null = null;
  let loaded: LoadedPack | null = null;

  const respond = (message: WorkerResponse, transfer?: Transferable[]): void => post(message, transfer);

  return (request): void => {
    if (request.type === 'cancel') {
      if (runningJobId === request.jobId) cancelled.add(request.jobId);
      return;
    }
    if (runningJobId !== null) {
      respond({
        type: 'error',
        jobId: request.jobId,
        code: 'BUSY',
        message: 'another job is already running',
      });
      return;
    }

    runningJobId = request.jobId;
    cancelled.delete(request.jobId);
    let lastFraction = 0;
    const jobPost: Post = (message, transfer) => {
      if (message.type === 'progress') {
        const info: ProgressInfo = {
          ...message.info,
          fraction: Math.max(lastFraction, Math.min(1, message.info.fraction)),
        };
        lastFraction = info.fraction;
        respond({ ...message, info }, transfer);
        return;
      }
      respond(message, transfer);
    };
    const checkpointCtx: CheckpointCtx = {
      jobId: request.jobId,
      post: jobPost,
      cancelled,
      now,
    };
    const checkpoint = makeCheckpoint(checkpointCtx, 12, 100, yieldFn);
    const ctx = { jobId: request.jobId, post: jobPost, checkpoint, now };

    void (async (): Promise<void> => {
      try {
        switch (request.type) {
          case 'build-pack': {
            const result = await buildPackJob(request.samples, request.nowIso, request.revision, ctx);
            loaded = { pack: result.pack, revision: result.revision };
            respond({
              type: 'pack-ready',
              jobId: request.jobId,
              revision: result.revision,
              pack: result.pack,
            });
            break;
          }
          case 'load-pack': {
            const result = validateGlyphPack(request.pack);
            if (!result.ok) throw new JobFailure('VALIDATION_FAILED', issueMessage(result.issues));
            loaded = { pack: result.value, revision: request.revision };
            respond({
              type: 'pack-ready',
              jobId: request.jobId,
              revision: request.revision,
              pack: result.value,
            });
            break;
          }
          case 'generate-pdf': {
            const result = await generatePdfJob(
              loaded?.pack ?? null,
              loaded?.revision ?? null,
              request.params,
              ctx,
            );
            const backing = result.bytes.buffer;
            let buffer: ArrayBuffer;
            if (
              backing instanceof ArrayBuffer &&
              result.bytes.byteOffset === 0 &&
              result.bytes.byteLength === backing.byteLength
            ) {
              buffer = backing;
            } else {
              buffer = new ArrayBuffer(result.bytes.byteLength);
              new Uint8Array(buffer).set(result.bytes);
            }
            respond({
              type: 'pdf-done',
              jobId: request.jobId,
              buffer,
              stats: result.stats,
              warnings: result.warnings,
            }, [buffer]);
            break;
          }
          case 'import-json': {
            const result = await importJob(request.text, ctx);
            respond({ type: 'import-result', jobId: request.jobId, ...result });
            break;
          }
          case 'export-json': {
            await checkpoint(() => ({
              phase: 'validate',
              fraction: 0.1,
              pagesDone: 0,
              pagesTotal: 0,
              glyphsDone: 0,
              glyphsTotal: 0,
              xobjectsBuilt: 0,
              bytesEstimate: 0,
            }));
            const result = exportJob(request.pack, request.rawSamples, request.exportedAtIso);
            respond({ type: 'export-result', jobId: request.jobId, ...result });
            break;
          }
        }
      } catch (error) {
        if (error instanceof CancelledError) {
          respond({ type: 'cancelled', jobId: request.jobId });
        } else if (error instanceof JobFailure) {
          respond({ type: 'error', jobId: request.jobId, code: error.code, message: error.message });
        } else {
          const message = error instanceof Error ? error.message : 'unexpected worker failure';
          respond({ type: 'error', jobId: request.jobId, code: 'INTERNAL', message });
        }
      } finally {
        cancelled.delete(request.jobId);
        runningJobId = null;
      }
    })();
  };
}
