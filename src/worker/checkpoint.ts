import type { ProgressInfo, WorkerResponse } from './protocol';

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

export interface CheckpointCtx {
  jobId: string;
  post: (message: WorkerResponse, transfer?: Transferable[]) => void;
  cancelled: Set<string>;
  now: () => number;
}

export type Checkpoint = (info?: () => ProgressInfo, force?: boolean) => Promise<void>;

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}

export function makeCheckpoint(
  ctx: CheckpointCtx,
  sliceMs = 12,
  progressEveryMs = 100,
  yieldFn: () => Promise<void> = yieldToEventLoop,
): Checkpoint {
  let sliceStart = ctx.now();
  let lastProgress = Number.NEGATIVE_INFINITY;
  return async (info, force = false): Promise<void> => {
    const time = ctx.now();
    if (info && (force || time - lastProgress >= progressEveryMs)) {
      ctx.post({ type: 'progress', jobId: ctx.jobId, info: info() });
      lastProgress = time;
    }
    if (force || time - sliceStart >= sliceMs) {
      await yieldFn();
      if (ctx.cancelled.has(ctx.jobId)) throw new CancelledError();
      sliceStart = ctx.now();
    }
  };
}
