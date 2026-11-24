import {
  validateGlyphPack,
  validateRawSample,
} from '@engine';
import type { GlyphPack, RawGlyphSample } from '@engine';
import type { StateCreator } from 'zustand';
import { debounce } from '../debounce';
import { REBUILD_MS } from '../timing';
import {
  computeFingerprint,
  createPackCacheRecord,
  replaceAll,
  savePackCache,
} from '../persistence';
import type { PackCacheRecord, SessionMeta } from '../persistence';
import type { AppState } from '../useAppStore';

export type PackStatus = 'none' | 'building' | 'ready' | 'stale' | 'error';

export interface PackSlice {
  pack: GlyphPack | null;
  packStatus: PackStatus;
  revision: number;
  fingerprint: string | null;
  importedNoRaw: boolean;
  setPackFromCache(pack: GlyphPack, fingerprint: string): void;
  scheduleRebuild(): void;
  rebuildNow(): Promise<void>;
  applyImported(pack: GlyphPack, raw: RawGlyphSample[] | null): Promise<void>;
}

function sortedValid(rawByKey: Record<string, RawGlyphSample>): RawGlyphSample[] {
  return Object.values(rawByKey).sort((a, b) => {
    if (a.char !== b.char) return a.char < b.char ? -1 : 1;
    return a.variantIndex - b.variantIndex;
  });
}

function sessionIndexAfter(raw: readonly RawGlyphSample[]): number {
  return raw.reduce((max, sample) => Math.max(max, sample.sessionIndex + 1), 0);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isPack(value: unknown): value is GlyphPack {
  return validateGlyphPack(value).ok;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure';
}

export const createPackSlice: StateCreator<AppState, [], [], PackSlice> = (set, get) => {
  let buildToken = 0;
  let buildAbort: AbortController | null = null;
  const delayedRebuild = debounce(() => {
    void get().rebuildNow();
  }, REBUILD_MS);

  const reportFailure = (): void => {
    set({ packStatus: 'error' });
    get().pushToast({
      text: "Couldn't rebuild your hand. Your drawings are safe.",
      actionLabel: 'Retry',
      onAction: () => { void get().rebuildNow(); },
    });
  };

  return {
    pack: null,
    packStatus: 'none',
    revision: 0,
    fingerprint: null,
    importedNoRaw: false,
    setPackFromCache: (pack, fingerprint) => set((state) => ({
      pack,
      revision: state.revision + 1,
      fingerprint,
      importedNoRaw: fingerprint === 'imported',
      packStatus: 'ready',
    })),
    scheduleRebuild: () => {
      if (get().pack) set({ packStatus: 'stale' });
      delayedRebuild();
    },
    rebuildNow: async () => {
      delayedRebuild.cancel();
      const token = ++buildToken;
      const samples = sortedValid(get().rawByKey);
      const fp = computeFingerprint(samples);
      buildAbort?.abort();
      const abort = new AbortController();
      buildAbort = abort;
      set({ packStatus: 'building' });

      const client = get().client;
      if (!client) {
        if (token === buildToken) reportFailure();
        return;
      }

      const revision = get().revision + 1;
      try {
        const { pack } = await client.buildPack(samples, new Date().toISOString(), revision, {
          signal: abort.signal,
        });
        if (token !== buildToken) return;
        const current = computeFingerprint(sortedValid(get().rawByKey));
        set({
          pack,
          revision,
          fingerprint: fp,
          packStatus: current === fp ? 'ready' : 'stale',
          importedNoRaw: false,
        });
        const db = get().db;
        if (db) {
          await savePackCache(db, createPackCacheRecord(fp, pack, new Date().toISOString()));
        }
      } catch (error) {
        if (!isAbort(error) && token === buildToken) reportFailure();
      } finally {
        if (buildAbort === abort) buildAbort = null;
      }
    },
    applyImported: async (pack, raw) => {
      if (get().readOnly) {
        get().pushToast({ text: 'This hand is open in another tab.' });
        return;
      }
      const db = get().db;
      const client = get().client;
      if (!db || !client) {
        get().pushToast({ text: 'The app is not ready to import a hand.' });
        return;
      }
      if (!isPack(pack)) {
        get().pushToast({ text: 'This pack is invalid.' });
        return;
      }

      let samples: RawGlyphSample[] | null;
      try {
        samples = raw === null
          ? null
          : raw.map((sample) => {
            const validation = validateRawSample(sample);
            if (!validation.ok) throw new Error('INVALID_RAW_SAMPLE');
            return validation.value;
          });
      } catch (error) {
        get().pushToast({ text: `Couldn't import this hand: ${errorText(error)}` });
        return;
      }
      const token = ++buildToken;
      delayedRebuild.cancel();
      buildAbort?.abort();
      const abort = new AbortController();
      buildAbort = abort;
      const revision = get().revision + 1;
      let acceptedPack = pack;
      let returnedRevision = revision;
      try {
        if (samples !== null) {
          const result = await client.buildPack(samples, pack.createdAt, revision, { signal: abort.signal });
          acceptedPack = result.pack;
          returnedRevision = result.revision;
        } else {
          const result = await client.loadPack(pack, revision);
          returnedRevision = result.revision;
        }
        if (token !== buildToken) return;
        if (get().readOnly) {
          get().pushToast({ text: 'This hand is open in another tab.' });
          return;
        }

        const sourceFingerprint = samples === null ? 'imported' : computeFingerprint(samples);
        const session: SessionMeta = {
          nextSessionIndex: samples === null ? 0 : sessionIndexAfter(samples),
          guideBaselinePx: get().guideBaselinePx,
          guideXHeightPx: get().guideXHeightPx,
          penWidthPx: get().penWidthPx,
        };
        const record: PackCacheRecord = createPackCacheRecord(
          sourceFingerprint,
          acceptedPack,
          new Date().toISOString(),
        );
        await replaceAll(db, { raw: samples ?? [], pack: record, session });
        if (token !== buildToken) return;

        const rawByKey = Object.fromEntries((samples ?? []).map((sample) => [
          `${sample.char}#${sample.variantIndex}`,
          sample,
        ]));
        set({
          pack: acceptedPack,
          revision: returnedRevision,
          fingerprint: sourceFingerprint,
          importedNoRaw: samples === null,
          packStatus: 'ready',
          rawByKey,
          quarantined: [],
          nextSessionIndex: session.nextSessionIndex,
          draftStrokes: [],
          redoStack: [],
          draftState: 'idle',
          draftGuides: null,
        });
      } catch (error) {
        if (!isAbort(error) && token === buildToken) {
          set({ packStatus: 'error' });
          get().pushToast({ text: `Couldn't import this hand: ${errorText(error)}` });
        }
      } finally {
        if (buildAbort === abort) buildAbort = null;
      }
    },
  };
};
