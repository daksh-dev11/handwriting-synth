import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { StateCreator } from 'zustand';
import type { CaptureKey } from '@engine';
import { REQUIRED_KEYS } from '@engine';
import { DEMO_CAPTURED_AT } from '../demo/constants';
import type { WorkerClient } from '@worker/client';
import type { Db } from './db';
import { createCaptureSlice, type CaptureSlice, type DemoLoader } from './slices/captureSlice';
import { createComposeSlice, type ComposeSlice } from './slices/composeSlice';
import { createJobSlice, type JobSlice } from './slices/jobSlice';
import { createPackSlice, type PackSlice } from './slices/packSlice';
import { createUiSlice, type UiSlice } from './slices/uiSlice';

export type WorkerApi = Pick<WorkerClient, 'buildPack' | 'loadPack' | 'generatePdf' | 'importJson' | 'exportJson'>;

export interface RuntimeSlice {
  db: Db | null;
  client: WorkerApi | null;
  demoLoader: DemoLoader;
  captureAbort: (() => void) | null;
  setDb(db: Db | null): void;
  setClient(client: WorkerApi | null): void;
  setDemoLoader(loader: DemoLoader): void;
  setCaptureAbort(abort: (() => void) | null): void;
}

export type AppState = CaptureSlice & PackSlice & ComposeSlice & JobSlice & UiSlice & RuntimeSlice;

export function createAppStore(): UseBoundStore<StoreApi<AppState>> {
  const runtimeSlice: StateCreator<AppState, [], [], RuntimeSlice> = (set) => ({
    db: null,
    client: null,
    demoLoader: async () => {
      throw new Error('Demo hand loader has not been registered');
    },
    captureAbort: null,
    setDb: (db) => set({ db }),
    setClient: (client) => set({ client }),
    setDemoLoader: (loader) => set({ demoLoader: loader }),
    setCaptureAbort: (captureAbort) => set({ captureAbort }),
  });

  return create<AppState>()((...args) => ({
    ...createCaptureSlice(...args),
    ...createPackSlice(...args),
    ...createComposeSlice(...args),
    ...createJobSlice(...args),
    ...createUiSlice(...args),
    ...runtimeSlice(...args),
  }));
}

export const useAppStore = createAppStore();

export function selectIsFirstVisit(state: AppState): boolean {
  return Object.keys(state.rawByKey).length === 0 && state.pack === null;
}

export function selectIsDemo(state: AppState): boolean {
  const samples = Object.values(state.rawByKey);
  return samples.length > 0 && samples.every((sample) => sample.capturedAt === DEMO_CAPTURED_AT);
}

export function selectCanExport(state: AppState): boolean {
  return Boolean(
    state.pack
    && Object.keys(state.pack.glyphs).length >= 1
    && state.text.trim() !== ''
    && ['idle', 'done', 'cancelled', 'failed'].includes(state.phase),
  );
}

export function selectRequiredDone(state: AppState): number {
  return REQUIRED_KEYS.filter((key: CaptureKey) => state.rawByKey[key.key]).length;
}
