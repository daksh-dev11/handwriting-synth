# DesignDoc.md — Handwriting Synthesis App: Implementation Blueprint

**Status:** Normative. Binds `MathEngine.md` (math), `Architecture.md` (structure), `UX.md` (UI). Where this file conflicts with those three, **this file wins**; each patch below is listed once and never restated elsewhere. All timings are ms, all lengths CSS px unless marked `pt` or `em`.

---

## 1. Authoritative Cross-Spec Resolutions (Locked Patches)

### 1.1 `src/engine/index.ts` barrel (complete, normative)

```ts
// types (export type)
export type { Pt, CubicBezier, PressureKnot, NormalizedStroke, GlyphClass, Anchor, NormalizedGlyph, StyleProfile,
  GlyphPack, RawStrokePoint, RawGlyphSample, CaptureGuides, PointerKind, VarianceConfig, PathCmd, CachedOutline,
  LayoutGeometry, LigatureCubic, Placement, LayoutResult, TemplateId, TemplateSpec, PageMetrics,
  ValidationIssue, ValidationResult, IssueCode, PackFileContents, CaptureKey } from './types-barrel';
// runtime
export { buildGlyphPack } from './normalize/pipeline';
export { InstanceCache } from './layout/instanceCache';
export { layoutText } from './layout/layoutText';
export { glyphOutline, ribbonPath } from './ink/ribbon';
export { ligatureOutline } from './ink/ligatureOutline';
export { placementToLine } from './variance/placement';
export { computeGuides } from './guides';
export { normalizeChar, glyphClassOf, CAPTURE_CHARSET, REQUIRED_KEYS, OPTIONAL_KEYS, MULTI_VARIANT_CHARS, X_CLASS, captureKeyOf } from './charset';
export { validateGlyphPack, sanitizeGlyphPack } from './schema/glyphPackSchema';
export { validateRawSample } from './schema/rawSampleSchema';
export { parsePackFile, serializePackFile } from './schema/packFile';
export { TEMPLATE_SPECS, PAGE, BACKDROP, pageMetrics } from './layout/templates';
export { hash32, u01, gauss, perlin1, fnv1a32 } from './rng';
export { EM, K, CH, ENGINE_SPEC_REV } from './constants';
export { LIMITS } from './limits';
export { DEFAULT_VARIANCE } from './types';
```

`./types-barrel` is not a file: write the `export type {…}` list as a second statement block re-exporting from the real files (`./types`, `./layout/templates`, `./layout/instanceCache`, `./schema/validate`, `./schema/packFile`, `./charset`). `PathCmd`, `CachedOutline` live in `types.ts`. Nothing else is importable from `@engine`.

### 1.2 `InstanceCache` keying

```ts
class InstanceCache {
  constructor(pack: GlyphPack, cfg: VarianceConfig);
  reconfigure(cfg: VarianceConfig): void;           // keeps instances if seed & poolSize unchanged
  instance(glyphId: string, composite: number): NormalizedGlyph;
  outline(glyphId: string, composite: number, bucket: 0|1|2): CachedOutline;  // inkI read from current cfg
}
```
* Instance memo key: `${glyphId}|${composite}`, valid only for the triple **(pack object identity, `seed`, `poolSize`)**. `reconfigure` with a different `seed` or `poolSize` clears the instance memo **and** outline memo. `slantJitter`, `baselineDrift`, `spacingVariance`, `mode`, `inkPressure` never invalidate instances (§4.5 depends on none of them).
* Outline memo key: `${glyphId}|${composite}|${bucket}|${inkQ}` with `inkQ = Math.round(inkPressure * 100)`. When `inkQ` changes, drop every outline entry whose `inkQ` differs (bounded memory) and keep instances. The §3.6 width formula receives the exact `inkPressure`; `inkQ` is only the key, and `inkPressure` is stored at 0.01 granularity by the slider (step .01), so key and value agree.
* Consumers (`PreviewController`, `generatePdfJob`) construct once per (pack, seed, poolSize) and call `reconfigure` on every config change.

### 1.3 `normalizeChar` (fallback-only dashes)

```ts
export function normalizeChar(ch: string, has: (c: string) => boolean): string {
  if (ch === '\u201C' || ch === '\u201D') return '"';        // smart quotes: unconditional (MathEngine §4.4)
  if (ch === '\u2018' || ch === '\u2019') return "'";
  if (has(ch)) return ch;                                      // a drawn – or — always wins
  if (ch === '\u2013' || ch === '\u2014') return '-';          // dash fallback ONLY when the glyph is missing
  return ch;
}
```
`has = (c) => pack.glyphs[c] !== undefined`. `layoutText` calls it once per character before lookup; `LayoutResult.missingChars` and `MissingGlyphPill` use the post-normalization character.

### 1.4 `ligatureOutline`

`ligatureOutline(lig, W, inkI): PathCmd[]` builds `stroke = { segments: [{p0,p1,p2,p3}], pressure: [{u:0,p:K.LIG_PRESSURE_SCALE*lig.pressureStart},{u:1,p:K.LIG_PRESSURE_SCALE*lig.pressureEnd}], isDot:false }` (`pressureStart/End` are the **unmultiplied** boundary knots `p_E`, `p_S`; this scale is applied exactly once, here) and returns `ribbonPath([stroke], W, inkI, 1.0)` — the identical §3.7 expander used by `glyphOutline` (steps A–C, curvature clamp `half ≤ 0.9/|κc|`, nonzero fill). `ribbonPath(strokes, W, inkI, pressureMultiplier): { path: PathCmd[]; bounds }` is the single implementation; `glyphOutline(glyph, W, inkI, mult)` calls it with `glyph.strokes`. Output coordinates are line-space em for ligatures and glyph-local em for glyphs.

### 1.5 `src/engine/charset.ts` (exact)

```ts
export interface CaptureKey { char: string; variantIndex: number; key: string }   // key = `${char}#${variantIndex}`
export const captureKeyOf = (char: string, variantIndex: number): CaptureKey => ({ char, variantIndex, key: `${char}#${variantIndex}` });
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'.split('');
export const MULTI_VARIANT_CHARS = ['e', 't', 'a', 'o', 'i', 'n', 's'] as const;
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '0123456789'.split('');
const PUNCTUATION = ['.', ',', ';', ':', '!', '?', "'", '"', '-', '(', ')', '/'];
const OPTIONAL = ['`', '_', '[', ']', '{', '}', '+', '=', '<', '>', '~', '*', '^', '\\', '|'];
export const CAPTURE_CHARSET = { lowercase: LOWERCASE, multiVariant: MULTI_VARIANT_CHARS, uppercase: UPPERCASE, digits: DIGITS, punctuation: PUNCTUATION, optional: OPTIONAL } as const;
export const REQUIRED_KEYS: readonly CaptureKey[] = [
  ...LOWERCASE.map((c) => captureKeyOf(c, 0)),                                        // 26
  ...MULTI_VARIANT_CHARS.flatMap((c) => [captureKeyOf(c, 1), captureKeyOf(c, 2)]),    // 14
  ...UPPERCASE.map((c) => captureKeyOf(c, 0)),                                        // 26
  ...DIGITS.map((c) => captureKeyOf(c, 0)),                                           // 10
  ...PUNCTUATION.map((c) => captureKeyOf(c, 0)),                                      // 12  → 88
];
export const OPTIONAL_KEYS: readonly CaptureKey[] = OPTIONAL.map((c) => captureKeyOf(c, 0));   // 15
export const X_CLASS = new Set('acemnorsuvwxz'.split(''));
```
`tests/engine/charset.test.ts` asserts `REQUIRED_KEYS.length === 88`, `OPTIONAL_KEYS.length === 15`, all keys unique. A custom (missing-glyph) capture uses `captureKeyOf(char, 0)`.

### 1.6 UI edge-case locks

* `Clear`, `Undo stroke`, `Skip` call `e.currentTarget.blur()` inside their `onClick` after dispatching their action, so a later `Space` reaches the view-root handler (Accept) and is never swallowed by a focused button. `Accept` itself also blurs.
* `LivePreview` renders, below the sheet (centered, `--fs-11`, `--ink-2`), the caption *"Showing Page 1 preview — full text exports to PDF"* whenever the preview `LayoutResult.truncated === true`.

### 1.7 Dense variant re-indexing (resolves a validator/capture conflict)

`buildGlyphPack` re-indexes each character's variants densely in ascending captured `variantIndex` (captured `e#0,e#2` → `glyphs.e[0].id='e#0'`, `glyphs.e[1].id='e#1'`). Raw records keep their original keys. The capture-time draft preview builds with `variantIndex` coerced to 0.

### 1.8 Layering (no cycles)

Rank order, each layer may import only lower ranks: `engine(0) < pdf(1), canvas(1), worker/protocol(1) < worker/client(2), worker/(rest)(2) < store(3) < components(4)`. Additional permission: `src/demo/**` imports only `import type` from `@engine`; it is loaded only via dynamic `import()` from `store/slices/captureSlice.ts`. `src/styles/tokens.css` is imported by `main.tsx` only.

---

## 2. Zustand Store & Persistence Wiring (`src/store/**`)

`useAppStore = create<AppState>()((...a) => ({ ...captureSlice(...a), ...packSlice(...a), ...composeSlice(...a), ...jobSlice(...a), ...uiSlice(...a) }))` with `type AppState = CaptureSlice & PackSlice & ComposeSlice & JobSlice & UiSlice`. Slices call each other only through `get()`. Timing constants live in `store/timing.ts`: `SETTINGS_MS = 300`, `DRAFT_MS = 500`, `REBUILD_MS = 400`. `store/debounce.ts` exports `debounce<A>(fn, ms): ((...a: A) => void) & { flush(): void; cancel(): void }`.

### 2.1 Slice interfaces (exact)

```ts
export type DraftState = 'idle' | 'drawing' | 'drafted' | 'committing';
export interface CaptureSlice {
  queue: readonly CaptureKey[];               // REQUIRED_KEYS (+ OPTIONAL_KEYS when optionalOpen)
  cursor: number;                             // index into queue; custom ≥ queue.length - 1 uses customKey
  customKey: CaptureKey | null;
  optionalOpen: boolean;                      // true after "Draw them"
  rawByKey: Record<string, RawGlyphSample>;   // valid records only (source for build-pack)
  quarantined: string[];                      // unreadable keys
  guideBaselinePx: number; guideXHeightPx: number; penWidthPx: number; nextSessionIndex: number;
  draftStrokes: RawStrokePoint[][];           // committed-to-draft strokes (the in-flight stroke lives in CaptureController)
  redoStack: RawStrokePoint[][][];            // stacks of removed strokes, one entry per undo
  draftState: DraftState;
  setGuides(baselinePx: number, xHeightPx: number): void;   // clamps per UX §5.3, persists meta.session
  setPenWidth(px: number): void;                            // 6..32, persists meta.session
  setDraftState(s: DraftState): void;
  pushStroke(points: RawStrokePoint[]): void;               // appends, clears redoStack, draftState='drafted'
  undoStroke(): void; redoStroke(): void;
  clearDraft(): void;                                       // strokes=[], redo=[], 'idle'
  goTo(index: number): void; next(): void; prev(): void;    // discard draft (strokes, redo) on every navigation
  goToChar(char: string): void;                             // queue item if present else customKey
  currentKey(): CaptureKey;
  commitDraft(): Promise<void>;                             // §2.3
  loadDemo(): Promise<void>;                                // §5
  hydrateRaw(valid: RawGlyphSample[], quarantined: string[], session: SessionMeta): void;
  replaceRaw(valid: RawGlyphSample[], session: SessionMeta): void;
}
export type PackStatus = 'none' | 'building' | 'ready' | 'stale' | 'error';
export interface PackSlice {
  pack: GlyphPack | null; packStatus: PackStatus; revision: number;   // revision: monotonic integer, owned here
  fingerprint: string | null; importedNoRaw: boolean;
  setPackFromCache(pack: GlyphPack, fingerprint: string): void;
  scheduleRebuild(): void;                  // debounced REBUILD_MS; sets 'stale' if a pack exists
  rebuildNow(): Promise<void>;              // cancels pending timer + running job, sends build-pack
  applyImported(pack: GlyphPack, raw: RawGlyphSample[] | null): Promise<void>;   // replaceAll
}
export interface ComposeSlice {
  text: string; variance: VarianceConfig; template: TemplateId; xHeightPt: number;
  inkRgb: [number, number, number]; maxPages: number;
  setText(t: string): void;                 // slices to LIMITS.MAX_TEXT_CHARS; schedules draft persist
  setVariance(p: Partial<VarianceConfig>): void; setTemplate(t: TemplateId): void;
  setXHeightPt(v: number): void; setInkRgb(c: [number, number, number]): void; setMaxPages(n: number): void;
  rerollSeed(): void;                       // crypto.getRandomValues(new Uint32Array(1))[0]
  resetVariance(): void;                    // DEFAULT_VARIANCE with current seed
}
export type JobPhase = 'idle' | 'validate' | 'layout' | 'emit' | 'finalize' | 'done' | 'cancelled' | 'failed';
export interface JobSlice {
  phase: JobPhase; progress: ProgressInfo | null;
  result: { blob: Blob; stats: PdfStats; warnings: PdfWarning[] } | null;
  warnings: PdfWarning[]; error: { code: ErrorCode | 'STALLED'; message: string } | null;
  abort: AbortController | null;
  startExport(): Promise<void>;             // requires canExport(); auto-download; one silent retry for PACK_NOT_LOADED/REVISION_MISMATCH/BUSY
  cancelExport(): void;
  dismissJob(): void;
}
export interface Toast { id: number; text: string; actionLabel?: string; onAction?: () => void }
export interface UiSlice {
  mode: 'calibrate' | 'write'; inspectorOpen: boolean; galleryOpen: boolean;
  toasts: Toast[]; dismissedMissing: string[];
  dialog: null | 'pack' | 'confirm-demo' | 'confirm-import';
  persistenceAvailable: boolean; previewBusy: boolean;
  setMode(m: 'calibrate' | 'write'): void; toggleInspector(): void; toggleGallery(): void;
  pushToast(t: Omit<Toast, 'id'>): void; dismissToast(id: number): void;
  dismissMissing(chars: string[]): void; setDialog(d: UiSlice['dialog']): void;
}
export const selectIsFirstVisit = (s: AppState) => Object.keys(s.rawByKey).length === 0 && s.pack === null;
export const selectIsDemo = (s: AppState) => { const v = Object.values(s.rawByKey); return v.length > 0 && v.every(r => r.capturedAt === DEMO_CAPTURED_AT); };
export const selectCanExport = (s: AppState) => !!s.pack && Object.keys(s.pack.glyphs).length >= 1 && s.text.trim() !== '' && s.phase === 'idle';
export const selectRequiredDone = (s: AppState) => REQUIRED_KEYS.filter(k => s.rawByKey[k.key]).length;
```

### 2.2 `store/db.ts` (exact contract)

```ts
export const DB_NAME = 'handwriting-synth', DB_VERSION = 1;
export type StoreName = 'raw' | 'pack' | 'meta';
export interface Db { idb: IDBDatabase | null; mem: Record<StoreName, Map<string, unknown>> }   // idb === null ⇒ in-memory fallback
export async function openDb(): Promise<Db>;      // onupgradeneeded creates stores raw/pack/meta (no keyPath); on any failure resolves { idb: null, mem }
export function get<T>(db: Db, s: StoreName, key: string): Promise<T | undefined>;
export function put(db: Db, s: StoreName, key: string, value: unknown): Promise<void>;
export function getAll<T>(db: Db, s: StoreName): Promise<Array<[string, T]>>;   // keys via openCursor, sorted by key
export function clear(db: Db, s: StoreName): Promise<void>;
export function tx(db: Db, stores: StoreName[], mode: IDBTransactionMode, fn: (st: Record<StoreName, IDBObjectStore>) => void): Promise<void> {
  if (!db.idb) return Promise.reject(new Error('NO_IDB'));
  return new Promise((res, rej) => {
    const t = db.idb!.transaction(stores, mode);
    fn(Object.fromEntries(stores.map(s => [s, t.objectStore(s)])) as Record<StoreName, IDBObjectStore>);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error ?? new Error('ABORT'));
  });
}
```
`persistence.ts` exports `saveRawSample(db, sample, session)` (one `tx(['raw','meta'],'readwrite')`: `put raw[key]`, `put meta.session`), `loadAllRaw`, `savePackCache`, `loadPackCache`, `replaceAll(db, {raw, pack, session}): tx(['raw','pack','meta'])` doing `clear(raw)`, `clear(pack)`, `put` every raw, optional `put pack.current`, `put meta.session`, and `computeFingerprint(raws)` exactly per Architecture §3.3. When `db.idb === null` each function operates on `db.mem` and resolves normally.

### 2.3 Manual-only commit rule

Strokes accumulate in `draftStrokes` only through `pushStroke`; **nothing is saved on pen-up**. Persistence happens only when `commitDraft()` runs (Enter, Space, or `Accept` click). `commitDraft`: (1) if `draftStrokes.length === 0` return after `ui` shake signal (`pushToast` not used; the view runs the shake); (2) `draftState='committing'`; (3) build `RawGlyphSample{ char, variantIndex, sessionIndex: nextSessionIndex, guides:{ascenderY:gB−2xh, xHeightY:gB−xh, baselineY:gB, descenderY:gB+(2/3)xh}, penWidthPx, strokes, capturedAt:new Date().toISOString() }` (guides via `computeGuides`); (4) `validateRawSample`; failure ⇒ `draftState='drafted'` + toast *"This drawing couldn't be saved."*; (5) `saveRawSample`; failure ⇒ `drafted` + toast *"Couldn't save. Try again."*; (6) update `rawByKey`, `nextSessionIndex += 1`, `redoStack=[]`, `draftStrokes=[]`, `draftState='idle'`, advance the cursor to the next missing required key (or `+1`); (7) `scheduleRebuild()`; (8) on the first commit of the app lifetime call `navigator.storage?.persist?.()` once. Undo/redo operate only on `draftStrokes`/`redoStack`; both clear on Accept, `goTo/next/prev`, mode switch, and `clearDraft`. `Backspace`/`⌘Z` ⇒ `undoStroke` (pushes the removed stroke as `[stroke]` onto `redoStack`); `⌘⇧Z` ⇒ `redoStroke`; a new `pushStroke` empties `redoStack`.

### 2.4 `store/boot.ts` — `boot(client: WorkerClient): Promise<void>` (exact order)

1. `db = await openDb()`; `ui.persistenceAvailable = db.idb !== null`.
2. Read `meta.session`, `meta.settings`, `meta.draft`; defaults: session `{nextSessionIndex:0, guideBaselinePx:340, guideXHeightPx:120, penWidthPx:16}`, settings `{variance:DEFAULT_VARIANCE, template:'ruled', xHeightPt:10, inkRgb:[0,0,0], maxPages:10}`, draft `''`. Apply to `composeSlice` (`text` from draft).
3. `getAll('raw')` → for each `[key,v]`: valid iff `validateRawSample(v).ok && \`${v.char}#${v.variantIndex}\` === key`; else push key to `quarantined`. `hydrateRaw`; if `meta.session` was absent set `nextSessionIndex = max(sessionIndex)+1`.
4. `fp = computeFingerprint(valid)`; `rec = loadPackCache()`; accept iff `rec && rec.engineSpec === ENGINE_SPEC_REV && rec.sourceFingerprint === fp && validateGlyphPack(rec.pack).ok` **or** (`rec.sourceFingerprint === 'imported' && valid.length === 0 && validateGlyphPack(rec.pack).ok`).
5. Accepted ⇒ `await client.loadPack(rec.pack)` (returns revision), `setPackFromCache`, status `ready`. Else if `valid.length > 0` ⇒ `rebuildNow()`. Else `packStatus='none'`.
6. Set `mode='write'`, cursor to the first missing required key, render. Subscribe persistence: `useAppStore.subscribe` → debounced (`SETTINGS_MS` 300) `put meta.settings` on any change of `{variance, template, xHeightPt, inkRgb, maxPages}` (shallow compare); debounced (`DRAFT_MS` 500) `put meta.draft` on `text`. Register `visibilitychange`/`pagehide` handlers that call `.flush()` on both debouncers. `rebuildNow` uses a token counter: results from superseded tokens are discarded; on success `put pack.current {engineSpec, sourceFingerprint: fp, pack, savedAt: new Date().toISOString()}`; on failure `packStatus='error'` + toast *"Couldn't rebuild your hand. Your drawings are safe."* with action `Retry`.

---

## 3. Imperative Canvas Controllers (`src/canvas/**`)

### 3.1 `viewport.ts`

`fitCanvas(c: HTMLCanvasElement, cssW: number, cssH: number): CanvasRenderingContext2D` sets `c.style.width/height`, `c.width = Math.round(cssW*dpr)`, `c.height = Math.round(cssH*dpr)`, returns a 2D context with `setTransform(dpr,0,0,dpr,0,0)`. `dpr = Math.min(window.devicePixelRatio || 1, 3)`. `toCss(e, rect) => ({ x: e.clientX - rect.left, y: e.clientY - rect.top })`. Raw samples store `dpr` for provenance only; no geometry uses it.

### 3.2 `CaptureController.ts`

```ts
export interface CaptureCallbacks {
  onStrokeEnd(points: RawStrokePoint[]): void;       // → store.pushStroke
  onDrawingChange(drawing: boolean): void;           // → store.setDraftState('drawing'|'drafted'|'idle')
  onLimit(kind: 'stroke-points' | 'strokes' | 'sample-points'): void;   // → toast "Stroke limit reached — accept or clear."
}
export class CaptureController {
  constructor(rawCanvas: HTMLCanvasElement, ribbonCanvas: HTMLCanvasElement, cb: CaptureCallbacks);
  setGuides(g: CaptureGuides, penWidthPx: number): void;
  setDraft(strokes: RawStrokePoint[][], ribbon: PathCmd[] | null, inkRgb: [number,number,number]): void;
  destroy(): void;
}
```
State machine: `idle → drawing → idle`, with fields `activeId: number|null`, `penActive: boolean`, `penUpAt: number`, `cur: RawStrokePoint[]`, `strokeCount`, `samplePoints`.
* **pointerdown** (on `rawCanvas`): ignore if `e.pointerType==='mouse' && e.button!==0`; ignore (and `preventDefault`) if `e.pointerType==='touch' && (penActive || performance.now()-penUpAt<300)`; ignore if `activeId!==null`; if `strokeCount>=16` ⇒ `cb.onLimit('strokes')`, return. If `pen`, set `penActive=true`. `rect = canvas.getBoundingClientRect()` (re-read on `ResizeObserver`). `setPointerCapture(e.pointerId)`; `activeId=e.pointerId`; `cur=[]`; push first point; `cb.onDrawingChange(true)`; ribbon layer `opacity:0` and raw layer `opacity:1` (CSS class), raw layer repainted with all draft strokes in raw polyline.
* **pointermove** (only `e.pointerId===activeId`): `const evs = e.getCoalescedEvents?.() ?? []; for (const ev of evs.length ? evs : [e]) push(ev)`. `push` builds `{x: ev.clientX-rect.left, y: ev.clientY-rect.top, pressure: ev.pressure, tiltX: ev.tiltX||0, tiltY: ev.tiltY||0, t: ev.timeStamp, pointerType: ev.pointerType as PointerKind, dpr: window.devicePixelRatio||1}`; skip if identical `(x,y)` to the previous point; `cur.length>=4000` ⇒ end the stroke (as pointerup) and `cb.onLimit('stroke-points')`; `samplePoints>=20000` ⇒ end stroke and `cb.onLimit('sample-points')`. New points are appended to a `pending` list; one `requestAnimationFrame` per frame draws only `pending` segments (`lineWidth=penWidthPx`, round cap/join, `rgba(28,25,23,.55)`) and clears `pending`.
* **pointerup / pointercancel / lostpointercapture** (same id): append final point if distinct (pointerup only); if `pointercancel` and `cur.length<2` discard; else `strokeCount++`, `samplePoints += cur.length`, `cb.onStrokeEnd(cur)`, `activeId=null`; if `pen` ⇒ `penActive=false; penUpAt=performance.now()`. A one-point stroke (tap) is kept (it becomes a dot).
* **Ribbon crossfade (pen-up):** the store updates `draftStrokes`; the view calls `PreviewDraft.build()` (below) and then `controller.setDraft(strokes, ribbon, inkRgb)`, which paints the ribbon on `ribbonCanvas` (`fill('nonzero')`, `inkRgb`) and toggles class `showRibbon` (`ribbonCanvas.opacity 1`, `rawCanvas.opacity 0`; both `transition: opacity var(--dur) var(--ease)`). `--dur=0` under reduced motion makes it instant. `PreviewDraft.build(sample, inkI)`: `t0=performance.now(); pack = buildGlyphPack([{...sample, variantIndex:0}], nowIso); out = glyphOutline(pack.glyphs[sample.char][0], pack.style.strokeWeight, inkI, 1)`; if `performance.now()-t0 > 8` set `title="Preview paused"` on the card and return `null` (raw polyline stays, ribbon stays hidden). The caller rebuilds on every pen-up and after Undo/Redo.
* Canvas boxes: both canvases are `min(640, available) × 480` via `fitCanvas`; `touch-action:none`; `destroy()` removes all listeners and cancels the frame.

### 3.3 `inkRenderer.ts`

`toPath2D(cmds: PathCmd[]): Path2D` maps `M→moveTo`, `C→bezierCurveTo`, `Z→closePath`. `class Path2DMemo { get(key: string, make: () => PathCmd[]): Path2D; clear(): void; retainInk(inkQ: number): void }` keyed `${glyphId}|${composite}|${bucket}|${inkQ}` (matches §1.2); `retainInk` drops keys with another `inkQ`. `drawGlyphThumb(ctx, glyph, W, inkRgb, box)` fits a glyph (`bbox`) into a `56×64` thumb with uniform scale.

### 3.4 `backdrop.ts`

`drawBackdrop(ctx, template: TemplateId, sheetCssW: number)`: `r = sheetCssW / PAGE.widthPt`; clears, fills `#FFFFFF`; reads **only** `TEMPLATE_SPECS`, `BACKDROP`, `PAGE` and uses the geometry/colors of §4 (top-down points × `r`). Ruled lines `lineWidth = 0.5*r` in `BACKDROP.ruleRgb`; margin `0.75*r`; grid `0.35*r`; dots radius `0.6*r`. It is an approximation by contract (UX §6.1).

### 3.5 `PreviewController.ts`

```ts
export class PreviewController {
  constructor(backdrop: HTMLCanvasElement, ink: HTMLCanvasElement, onBusy: (b: boolean) => void);
  setSheetWidth(cssW: number): void;                       // fitCanvas both + redraw backdrop
  update(input: PreviewInput, kind: 'text' | 'immediate'): void;
  destroy(): void;
}
interface PreviewInput { pack: GlyphPack | null; text: string; cfg: VarianceConfig; template: TemplateId; xHeightPt: number; inkRgb: [number,number,number]; onResult: (r: LayoutResult) => void }
```
* **Scheduling:** `kind==='text'` ⇒ `clearTimeout(timer); timer=setTimeout(mark,120)`; `'immediate'` ⇒ `mark()`. `mark(): dirty=true; if(!raf) raf=requestAnimationFrame(run)`. At most one run per frame; the latest `PreviewInput` wins.
* **run(frameStart):** if `deferNext` ⇒ `deferNext=false; raf=requestAnimationFrame(run); return`. `gen++`. Lazily (re)create `InstanceCache` on pack identity change, else `cache.reconfigure(cfg)`; if the cache was recreated or `seed/poolSize` changed `memo.clear()`, else `memo.retainInk(inkQ)`. `m=pageMetrics(template,xHeightPt)`, `spec=TEMPLATE_SPECS[template]`. `t0=performance.now(); layout=layoutText(text.slice(0,1500), pack, cfg, {lineWidthEm:m.lineWidthEm, linesPerPage:spec.linesPerPage, maxPages:1}, cache)`; if `performance.now()-t0>8` ⇒ `onBusy(true); deferNext=true` else `onBusy(false)`. `onResult(layout)`.
* **Painting (8 ms guard, no blank flashes):** paint into an offscreen back canvas `back` (same size). Iterate `layout.placements`, checking `performance.now()-sliceStart>8` every 64 placements; on overflow store the index and continue in the next `requestAnimationFrame` (abandon if `gen` changed). When complete, `ink.getContext('2d').drawImage(back,0,0)` in one call (clear + blit), then `onBusy(false)`.
* **Affine per placement** `p` with `S = xHeightPt/300`, `r = sheetCssW/595.276`, `row = p.line % spec.linesPerPage`, `base = spec.firstBaselineFromTopPt + row*spec.linePitchPt`: `P0=placementToLine(p,p.pivX,700)`, `Px=placementToLine(p,p.pivX+1,700)`, `Py=placementToLine(p,p.pivX,701)`; `k=S*r`; `m11=k(Px.x−P0.x)`, `m12=k(Px.y−P0.y)`, `m21=k(Py.x−P0.x)`, `m22=k(Py.y−P0.y)`; `cx=r(spec.textLeftPt+S·P0.x)`, `cy=r(base+S·P0.y)`; `e=cx−(m11·p.pivX+m21·700)`, `f=cy−(m12·p.pivX+m22·700)`. Then `ctx.setTransform(dpr·m11, dpr·m12, dpr·m21, dpr·m22, dpr·e, dpr·f); ctx.fillStyle=rgb(inkRgb); ctx.fill(memo.get(key, ()=>cache.outline(p.glyphId,p.composite,p.bucket).path))`. No y-flip (canvas is y-down like line space).
* **Ligatures:** for `p.ligatureFromPrev`, `ligatureOutline(lig, pack.style.strokeWeight, cfg.inkPressure)` is mapped point-wise `X=r(spec.textLeftPt+S·ℓx)`, `Y=r(base+S·ℓy)` into a fresh `Path2D` (`setTransform(dpr,0,0,dpr,0,0)`), filled `nonzero`; not memoized.
* Pack missing ⇒ clear the ink layer and call `onResult({placements:[],…})` with zero counts.

---

## 4. Vector PDF Template Emitters (`src/pdf/templates/*.ts`)

### 4.1 Shared constants (additive to `BACKDROP`, in `templates.ts`)

```ts
export const BACKDROP = {
  gridPitchPt: 14.173, cornellCueDividerXPt: 226.772, cornellSummaryRuleYPt: 640,
  ruleX0Pt: 28.346, ruleX1Pt: 566.929, marginXPt: 42.52, cornellTopPt: 70.866,
  ruleRgb: '#B8D0EB', marginRgb: '#E5A8A8', gridRgb: '#CCCCCC', dotRgb: '#BDBDBD',
  ruleWidthPt: 0.5, marginWidthPt: 0.75, gridWidthPt: 0.35, dotRadiusPt: 0.6,
} as const;
```
`yPdf = PAGE.heightPt − yTop`. `hex2rg(hex): string` → three fractions via `fmt(c/255, 3)`. Every emitter has signature `(spec: TemplateSpec) => string` (pure operator text, 2-decimal coordinates via `fmt(n,2)`, begins `q`, ends `Q`). `index.ts`: `buildTemplateXObject(ctx: PDFContext, id: TemplateId): PDFRef { const s = EMITTERS[id](TEMPLATE_SPECS[id]); return ctx.register(ctx.flateStream(s, { Type:'XObject', Subtype:'Form', FormType:1, BBox:[0,0,PAGE.widthPt,PAGE.heightPt], Resources:{} })); }`.

### 4.2 Emitters (exact operators)

* **ruled.ts:** `q` · `{ruleRgb} RG {0.5} w` · for `i=0..spec.linesPerPage−1` (24): `y = H − (spec.firstBaselineFromTopPt + i·spec.linePitchPt)`; `ruleX0 y m ruleX1 y l S` · `{marginRgb} RG 0.75 w {marginXPt} 0 m {marginXPt} {H} l S` · `Q`. (Rules sit on the baselines; the margin runs the full height.)
* **grid.ts:** `q {gridRgb} RG 0.35 w` · for `i=1..41`: `x = i·pitch`: `x 0 m x H l S` · for `j=1..58`: `y = H − j·pitch`: `0 y m W y l S` (`W = 595.276`) · `Q`. Interior lines only; baselines (multiples of 28.346 from `firstBaseline = 8·pitch`) coincide with grid lines.
* **dotted.ts:** `q {dotRgb} rg` · for `i=1..41`, `j=1..58`: circle at `(i·pitch, H − j·pitch)`, radius `0.6`, `κ=0.5522847498`, `c = κ·0.6`: `m (cx+r) cy · c (cx+r) (cy+c) (cx+c) (cy+r) cx (cy+r) · c (cx−c) (cy+r) (cx−r) (cy+c) (cx−r) cy · c (cx−r) (cy−c) (cx−c) (cy−r) cx (cy−r) · c (cx+c) (cy−r) (cx+r) (cy−c) (cx+r) cy · f` (nonzero) · `Q`.
* **cornell.ts:** `q {ruleRgb} RG 0.5 w` · notes-column rules for `i=0..17` (`spec.linesPerPage = 18`): `y = H − (113.385 + i·28.346)`: `226.772 y m 566.929 y l S` · cue divider `0.75 w 226.772 (H − 70.866) m 226.772 (H − 640) l S` · summary rule `28.346 (H − 640) m 566.929 (H − 640) l S` · `Q`. **No text operators, no fonts.** Writable area stays `TEMPLATE_SPECS.cornell` (`textLeftPt=240.945`).
* Page content order (Architecture §4.5): `q {ink rg} /Tpl Do …placements… Q`; because `Tpl` sets its own `RG/rg` inside its own `q…Q`, the ink color is re-set before the first `Do` of glyphs (`{inkRgb} rg` after `/Tpl Do`).

---

## 5. Built-In Demo Pack Generator (`src/demo/demoHand.ts`)

Lazy chunk, `export function buildDemoSamples(): RawGlyphSample[]` (default export not used). No imports except `import type { RawGlyphSample, RawStrokePoint } from '@engine'`; no randomness except a local `mulberry32`. `export const DEMO_CAPTURED_AT = '2000-01-01T00:00:00.000Z'` (re-exported via a tiny `src/demo/constants.ts` that the main bundle may import statically, so `selectIsDemo` does not load the chunk).

**Skeleton DSL.** `SK: Record<string,string>`; strokes split by `|`; tokens (units: x-height = 6, baseline y=0, y up, ascender/cap/digit height 12, descender −4): `M x y` start; `L x y` line; `C x1 y1 x2 y2 x y` cubic; `O cx cy rx ry a0 a1` ellipse arc (degrees, CCW positive, linear interpolation a0→a1). A stroke with only `M` is a one-point dot.

```ts
const SK: Record<string, string> = {
 a:'O 2.5 3 2.5 3 40 400|M 5 6 L 5 0', b:'M 0 12 L 0 0|O 2.5 3 2.5 3 160 -200', c:'O 2.5 3 2.5 3 45 315',
 d:'O 2.5 3 2.5 3 20 380|M 5 12 L 5 0', e:'M 0.2 3 L 4.9 3.2 O 2.5 3 2.5 3 15 315', f:'M 5 11 C 3 12.5 1.5 11 1.5 9 L 1.5 0|M 0 6 L 4 6',
 g:'O 2.5 3 2.5 3 40 400|M 5 6 L 5 -2 C 5 -4 1 -4.5 0.5 -2.5', h:'M 0 12 L 0 0|M 0 4 C 0.5 6.5 5 7 5 3 L 5 0', i:'M 2 6 L 2 0|M 2 8.5',
 j:'M 2 6 L 2 -2 C 2 -4 0.5 -4 0 -3|M 2 8.5', k:'M 0 12 L 0 0|M 4.5 6 L 0 2.5|M 1.5 3.6 L 5 0', l:'M 2 12 L 2 0',
 m:'M 0 6 L 0 0|M 0 4 C 0.5 6.5 3.5 6.5 3.5 3 L 3.5 0|M 3.5 4 C 4 6.5 7 6.5 7 3 L 7 0', n:'M 0 6 L 0 0|M 0 4 C 0.5 6.5 5 7 5 3 L 5 0',
 o:'O 2.5 3 2.5 3 80 440', p:'M 0 6 L 0 -4|O 2.5 3 2.5 3 160 -200', q:'O 2.5 3 2.5 3 40 400|M 5 6 L 5 -4', r:'M 0 6 L 0 0|M 0 3.5 C 0.5 6 3 6.5 4.5 5.5',
 s:'M 4.5 5 C 3.5 6.5 0.5 6 0.5 4.5 C 0.5 3 4.5 3 4.5 1.5 C 4.5 0 1 -0.3 0 1', t:'M 2 10 L 2 1 C 2 0 3.5 0 4 0.8|M 0 6 L 4.2 6',
 u:'M 0 6 L 0 2 C 0 -0.5 5 -0.5 5 2|M 5 6 L 5 0', v:'M 0 6 L 2.5 0 L 5 6', w:'M 0 6 L 1.5 0 L 3.5 5 L 5.5 0 L 7 6',
 x:'M 0 6 L 5 0|M 5 6 L 0 0', y:'M 0 6 L 2.5 0|M 5 6 L 1.5 -4', z:'M 0 6 L 5 6 L 0 0 L 5 0',
 A:'M 0 0 L 3.5 12 L 7 0|M 1.3 4 L 5.7 4', B:'M 0 12 L 0 0|M 0 12 C 6 12 6 6 0 6|M 0 6 C 7 6 7 0 0 0', C:'O 3.5 6 3.5 6 40 320',
 D:'M 0 12 L 0 0|M 0 12 C 8 12 8 0 0 0', E:'M 6 12 L 0 12 L 0 0 L 6 0|M 0 6 L 4.5 6', F:'M 6 12 L 0 12 L 0 0|M 0 6 L 4.5 6',
 G:'O 3.5 6 3.5 6 40 330|M 3.8 4.5 L 7 4.5', H:'M 0 12 L 0 0|M 7 12 L 7 0|M 0 6 L 7 6', I:'M 1 12 L 1 0', J:'M 5 12 L 5 3 C 5 -1 0 -1 0 2',
 K:'M 0 12 L 0 0|M 6.5 12 L 0 4.5|M 2 6.5 L 7 0', L:'M 0 12 L 0 0 L 6 0', M:'M 0 0 L 0 12 L 4 4 L 8 12 L 8 0', N:'M 0 0 L 0 12 L 7 0 L 7 12',
 O:'O 4 6 4 6 80 440', P:'M 0 0 L 0 12|M 0 12 C 7 12 7 5.5 0 5.5', Q:'O 4 6 4 6 80 440|M 4.5 3 L 8 -1',
 R:'M 0 0 L 0 12|M 0 12 C 7 12 7 5.5 0 5.5|M 2.5 5.5 L 6.5 0', S:'M 6 10 C 5.5 12.5 0.5 12.5 0.5 9 C 0.5 6 6.5 6 6.5 3 C 6.5 -0.5 1 -0.5 0 2.5',
 T:'M 0 12 L 7 12|M 3.5 12 L 3.5 0', U:'M 0 12 L 0 4 C 0 -1.5 7 -1.5 7 4 L 7 12', V:'M 0 12 L 3.5 0 L 7 12',
 W:'M 0 12 L 2 0 L 5 9 L 8 0 L 10 12', X:'M 0 12 L 7 0|M 7 12 L 0 0', Y:'M 0 12 L 3.5 6 L 7 12|M 3.5 6 L 3.5 0', Z:'M 0 12 L 7 12 L 0 0 L 7 0',
 '0':'O 3 6 3 6 80 440', '1':'M 0.5 9.5 L 3 12 L 3 0', '2':'M 0.5 9.5 C 1 12.5 6 12.5 6 9 C 6 6 0.5 3 0 0 L 6 0',
 '3':'M 0.5 11 C 3 13 6 11 4 6.5 C 7.5 6 6.5 -1 0 1', '4':'M 4.5 0 L 4.5 12 L 0 3.5 L 6.5 3.5',
 '5':'M 5.5 12 L 1 12 L 0.5 6.5 C 4 8 7 5 5.5 2 C 4 -0.5 1 -0.5 0 1.5', '6':'M 4.5 12 C 1 9 0 5 0 3.5|O 3 3.5 3 3.5 180 540',
 '7':'M 0 12 L 6 12 L 2 0', '8':'O 3 9 2.5 3 90 450|O 3 3 3 3 90 450', '9':'O 3 8.5 3 3.5 -80 280|M 6 8.5 C 6 4 5 1 2 0',
 '.':'M 1 0', ',':'M 1 0.5 L 0.2 -1.8', ';':'M 1 5|M 1 1 L 0.2 -1.5', ':':'M 1 5|M 1 0', '!':'M 1 12 L 1 3.5|M 1 0',
 '?':'M 0 10 C 0.5 13 5 13 5 9.5 C 5 7 2.5 6.5 2.5 4|M 2.5 0', "'":'M 1 12 L 0.5 9', '"':'M 1 12 L 0.5 9|M 3 12 L 2.5 9',
 '-':'M 0 3 L 4 3', '(':'M 3 12 C 0 8 0 2 3 -2', ')':'M 0 12 C 3 8 3 2 0 -2', '/':'M 0 -1 L 4 12',
};
```

**Expansion (deterministic).** Iterate `REQUIRED_KEYS` order (`sessionIndex = 0..87`). Per key: parse DSL → polylines by flattening (`L` kept; `C` and `O` sampled so adjacent points ≈ 0.3 unit apart, minimum 8 steps per arc/cubic). Variant 1/2 (keys of `e t a o i n s`): `rng = mulberry32(0x00DE0000 + charCode*4 + variantIndex)`; x-scale `1 + (variantIndex===1 ? 0.06 : -0.05)`; every flattened point gets `(dx,dy) = ((rng()−.5)·0.24, (rng()−.5)·0.24)` units; variant 0 has no jitter. **Projection** (10° slant, `T = Math.tan(10·π/180)`): `xPx = Math.round(100 + 20·(x·sx + T·y))`, `yPx = Math.round(340 − 20·y)`; consecutive equal `(xPx,yPx)` points are dropped (a stroke keeps ≥ 1 point). Point fields: `pressure: 0.5, tiltX: 0, tiltY: 0, pointerType: 'mouse', dpr: 1`, `t = 1000 + 8·n` with `n` incrementing over every point of the sample (non-decreasing). Sample fields: `char`, `variantIndex`, `sessionIndex`, `guides: { ascenderY: 100, xHeightY: 220, baselineY: 340, descenderY: 420 }`, `penWidthPx: 16`, `strokes`, `capturedAt: DEMO_CAPTURED_AT`. All demo points satisfy `RAW_PX` limits (x ≤ 100+20·(10+2.1)≈342 px, y ∈ [100, 420]) and the per-stroke/sample point caps.

**Pipeline** (`captureSlice.loadDemo`, UX §7.6): confirm dialog if non-demo raw samples exist → `const { buildDemoSamples } = await import('../../demo/demoHand')` → `samples.forEach(validateRawSample)` (all must be ok; else toast and abort) → `replaceAll(db, { raw: samples, pack: null, session: { nextSessionIndex: 88, guideBaselinePx: 340, guideXHeightPx: 120, penWidthPx: 16 } })` → `replaceRaw` → `rebuildNow()` (worker `buildGlyphPack`) → if `text.trim()===''` set `SAMPLE_TEXT` ("The quick brown fox jumps over the lazy dog.") and `mode='write'`. Budget: chunk ≤ 14 KiB gzip (`check-size.mjs` gets a `demoHand-*.js` entry).

---

## 6. Phased Vertical-Slice Implementation Plan

Dependency graph: **S1 → S2 → { S3 ∥ S4 ∥ S5 } → S6**. A slice owns its files exclusively; no file appears in two slices. Common exit gate for every slice: `npm run lint && npm run typecheck && npm test` green, plus the slice-specific checks. `src/engine/index.ts` is owned by **S2** (S1 tests import relative paths).

**S1 — Foundation + Normalization Engine.** *Files:* all config (`package.json`, `tsconfig*.json`, `eslint.config.js`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `public/_headers`, `scripts/check-size.mjs`, `.github/workflows/ci.yml`, `docs/*`); `src/engine/{constants,limits,types,rng,mathUtil,guides,charset}.ts`; `src/engine/normalize/*` (all 11 files); `src/engine/ink/{catmullRom,width,ribbon}.ts`; `src/engine/schema/validate.ts`; `src/styles/tokens.css`; `tests/fixtures/{testVectors,samplePack}.ts`; `tests/engine/{tv1.normalization,tv2.curves,charset,pipeline}.test.ts`; `tests/architecture/purity.test.ts`. *Exit:* TV1A–1C, TV2A–2C within 1e-4; `REQUIRED_KEYS.length===88`; pipeline invariants (G1 continuity, 32-row profiles, advance formula, dense re-indexing §1.7); purity test passes; `ENGINE_SPEC_REV='MathEngine/1'`.

**S2 — Variance, Layout, Schema, Barrel.** *Files:* `src/engine/variance/*` (6 files), `src/engine/layout/{text,layoutText,templates,instanceCache}.ts`, `src/engine/ink/ligatureOutline.ts`, `src/engine/schema/{glyphPackSchema,rawSampleSchema,packFile}.ts`, `src/engine/index.ts`; `tests/engine/{tv3.variance,determinism,layout}.test.ts`, `tests/schema/*.test.ts`. *Exit:* TV3A–3F (hash32 integers exact); determinism and wrap-retry tests; `InstanceCache` test proving a changed `inkPressure` keeps instance identity (`===`) and a changed `seed` does not; `normalizeChar` dash fallback test; hostile-input suite; barrel matches §1.1 (a `tests/architecture/barrel.test.ts` imports every listed name).

**S3 — PDF + Worker.** *Files:* `src/pdf/**` (including `templates/*`), `src/worker/{protocol,client,pdf.worker,dispatcher,checkpoint}.ts`, `src/worker/jobs/*`; `tests/pdf/*.test.ts`, `tests/worker/*.test.ts`. *Exit:* §6.3 matrix equals `placementToLine`; N placements of one glyph ⇒ 1 XObject; two runs byte-identical; 10-page fixture ≤ 2,000,000 bytes; template tests assert exact operator output for each of the four templates (no `Tj`/`BT` in Cornell); dispatcher ordering/cancel/BUSY and client abort/watchdog tests green; `node scripts/check-size.mjs` worker budget (≤ 280 KiB gz) and "pdf-lib absent from main chunk".

**S4 — Store + Persistence.** *Files:* `src/store/{db,persistence,boot,debounce,timing,download,useAppStore}.ts`, `src/store/slices/*.ts` (5 files), `src/demo/constants.ts`; `tests/store/persistence.test.ts`, `tests/store/slices.test.ts` (fake-indexeddb + fake `WorkerClient`). *Exit:* fingerprint invalidation, `engineSpec` mismatch ⇒ rebuild, corrupt `pack` ⇒ rebuild, atomic `replaceAll`; debounce timings (300/500/400) under fake timers; manual-only commit (no write on `pushStroke`; undo stack cleared on commit and navigation); `rebuildNow` token discards stale results.

**S5 — Canvas Controllers + UI Primitives.** *Files:* `src/canvas/{viewport,CaptureController,inkRenderer,PreviewController,backdrop}.ts`; `src/components/ui/*`, `src/components/shell/{Banner,ToastHost,ConfirmDialog}.tsx` and their `*.module.css`; `tests/canvas/{capture,preview}.test.ts` (jsdom-free: controllers take injected canvases/clock stubs). *Exit:* palm-rejection, caps (4,000/16/20,000), coalesced-event expansion, CSS-px extraction tests; `PreviewController` coalesces N `update` calls into 1 layout per frame, honors the 120 ms text debounce, `Path2DMemo.retainInk` keeps non-ink entries; affine test: `(pivX,700)` lands on `placementToLine` output scaled by `S·r`; main-chunk budget still ≤ 130 KiB gz.

**S6 — Views, Demo, Integration.** *Files:* `src/main.tsx`, `src/components/{App,ErrorBoundary}.tsx`, `src/components/capture/*`, `src/components/compose/*`, `src/components/export/*`, `src/components/shell/{TopBar,ModeSwitcher,GlyphPill,FileMenu}.tsx`, `src/demo/demoHand.ts`, `tests/demo/demoHand.test.ts`, `tests/e2e/flow.test.ts` (store + fake worker). *Exit:* demo emits exactly 88 valid samples, deterministic across runs, measured stem slant of `l` within ±2° of 10°, and `buildGlyphPack` yields all 88 required keys; every UX §10 acceptance item is mapped to a test or a manual checklist line in `docs/CHANGELOG.md`; §1.6 locks verified (blur-on-click test; truncation caption test); `npm run build && node scripts/check-size.mjs` passes all budgets (main ≤ 130 KiB gz, worker ≤ 280 KiB gz, demo ≤ 14 KiB gz, CSS ≤ 14 KiB gz); CI workflow green.

*End of DesignDoc.*
