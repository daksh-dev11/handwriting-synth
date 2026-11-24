import {
  DEFAULT_VARIANCE,
  ENGINE_SPEC_REV,
  LIMITS,
  sanitizeSettings,
  sanitizeVariance,
  validateGlyphPack,
  validateRawSample,
} from '@engine';
import type { GlyphPack, RawGlyphSample } from '@engine';
import type { WorkerClient } from '@worker/client';
import { get, openDb, put } from './db';
import { debounce } from './debounce';
import { computeFingerprint, loadAllRaw, loadPackCache } from './persistence';
import type { PackCacheRecord, SessionMeta } from './persistence';
import { clampGuideValues } from './slices/captureSlice';
import { DRAFT_MS, SETTINGS_MS } from './timing';
import { useAppStore } from './useAppStore';

let removePreviousSubscription: (() => void) | null = null;
let bootGeneration = 0;

export function disposeBoot(): void {
  bootGeneration += 1;
  removePreviousSubscription?.();
  removePreviousSubscription = null;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {};
}

function isPackCacheRecord(value: unknown): value is PackCacheRecord {
  const record = recordOf(value);
  return typeof record.engineSpec === 'string'
    && typeof record.sourceFingerprint === 'string'
    && typeof record.savedAt === 'string'
    && 'pack' in record;
}

function sortedRaw(samples: readonly RawGlyphSample[]): RawGlyphSample[] {
  return [...samples].sort((a, b) => {
    if (a.char !== b.char) return a.char < b.char ? -1 : 1;
    return a.variantIndex - b.variantIndex;
  });
}

function sessionFromSettings(settings: ReturnType<typeof sanitizeSettings>): SessionMeta {
  const guides = clampGuideValues(settings.guideBaselinePx, settings.guideXHeightPx);
  return {
    nextSessionIndex: settings.nextSessionIndex,
    guideBaselinePx: guides.baselinePx,
    guideXHeightPx: guides.xHeightPx,
    penWidthPx: settings.penWidthPx,
  };
}

function showRestoreFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : 'unknown failure';
  useAppStore.getState().pushToast({ text: `Couldn't restore saved data: ${message}` });
}

async function acquireWriterLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.locks) return;
  const lockManager = navigator.locks;
  let resolveDecision: (() => void) | undefined;
  const decision = new Promise<void>((resolve) => {
    resolveDecision = resolve;
  });
  void lockManager.request('hw-synth-writer', { ifAvailable: true }, (lock) => {
    if (!lock) {
      useAppStore.getState().setReadOnly(true);
      resolveDecision?.();
      return;
    }
    useAppStore.getState().setReadOnly(false);
    resolveDecision?.();
    return new Promise<void>(() => undefined);
  }).catch((error: unknown) => {
    useAppStore.getState().setReadOnly(true);
    const message = error instanceof Error ? error.message : 'unknown failure';
    useAppStore.getState().pushToast({ text: `Couldn't acquire the writer lock: ${message}` });
    resolveDecision?.();
  });
  await decision;
}

export async function boot(client: WorkerClient): Promise<void> {
  disposeBoot();
  const generation = bootGeneration;

  const state = useAppStore.getState();
  state.setClient(client);
  const db = await openDb();
  if (generation !== bootGeneration) {
    db.idb?.close();
    return;
  }
  state.setDb(db);
  db.onClose = () => useAppStore.getState().setPersistenceAvailable(false);
  state.setPersistenceAvailable(db.idb !== null);
  state.setReadOnly(false);
  await acquireWriterLock();
  if (generation !== bootGeneration) return;

  try {
    const [sessionMeta, settingsMeta, draftMeta] = await Promise.all([
      get<unknown>(db, 'meta', 'session'),
      get<unknown>(db, 'meta', 'settings'),
      get<unknown>(db, 'meta', 'draft'),
    ]);
    if (generation !== bootGeneration) return;
    const savedSession = recordOf(sessionMeta);
    const savedSettings = recordOf(settingsMeta);
    const variance = sanitizeVariance(savedSettings.variance ?? DEFAULT_VARIANCE);
    const sanitized = sanitizeSettings({
      variance,
      template: savedSettings.template ?? 'ruled',
      xHeightPt: savedSettings.xHeightPt ?? 10,
      inkRgb: savedSettings.inkRgb ?? [0, 0, 0],
      maxPages: savedSettings.maxPages ?? LIMITS.MAX_PAGES,
      nextSessionIndex: savedSession.nextSessionIndex ?? 0,
      guideBaselinePx: savedSession.guideBaselinePx ?? 340,
      guideXHeightPx: savedSession.guideXHeightPx ?? 120,
      penWidthPx: savedSession.penWidthPx ?? 16,
      draft: draftMeta,
    });
    useAppStore.getState().hydrateSettings({
      text: sanitized.draft,
      variance: sanitized.variance,
      template: sanitized.template,
      xHeightPt: sanitized.xHeightPt,
      inkRgb: sanitized.inkRgb,
      maxPages: sanitized.maxPages,
    });

    const entries = await loadAllRaw(db);
    if (generation !== bootGeneration) return;
    const valid: RawGlyphSample[] = [];
    const quarantined: string[] = [];
    for (const [key, value] of entries) {
      const result = validateRawSample(value);
      if (result.ok && `${result.value.char}#${result.value.variantIndex}` === key) {
        valid.push(result.value);
      } else {
        quarantined.push(key);
      }
    }
    const maximumSessionIndex = valid.reduce((max, sample) => Math.max(max, sample.sessionIndex), -1);
    const session: SessionMeta = {
      ...sessionFromSettings(sanitized),
      nextSessionIndex: Math.max(sanitized.nextSessionIndex, maximumSessionIndex + 1),
    };
    useAppStore.getState().hydrateRaw(valid, quarantined, session);

    const fingerprint = computeFingerprint(sortedRaw(valid));
    const cachedValue = await loadPackCache(db);
    if (generation !== bootGeneration) return;
    let acceptedCache: { pack: GlyphPack; fingerprint: string } | null = null;
    if (isPackCacheRecord(cachedValue)) {
      const record = recordOf(cachedValue);
      const cachePack = validateGlyphPack(record.pack);
      const sourceFingerprint = record.sourceFingerprint;
      const matchesRaw = sourceFingerprint === fingerprint;
      const isImported = sourceFingerprint === 'imported' && valid.length === 0;
      if (
        record.engineSpec === ENGINE_SPEC_REV
        && (matchesRaw || isImported)
        && cachePack.ok
      ) {
        acceptedCache = { pack: cachePack.value, fingerprint: sourceFingerprint };
      }
    }

    if (acceptedCache) {
      try {
        const revision = useAppStore.getState().revision + 1;
        await client.loadPack(acceptedCache.pack, revision);
        if (generation !== bootGeneration) return;
        useAppStore.getState().setPackFromCache(acceptedCache.pack, acceptedCache.fingerprint);
      } catch (error) {
        showRestoreFailure(error);
        if (valid.length > 0) await useAppStore.getState().rebuildNow();
        else useAppStore.setState({ packStatus: 'error' });
      }
    } else if (valid.length > 0) {
      await useAppStore.getState().rebuildNow();
      if (generation !== bootGeneration) return;
    } else {
      useAppStore.setState({ packStatus: 'none' });
    }

    const firstMissing = useAppStore.getState().queue.findIndex((key) => !useAppStore.getState().rawByKey[key.key]);
    useAppStore.getState().goTo(firstMissing < 0 ? 0 : firstMissing);
    useAppStore.getState().setMode('write');

    const current = useAppStore.getState();
    let lastSettings = {
      variance: current.variance,
      template: current.template,
      xHeightPt: current.xHeightPt,
      inkRgb: current.inkRgb,
      maxPages: current.maxPages,
    };
    let lastDraft = current.text;
    const persistSettings = debounce(() => {
      const snapshot = useAppStore.getState();
      void put(db, 'meta', 'settings', {
        variance: snapshot.variance,
        template: snapshot.template,
        xHeightPt: snapshot.xHeightPt,
        inkRgb: snapshot.inkRgb,
        maxPages: snapshot.maxPages,
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'unknown failure';
        useAppStore.getState().pushToast({ text: `Couldn't save settings: ${message}` });
      });
    }, SETTINGS_MS);
    const persistDraft = debounce(() => {
      const text = useAppStore.getState().text;
      void put(db, 'meta', 'draft', text).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'unknown failure';
        useAppStore.getState().pushToast({ text: `Couldn't save the text draft: ${message}` });
      });
    }, DRAFT_MS);

    const unsubscribe = useAppStore.subscribe((next) => {
      if (
        next.variance !== lastSettings.variance
        || next.template !== lastSettings.template
        || next.xHeightPt !== lastSettings.xHeightPt
        || next.inkRgb !== lastSettings.inkRgb
        || next.maxPages !== lastSettings.maxPages
      ) {
        lastSettings = {
          variance: next.variance,
          template: next.template,
          xHeightPt: next.xHeightPt,
          inkRgb: next.inkRgb,
          maxPages: next.maxPages,
        };
        persistSettings();
      }
      if (next.text !== lastDraft) {
        lastDraft = next.text;
        persistDraft();
      }
    });
    const flush = (): void => {
      persistSettings.flush();
      persistDraft.flush();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', flush);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
    removePreviousSubscription = () => {
      unsubscribe();
      persistSettings.cancel();
      persistDraft.cancel();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', flush);
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', flush);
    };
  } catch (error) {
    if (generation !== bootGeneration) return;
    showRestoreFailure(error);
    useAppStore.getState().setMode('write');
  }
}
