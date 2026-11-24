import { DEFAULT_VARIANCE } from '@engine';
import type { WorkerResponse } from '../../src/worker/protocol';
import { createDispatcher } from '../../src/worker/dispatcher';
import { describe, expect, it } from 'vitest';
import { SAMPLE_PACK, SAMPLE_RAW_SAMPLES } from '../fixtures/samplePack';

const DATE = '2026-01-01T00:00:00.000Z';

type TerminalResponse = Exclude<WorkerResponse, { type: 'ready' | 'progress' }>;

function isTerminal(response: WorkerResponse): response is TerminalResponse {
  return response.type !== 'ready' && response.type !== 'progress';
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('worker dispatcher', () => {
  it('sends progress before exactly one PDF terminal response', async () => {
    const messages: WorkerResponse[] = [];
    const dispatch = createDispatcher((message) => messages.push(message), () => 0, () => Promise.resolve());
    dispatch({ type: 'load-pack', jobId: 'load-1', revision: 3, pack: SAMPLE_PACK });
    await flushMicrotasks();
    messages.length = 0;

    dispatch({
      type: 'generate-pdf',
      jobId: 'pdf-2',
      params: {
        packRevision: 3,
        text: 'llll',
        variance: DEFAULT_VARIANCE,
        template: 'ruled',
        xHeightPt: 10,
        inkRgb: [0, 0, 0],
        maxPages: 1,
        documentDateIso: DATE,
      },
    });
    await flushMicrotasks();

    const jobMessages = messages.filter((message) => message.type !== 'ready');
    expect(jobMessages.some((message) => message.type === 'progress')).toBe(true);
    expect(jobMessages.filter(isTerminal)).toHaveLength(1);
    expect(jobMessages[jobMessages.length - 1]?.type).toBe('pdf-done');
  });

  it('returns BUSY for a second simultaneous job', async () => {
    const messages: WorkerResponse[] = [];
    let time = 0;
    const dispatch = createDispatcher((message) => messages.push(message), () => (time += 20), () => Promise.resolve());
    dispatch({
      type: 'export-json',
      jobId: 'first',
      pack: SAMPLE_PACK,
      rawSamples: null,
      exportedAtIso: DATE,
    });
    dispatch({ type: 'load-pack', jobId: 'second', revision: 2, pack: SAMPLE_PACK });
    await flushMicrotasks();

    expect(messages.find((message) => message.type === 'error' && message.jobId === 'second')).toMatchObject({
      type: 'error',
      code: 'BUSY',
    });
    expect(messages.filter((message) => isTerminal(message) && message.jobId === 'second')).toHaveLength(1);
  });

  it('cancels during yielded layout and never posts pdf-done', async () => {
    const messages: WorkerResponse[] = [];
    let time = 0;
    const dispatch = createDispatcher(
      (message) => messages.push(message),
      () => (time += 20),
      () => Promise.resolve(),
    );
    dispatch({ type: 'load-pack', jobId: 'load', revision: 7, pack: SAMPLE_PACK });
    await flushMicrotasks();
    messages.length = 0;

    dispatch({
      type: 'generate-pdf',
      jobId: 'cancel-me',
      params: {
        packRevision: 7,
        text: 'l'.repeat(2_000),
        variance: DEFAULT_VARIANCE,
        template: 'ruled',
        xHeightPt: 10,
        inkRgb: [0.1, 0.2, 0.3],
        maxPages: 10,
        documentDateIso: DATE,
      },
    });
    dispatch({ type: 'cancel', jobId: 'cancel-me' });
    await flushMicrotasks();

    expect(messages.some((message) => message.type === 'cancelled' && message.jobId === 'cancel-me')).toBe(true);
    expect(messages.some((message) => message.type === 'pdf-done' && message.jobId === 'cancel-me')).toBe(false);
    expect(messages.filter((message) => isTerminal(message) && message.jobId === 'cancel-me')).toHaveLength(1);
  });

  it('validates a built pack before reporting it ready', async () => {
    const messages: WorkerResponse[] = [];
    const dispatch = createDispatcher((message) => messages.push(message), () => 0, () => Promise.resolve());
    dispatch({
      type: 'build-pack',
      jobId: 'build',
      revision: 9,
      samples: SAMPLE_RAW_SAMPLES,
      nowIso: DATE,
    });
    await flushMicrotasks();

    expect(messages.some((message) => message.type === 'pack-ready' && message.revision === 9)).toBe(true);
  });
});
