import { describe, expect, it } from 'vitest';
import { boot, disposeBoot } from '../../src/store/boot';
import { useAppStore } from '../../src/store/useAppStore';
import { WorkerClient } from '../../src/worker/client';

describe('app boot wiring', () => {
  it('boots with the dynamic demo loader registered and cleans up on dispose', async () => {
    const client = new WorkerClient(() => {
      throw new Error('Empty in-memory boot must not start a worker');
    });
    useAppStore.getState().setDemoLoader(() => import('../../src/demo/demoHand'));

    try {
      await boot(client);
      expect(useAppStore.getState().mode).toBe('write');
      const demo = await useAppStore.getState().demoLoader();
      expect(demo.buildDemoSamples()).toHaveLength(88);
    } finally {
      disposeBoot();
      client.dispose();
      useAppStore.getState().setClient(null);
    }
  });
});
