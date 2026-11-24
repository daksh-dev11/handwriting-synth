import {
  LIMITS,
  OPTIONAL_KEYS,
  REQUIRED_KEYS,
  captureKeyOf,
  computeGuides,
  validateRawSample,
} from '@engine';
import type { CaptureGuides, CaptureKey, RawGlyphSample, RawStrokePoint } from '@engine';
import type { StateCreator } from 'zustand';
import { put } from '../db';
import type { SessionMeta } from '../persistence';
import { replaceAll, saveRawSample } from '../persistence';
import type { AppState } from '../useAppStore';

export type DraftState = 'idle' | 'drawing' | 'drafted' | 'committing';
export type DemoLoader = () => Promise<{ buildDemoSamples(): RawGlyphSample[] }>;

export interface CaptureSlice {
  queue: readonly CaptureKey[];
  cursor: number;
  customKey: CaptureKey | null;
  optionalOpen: boolean;
  rawByKey: Record<string, RawGlyphSample>;
  quarantined: string[];
  guideBaselinePx: number;
  guideXHeightPx: number;
  penWidthPx: number;
  nextSessionIndex: number;
  draftStrokes: RawStrokePoint[][];
  redoStack: RawStrokePoint[][][];
  draftState: DraftState;
  draftGuides: CaptureGuides | null;
  setGuides(baselinePx: number, xHeightPx: number): void;
  setPenWidth(px: number): void;
  setDraftState(state: DraftState): void;
  onDrawingChange(drawing: boolean): void;
  pushStroke(points: RawStrokePoint[]): void;
  undoStroke(): void;
  redoStroke(): void;
  clearDraft(): void;
  goTo(index: number): void;
  next(): void;
  prev(): void;
  goToChar(char: string): void;
  currentKey(): CaptureKey;
  commitDraft(): Promise<void>;
  loadDemo(): Promise<void>;
  setOptionalOpen(open: boolean): void;
  hydrateRaw(valid: RawGlyphSample[], quarantined: string[], session: SessionMeta): void;
  replaceRaw(valid: RawGlyphSample[], session: SessionMeta): void;
}

function sessionFromState(state: AppState): SessionMeta {
  return {
    nextSessionIndex: state.nextSessionIndex,
    guideBaselinePx: state.guideBaselinePx,
    guideXHeightPx: state.guideXHeightPx,
    penWidthPx: state.penWidthPx,
  };
}

function samplePointCount(sample: RawGlyphSample): number {
  return sample.strokes.reduce((total, stroke) => total + stroke.length, 0);
}

function thinStrokes(strokes: RawStrokePoint[][]): RawStrokePoint[][] {
  return strokes.map((stroke) => {
    if (stroke.length <= 2) return [...stroke];
    const kept = [stroke[0]];
    for (let i = 1; i < stroke.length - 1; i++) {
      const point = stroke[i];
      const previous = kept[kept.length - 1];
      if (previous && point && Math.hypot(point.x - previous.x, point.y - previous.y) >= 1) {
        kept.push(point);
      }
    }
    const last = stroke[stroke.length - 1];
    if (last && last !== kept[kept.length - 1]) kept.push(last);
    return kept;
  });
}

function maxSessionIndex(samples: readonly RawGlyphSample[]): number {
  return samples.reduce((max, sample) => Math.max(max, sample.sessionIndex), -1);
}

export function clampGuideValues(baselinePx: number, xHeightPx: number): {
  baselinePx: number;
  xHeightPx: number;
} {
  const xHeight = Math.round(Math.min(160, Math.max(60, xHeightPx)));
  const low = Math.ceil(2 * xHeight + 10);
  const high = Math.floor(470 - (2 / 3) * xHeight);
  return {
    baselinePx: Math.min(high, Math.max(low, Math.round(baselinePx))),
    xHeightPx: xHeight,
  };
}

function sortSamples(samples: readonly RawGlyphSample[]): RawGlyphSample[] {
  return [...samples].sort((a, b) => {
    if (a.char !== b.char) return a.char < b.char ? -1 : 1;
    return a.variantIndex - b.variantIndex;
  });
}

function persistSession(get: () => AppState): void {
  const db = get().db;
  if (!db) return;
  void put(db, 'meta', 'session', sessionFromState(get())).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown failure';
    get().pushToast({ text: `Couldn't save your guide settings: ${message}` });
  });
}

function sampleFromUnknown(value: unknown): RawGlyphSample | null {
  const result = validateRawSample(value);
  return result.ok ? result.value : null;
}

export const createCaptureSlice: StateCreator<AppState, [], [], CaptureSlice> = (set, get) => {
  let persistRequested = false;

  const discardDraft = (): void => {
    set({
      draftStrokes: [],
      redoStack: [],
      draftState: 'idle',
      draftGuides: null,
    });
  };

  return {
    queue: REQUIRED_KEYS,
    cursor: 0,
    customKey: null,
    optionalOpen: false,
    rawByKey: {},
    quarantined: [],
    guideBaselinePx: 340,
    guideXHeightPx: 120,
    penWidthPx: 16,
    nextSessionIndex: 0,
    draftStrokes: [],
    redoStack: [],
    draftState: 'idle',
    draftGuides: null,
    setGuides: (baselinePx, xHeightPx) => {
      const state = get();
      if (state.draftStrokes.length > 0) return;
      const requestedXHeight = Number.isFinite(xHeightPx) ? xHeightPx : state.guideXHeightPx;
      const requestedBaseline = Number.isFinite(baselinePx) ? baselinePx : state.guideBaselinePx;
      const guides = clampGuideValues(requestedBaseline, requestedXHeight);
      set({ guideBaselinePx: guides.baselinePx, guideXHeightPx: guides.xHeightPx });
      persistSession(get);
    },
    setPenWidth: (px) => {
      const state = get();
      if (state.draftStrokes.length > 0) return;
      const requested = Number.isFinite(px) ? px : state.penWidthPx;
      set({ penWidthPx: Math.round(Math.min(32, Math.max(6, requested))) });
      persistSession(get);
    },
    setDraftState: (draftState) => {
      set((state) => ({
        draftState,
        draftGuides: draftState === 'drawing'
          && state.draftStrokes.length === 0
          && (state.redoStack.length > 0 || !state.draftGuides)
          ? computeGuides(state.guideBaselinePx, state.guideXHeightPx)
          : state.draftGuides,
      }));
    },
    onDrawingChange: (drawing) => {
      set((state) => ({
        draftState: drawing ? 'drawing' : state.draftStrokes.length > 0 ? 'drafted' : 'idle',
        draftGuides: drawing
          && state.draftStrokes.length === 0
          && (state.redoStack.length > 0 || !state.draftGuides)
          ? computeGuides(state.guideBaselinePx, state.guideXHeightPx)
          : state.draftGuides,
      }));
    },
    pushStroke: (points) => {
      if (get().draftState === 'committing') return;
      set((state) => ({
        draftStrokes: [...state.draftStrokes, points],
        redoStack: [],
        draftState: 'drafted',
        draftGuides: state.draftStrokes.length === 0 && state.redoStack.length > 0
          ? computeGuides(state.guideBaselinePx, state.guideXHeightPx)
          : state.draftGuides ?? computeGuides(state.guideBaselinePx, state.guideXHeightPx),
      }));
    },
    undoStroke: () => {
      const { draftStrokes, redoStack } = get();
      if (draftStrokes.length === 0) return;
      const removed = draftStrokes[draftStrokes.length - 1];
      if (!removed) return;
      set({
        draftStrokes: draftStrokes.slice(0, -1),
        redoStack: [...redoStack, [removed]],
        draftState: draftStrokes.length > 1 ? 'drafted' : 'idle',
        draftGuides: get().draftGuides,
      });
    },
    redoStroke: () => {
      const { draftStrokes, redoStack } = get();
      const last = redoStack[redoStack.length - 1];
      const stroke = last?.[last.length - 1];
      if (!stroke) return;
      set({
        draftStrokes: [...draftStrokes, stroke],
        redoStack: redoStack.slice(0, -1),
        draftState: 'drafted',
        draftGuides: get().draftGuides ?? computeGuides(get().guideBaselinePx, get().guideXHeightPx),
      });
    },
    clearDraft: () => {
      get().captureAbort?.();
      discardDraft();
    },
    goTo: (index) => {
      get().captureAbort?.();
      const queue = get().queue;
      const cursor = Math.min(queue.length - 1, Math.max(0, Math.trunc(index)));
      discardDraft();
      set({ cursor, customKey: null });
    },
    next: () => get().goTo(get().cursor + 1),
    prev: () => get().goTo(get().cursor - 1),
    goToChar: (char) => {
      const found = get().queue.findIndex((key) => key.char === char);
      if (found >= 0) {
        get().goTo(found);
        return;
      }
      get().captureAbort?.();
      discardDraft();
      set({ customKey: captureKeyOf(char, 0), cursor: get().queue.length });
    },
    currentKey: () => {
      const state = get();
      if (state.customKey) return state.customKey;
      const key = state.queue[state.cursor];
      if (!key) throw new Error('CAPTURE_QUEUE_EMPTY');
      return key;
    },
    commitDraft: async () => {
      const state = get();
      if (state.draftState !== 'drafted') return;
      if (state.readOnly) {
        state.pushToast({ text: 'This hand is open in another tab.' });
        return;
      }
      if (state.draftStrokes.length === 0) return;

      const db = state.db;
      if (!db) {
        state.pushToast({ text: "Couldn't save. Try again." });
        return;
      }

      set({ draftState: 'committing' });
      const key = get().currentKey();
      const draftGuides = get().draftGuides;
      const baseline = draftGuides?.baselineY ?? get().guideBaselinePx;
      const xHeight = draftGuides
        ? draftGuides.baselineY - draftGuides.xHeightY
        : get().guideXHeightPx;
      const excludedKey = key.key;
      const existingPoints = Object.entries(get().rawByKey)
        .filter(([rawKey]) => rawKey !== excludedKey)
        .reduce((total, [, sample]) => total + samplePointCount(sample), 0);
      let strokes = get().draftStrokes.map((stroke) => [...stroke]);
      let total = strokes.reduce((count, stroke) => count + stroke.length, 0);
      if (existingPoints + total > LIMITS.MAX_RAW_POINTS_TOTAL) {
        strokes = thinStrokes(strokes);
        total = strokes.reduce((count, stroke) => count + stroke.length, 0);
      }
      if (existingPoints + total > LIMITS.MAX_RAW_POINTS_TOTAL) {
        set({ draftState: 'drafted' });
        get().pushToast({
          text: 'Your hand has too much detail to export. Clear and redraw this glyph with fewer strokes.',
        });
        return;
      }

      const candidate: RawGlyphSample = {
        char: key.char,
        variantIndex: key.variantIndex,
        sessionIndex: get().nextSessionIndex,
        guides: get().draftGuides ?? computeGuides(baseline, xHeight),
        penWidthPx: get().penWidthPx,
        strokes,
        capturedAt: new Date().toISOString(),
      };
      const validation = validateRawSample(candidate);
      if (!validation.ok) {
        set({ draftState: 'drafted' });
        get().pushToast({ text: "This drawing couldn't be saved." });
        return;
      }

      const sample = validation.value;
      const session: SessionMeta = {
        nextSessionIndex: get().nextSessionIndex + 1,
        guideBaselinePx: get().guideBaselinePx,
        guideXHeightPx: get().guideXHeightPx,
        penWidthPx: get().penWidthPx,
      };
      try {
        await saveRawSample(db, sample, session);
      } catch (error) {
        set({ draftState: 'drafted' });
        if (error instanceof Error && error.name === 'QuotaExceededError') {
          get().pushToast({ text: 'Storage is full. Export your hand (.json) now.' });
        } else {
          get().pushToast({ text: "Couldn't save. Try again." });
        }
        return;
      }

      const rawByKey = { ...get().rawByKey, [key.key]: sample };
      const nextMissing = REQUIRED_KEYS.findIndex((item) => !rawByKey[item.key]);
      const nextCursor = nextMissing >= 0
        ? nextMissing
        : Math.min(get().queue.length - 1, get().cursor + 1);
      set({
        rawByKey,
        nextSessionIndex: session.nextSessionIndex,
        redoStack: [],
        draftStrokes: [],
        draftGuides: null,
        draftState: 'idle',
        cursor: nextCursor,
        customKey: null,
      });
      if (!persistRequested) {
        persistRequested = true;
        if (typeof navigator !== 'undefined') {
          void navigator.storage?.persist?.().catch(() => undefined);
        }
      }
      get().scheduleRebuild();
    },
    loadDemo: async () => {
      const state = get();
      if (state.readOnly) {
        state.pushToast({ text: 'This hand is open in another tab.' });
        return;
      }
      const db = state.db;
      if (!db || !state.client) {
        state.pushToast({ text: 'The demo hand is not available until the app is ready.' });
        return;
      }

      try {
        const module = await state.demoLoader();
        if (get().readOnly) {
          get().pushToast({ text: 'This hand is open in another tab.' });
          return;
        }
        const samples = module.buildDemoSamples().map((sample) => {
          const validated = sampleFromUnknown(sample);
          if (!validated) throw new Error('Demo loader returned an invalid sample');
          return validated;
        });
        const orderedSamples = sortSamples(samples);
        if (orderedSamples.length === 0) throw new Error('Demo loader returned no samples');
        const session: SessionMeta = {
          nextSessionIndex: maxSessionIndex(orderedSamples) + 1,
          guideBaselinePx: get().guideBaselinePx,
          guideXHeightPx: get().guideXHeightPx,
          penWidthPx: get().penWidthPx,
        };
        await replaceAll(db, { raw: orderedSamples, pack: null, session });
        get().replaceRaw(orderedSamples, session);
        set({ importedNoRaw: false });
        await get().rebuildNow();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown failure';
        get().pushToast({ text: `Couldn't load the demo hand: ${message}` });
      }
    },
    setOptionalOpen: (open) => {
      const queue = open ? [...REQUIRED_KEYS, ...OPTIONAL_KEYS] : REQUIRED_KEYS;
      set((state) => ({
        optionalOpen: open,
        queue,
        cursor: Math.min(state.cursor, queue.length - 1),
      }));
    },
    hydrateRaw: (valid, quarantined, session) => {
      const rawByKey = Object.fromEntries(valid.map((sample) => [
        `${sample.char}#${sample.variantIndex}`,
        sample,
      ]));
      set({
        rawByKey,
        quarantined,
        nextSessionIndex: session.nextSessionIndex,
        guideBaselinePx: session.guideBaselinePx,
        guideXHeightPx: session.guideXHeightPx,
        penWidthPx: session.penWidthPx,
      });
    },
    replaceRaw: (valid, session) => {
      const rawByKey = Object.fromEntries(valid.map((sample) => [
        `${sample.char}#${sample.variantIndex}`,
        sample,
      ]));
      set({
        rawByKey,
        quarantined: [],
        nextSessionIndex: session.nextSessionIndex,
        guideBaselinePx: session.guideBaselinePx,
        guideXHeightPx: session.guideXHeightPx,
        penWidthPx: session.penWidthPx,
      });
    },
  };
};
