import type { Checkpoint } from '../checkpoint';
import type { WorkerResponse } from '../protocol';

export interface JobContext {
  jobId: string;
  post: (message: WorkerResponse, transfer?: Transferable[]) => void;
  checkpoint: Checkpoint;
  now: () => number;
}

export class JobFailure extends Error {
  constructor(
    readonly code: 'VALIDATION_FAILED' | 'PACK_NOT_LOADED' | 'REVISION_MISMATCH' |
      'LIMIT_EXCEEDED' | 'EMPTY_TEXT' | 'NO_GLYPHS' | 'INTERNAL',
    message: string,
  ) {
    super(message);
    this.name = 'JobFailure';
  }
}
