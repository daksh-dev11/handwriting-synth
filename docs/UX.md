# UX.md — Handwriting Synthesis App: UI & UX Specification

**Status:** Normative. Companion to `MathEngine.md` (math, constants) and `Architecture.md` (structure, threading, persistence, limits). Neither is amended except by the additive items in §3.2 and §10. Every number below is a CSS pixel unless marked `pt` or `em`. Runtime dependencies stay `react`, `react-dom`, `pdf-lib`, `zustand`. All styling is CSS Modules plus one `tokens.css`. There are no icon fonts, no UI kit, and no images; icons are inline SVG (16×16, `stroke-width: 1.5`, `currentColor`).

**Principles.** (1) The app opens straight into the workspace, with no landing page, hero, or modal on first paint. (2) Color is mostly paper and charcoal. The accent appears only where §1.2 lists it. (3) Geometry is never re-derived in the UI. Everything visual comes from `@engine` (`PathCmd[]`, `placementToLine`, `TEMPLATE_SPECS`). (4) Every state has a visible, non-blocking representation, and there are no dead ends.

---

## 1. Design Tokens (`src/styles/tokens.css`, imported once in `main.tsx`)

### 1.1 Tokens

```css
:root {
  color-scheme: light;
  /* surfaces */
  --desk: #F5F3EE;  --sheet: #FAF9F6;  --paper: #FFFFFF;  --track: #ECE9E2;
  --hairline: rgba(28, 25, 23, 0.09);  --hairline-strong: rgba(28, 25, 23, 0.16);
  /* text */
  --ink: #1C1917;  --ink-2: #6E6A63;  --ink-3: #9A958C;            /* ink-3: placeholders, disabled only */
  /* accent (usage list in §1.2) */
  --accent: #1B56DB;  --accent-hover: #1647B5;  --accent-press: #123B97;  --on-accent: #FFFFFF;
  --focus-ring: 0 0 0 3px rgba(27, 86, 219, 0.28);
  /* status (text and icon color only, never fills) */
  --warn: #8A5A12;  --danger: #B3261E;
  /* type */
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, monospace;
  --fs-11: 11px/14px var(--font);  --fs-12: 12px/16px var(--font);  --fs-13: 13px/18px var(--font);
  --fs-15: 15px/22px var(--font);  --fs-20: 20px/26px var(--font);  --fs-prompt: 500 56px/1 var(--font);
  /* shape & space (4-pt scale) */
  --r-6: 6px;  --r-8: 8px;  --r-12: 12px;  --r-pill: 999px;
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;
  --shadow-sheet: 0 1px 2px rgba(28, 25, 23, 0.06), 0 10px 24px -14px rgba(28, 25, 23, 0.20);
  --shadow-pop: 0 1px 2px rgba(28, 25, 23, 0.08), 0 12px 28px -12px rgba(28, 25, 23, 0.24);
  /* motion */
  --ease: cubic-bezier(0.22, 1, 0.36, 1);  --dur: 180ms;
  /* layout */
  --bar-h: 48px;  --rail-w: 280px;  --card-w: 640px;  --card-h: 480px;  --gallery-h: 168px;
  --z-bar: 20;  --z-rail: 15;  --z-pop: 40;  --z-modal: 50;  --z-toast: 60;
}
html, body, #root { height: 100%; margin: 0; background: var(--desk); color: var(--ink); font: var(--fs-13); }
.num { font-variant-numeric: tabular-nums; }                   /* applied to every readout, counter, and progress label */
@media (prefers-reduced-motion: reduce) { :root { --dur: 0ms; } }
```

### 1.2 Accent allow-list (anything else uses `--ink`, `--track`, or `--paper`)

Accent is used for exactly six things: (1) primary button fill (`Export PDF`, `Accept`, dialog confirm); (2) a switch's ON track; (3) the focus ring; (4) the determinate progress fill; (5) the selected ring on a template or ink swatch; (6) the 2 px underline on the current item in the queue strip. The selected segment of a segmented control stays neutral (white thumb, `--ink` text).

### 1.3 Control specs

| Control | Spec |
|---|---|
| Button | 32 h (44 on `pointer: coarse`), radius 6, padding `0 12px`, `--fs-13` weight 500. Primary: `--accent` fill, `--on-accent` text, hover `--accent-hover`, active `--accent-press`. Secondary: `--paper` fill, 1px `--hairline-strong` border. Ghost: transparent, hover `--track`. Disabled: opacity 0.45, `cursor: default`, tooltip says why. |
| Segmented | Track `--track`, radius 8, padding 2, height 28. Thumb `--paper`, radius 6, `box-shadow: 0 0 0 1px var(--hairline), 0 1px 1px rgba(28,25,23,.08)`. The thumb is one absolutely positioned element sliding via `transform: translateX()` over `--dur var(--ease)`. Role `radiogroup`; arrow keys move selection. |
| Slider | Native `<input type=range>` restyled. Track 4 px `--track`, radius 2, fill `--ink` through `background: linear-gradient(to right, var(--ink) var(--fill), transparent var(--fill))`. Thumb 16 px `--paper` circle, 1px `--hairline-strong` border, shadow `0 1px 2px rgba(28,25,23,.18)`. Focus-visible gets the ring. Readout right-aligned, `.num`, `--ink-2`. |
| Switch | 32×20 track. OFF `--track`, ON `--accent`. 16 px white knob slides 12 px. |
| Pill | Height 24, radius 999, `--track` fill, `--fs-12`, padding `0 10px`. |
| Popover / menu | `--paper`, 1px `--hairline`, radius 12, `--shadow-pop`, enters with opacity 0→1 and `translateY(-4px)→0` over `--dur`. |
| Banner | Full pane width, `--paper`, 1px `--hairline`, radius 8, 3 px left border in `currentColor`. Icon and title take `--warn` or `--danger`; body stays `--ink`. |
| Toast | Bottom-center, `--ink` fill, `--paper` text, radius 8, 4 s auto-dismiss (8 s if it has an action). Hover pauses the timer. Stack of at most 3. |

```css
.segThumb { transition: transform var(--dur) var(--ease); }
.slider::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(to right, var(--ink) var(--fill), var(--track) var(--fill)); }
.slider::-webkit-slider-thumb { width: 16px; height: 16px; margin-top: -6px; border-radius: 50%; background: var(--paper); border: 1px solid var(--hairline-strong); box-shadow: 0 1px 2px rgba(28,25,23,.18); -webkit-appearance: none; }
.slider:focus-visible { outline: none; } .slider:focus-visible::-webkit-slider-thumb { box-shadow: var(--focus-ring); }
```

---

## 2. Application Shell

### 2.1 Top bar (`TopBar`, 48 px, `--sheet` background, 1px bottom `--hairline`, `z-index: var(--z-bar)`)

| Zone | Content |
|---|---|
| Left | Title "Handwriting" (`--fs-15`, weight 600) and a 6 px divider. Beside it, the **mode switcher** (segmented, width 288): `1. Calibrate Hand` \| `2. Write & Export`. |
| Center | **Glyph pill** `68 / 88 glyphs`. It counts distinct required capture keys that exist in IndexedDB and are valid, over the required total (§5.1). A 2 px bar along the pill's bottom edge fills `--ink` to that ratio. At 88/88 it reads `✓ Hand complete`. While a rebuild is pending or running it appends ` · Updating…` in `--ink-2`. Click: go to Calibrate with the gallery open. Tooltip lists the optional-symbol count (`+4 optional`). |
| Right | `Load Demo Hand` (secondary button) and `Import / Export .json` (secondary button with a chevron, opens the menu in §7.5). Below 900 px both collapse into one `…` button whose menu holds the same items. |

The top bar has no other chrome: no profile, no help button, no logo mark. A persistent `Banner` (only if IndexedDB is unavailable) sits directly under it: *"Changes won't be saved in this browser session. Export a .json to keep your hand."*

### 2.2 Workspace region

`position: fixed; inset: var(--bar-h) 0 0 0; background: var(--desk)`. Exactly one view is mounted at a time (`mode` from `uiSlice`). Switching modes crossfades the outgoing and incoming view over `--dur`. The incoming view moves from `translateY(4px)` to 0. Both views keep their local state in the store, so switching loses nothing.

---

## 3. Component Hierarchy

```
App
├─ ErrorBoundary                     # fallback: paper card "Something went wrong — your drawings are safe." [Reload] (raw data lives in IndexedDB)
│  ├─ TopBar { ModeSwitcher, GlyphPill, DemoButton, FileMenu }
│  ├─ PersistenceBanner
│  ├─ CaptureView (mode 1)
│  │  ├─ CaptureWizard { PromptHeader, QueueStrip, ActionRow, OptionalGate, CompleteCard }
│  │  ├─ CaptureCanvas { <canvas> hosting CaptureController, GuideLabels, GuidesButton ▸ GuideCalibration (popover) }
│  │  └─ GlyphGallery (drawer) { GroupSection[] ▸ GlyphThumb[] }
│  ├─ ComposeView (mode 2)
│  │  ├─ TextEditor { <textarea>, CharCounter, SampleTextButton }
│  │  ├─ PreviewPane { PreviewToolbar { PageChip, InspectorToggle, ExportButton }, ExportPanel { ProgressStrip, ResultStrip, WarningBanner[] }, LivePreview { sheet <canvas> ×2 }, ZeroStateCard, MissingGlyphPill }
│  │  └─ InspectorRail { VariancePanel, TemplatePicker, InkPicker, SizeControls }
│  ├─ PackImportExportDialog
│  ├─ ConfirmDialog
│  └─ ToastHost
```

### 3.1 Files added to the `Architecture.md` §1 tree (additive; no new dependencies, no layer-rule changes)

`src/styles/tokens.css`; `src/components/shell/{TopBar,ModeSwitcher,GlyphPill,FileMenu,ToastHost,ConfirmDialog,Banner}.tsx` plus `*.module.css` beside every component; `src/components/ui/{Button,Segmented,Slider,Switch,Popover,Icon}.tsx`; `src/components/capture/{PromptHeader,QueueStrip,OptionalGate,CompleteCard}.tsx`; `src/components/compose/{InkPicker,SizeControls,MissingGlyphPill,ZeroStateCard}.tsx`; `src/components/export/{ProgressStrip,ResultStrip,WarningBanner}.tsx`; `src/store/slices/uiSlice.ts`; `src/canvas/backdrop.ts` (draws the template backdrop from `TEMPLATE_SPECS`); `src/demo/demoHand.ts` (§7.6). Imports obey the `components` row of the `Architecture.md` §2.1 matrix. `ui/*` and `shell/*` import only `react`.

### 3.2 Additive engine export

`src/engine/layout/templates.ts` also exports `BACKDROP = { gridPitchPt: 14.173, cornellCueDividerXPt: 226.772, cornellSummaryRuleYPt: 640 } as const`. The preview backdrop (`canvas/backdrop.ts`) and `pdf/templates/*` both read it, so the two cannot drift. These are pure numbers and are cosmetic only. They never feed layout (`Architecture.md` §3.4).

---

## 4. Store Additions and State Machines

`uiSlice`: `{ mode: 'calibrate' | 'write'; inspectorOpen: boolean; galleryOpen: boolean; toasts: Toast[]; dismissedMissing: string[]; dialog: null | 'pack' | 'confirm-demo' | 'confirm-import' }`. None of it is persisted. Persisted settings stay exactly `SettingsMeta` and `SessionMeta` from `Architecture.md` §3.3.

Derived flags, never stored: `isFirstVisit = rawCount === 0 && pack === null`; `isDemo = every raw sample has capturedAt === DEMO_CAPTURED_AT ('2000-01-01T00:00:00.000Z')`; `canExport = pack?.glyphs has ≥ 1 key && text.trim() !== '' && job.phase === 'idle'`.

| Machine | States → transitions |
|---|---|
| **Draft glyph** (`captureSlice`) | `idle` —pointerdown→ `drawing` —pointerup→ `drafted` (≥ 1 stroke; ribbon crossfade, §5.3) —pointerdown→ `drawing` (adds stroke) · `drafted` —Accept→ `committing` —tx ok→ `idle` (cursor advanced) · `committing` —validate/IDB error→ `drafted` + toast · `drafted` —Clear→ `idle`. A draft is discarded on glyph navigation (`←`, `→`, gallery click, mode switch). |
| **Pack** (`packSlice.packStatus`) | `none` → `building` (boot or 400 ms after the last commit) → `ready`; `ready` —commit→ `stale` (still renders the old pack) → `building`; any → `error` (toast: *"Couldn't rebuild your hand. Your drawings are safe."* + Retry). |
| **Job** (`jobSlice.phase`) | `idle` —Export→ `validate` → `layout` → `emit` → `finalize` → `done`; any running phase —Cancel/AbortError→ `cancelled` → `idle`; any —error→ `failed`. `done`, `cancelled`, and `failed` render a strip (§7.3) and return to `idle` on the next Export or after Dismiss. Progress fraction is monotonic (`Architecture.md` §4.2). |

---

## 5. View 1 — Guided Glyph Calibration Studio

### 5.1 Capture queue (`charset.ts` supplies the characters; the order below is fixed)

| # | Group | Keys | Required |
|---|---|---|---|
| 1 | Lowercase | `a`–`z`, variant 0 | 26 |
| 2 | Variants | `e t a o i n s`, variants 1 and 2 (prompt reads "e · 2 of 3") | 14 |
| 3 | Capitals | `A`–`Z` | 26 |
| 4 | Digits | `0`–`9` | 10 |
| 5 | Punctuation | `. , ; : ! ? ' " - ( ) /` | 12 |
| 6 | Optional symbols | `` ` _ [ ] { } + = < > ~ * ^ \ \| `` | 0 of 15 |

Total required is **88** and drives the glyph pill. The cursor starts at the first missing required key, and `→` / `←` move through the order. When the cursor reaches group 6, `OptionalGate` replaces the canvas: *"Optional symbols — 15 left"* with `Draw them` (secondary) and `Finish` (primary). `Finish` shows `CompleteCard` ("Your hand is ready.") with a primary button `Write & Export ⌘2`. `CompleteCard` also appears automatically when the 88th required glyph is accepted. Characters missing from the text (jumped to from `MissingGlyphPill`) become a transient "Custom" queue item with `variantIndex 0`. Their hint reads *"Place it on the guide lines; size and position are kept as drawn."*

### 5.2 Layout (centered column, `max-width: 720`, top padding 24; the gallery drawer docks below it)

1. `PromptHeader` (row, `--card-w` wide): prompt glyph (`--fs-prompt`, `--ink`), then title *"Draw "e""* and sub-label *"Variant 2 of 3 · 27 of 88"* (`.num`, `--ink-2`). Below that is a one-line hint, chosen by `glyphClassOf`: letters/caps/digits *"Tops and bottoms follow the guide lines."*; `punct`/`symbol` in the N3 table *"Position is auto-corrected — just draw the shape."*
2. `QueueStrip`: a 24 px row of 88 tiny ticks (2×10, gap 2), grouped with 8 px gaps. Done ticks are `--ink`, pending ticks `--track`, and the current tick has a 2 px `--accent` underline. Click jumps to that key.
3. **Paper card** (`CaptureCanvas`): `--card-w × --card-h`, `--paper` fill, radius 12, 1px `--hairline`, `--shadow-sheet`. It shrinks horizontally to the available width on narrow screens (height stays fixed). The canvas backing store is `css × devicePixelRatio`, but every coordinate is `clientX − rect.left` in CSS px (`Architecture.md` §0.1). The canvas uses `touch-action: none`, `setPointerCapture`, and `getCoalescedEvents()`, with one `requestAnimationFrame` redraw of the newest segment only.
4. `ActionRow` (centered, gap 8): `Clear` (ghost, `Esc`), `Undo stroke` (ghost, `⌫`), `Skip` (ghost, `→`), `Accept ↵` (primary).

### 5.3 Guides and calibration

Guides are drawn from `computeGuides(gB, xhPx)` (`MathEngine.md` §0.4): `gX = gB − xh`, `gA = gB − 2·xh`, `gD = gB + (2/3)·xh`. Defaults are `gB = 340`, `xhPx = 120`, giving 100 / 220 / 340 / 420 exactly. The canvas is `--card-h` (480) tall, so the controls are constrained to keep all four guides on the card.

| Line | Style |
|---|---|
| `gA` asc, `gD` desc | 1px solid `rgba(28,25,23,.10)` |
| `gX` x | 1px dashed (4 4) `rgba(28,25,23,.14)` |
| `gB` base | 1px solid `rgba(28,25,23,.22)` |
| Labels `asc` `x` `base` `desc` | `--fs-11`, `--ink-3`, `left: 10px`, vertically centered on each line, `pointer-events: none`, not part of the capture rect |

`GuidesButton` (top-right of the card, ghost, 24 px, ruler icon) opens `GuideCalibration` (popover, 260 wide), with three sliders and a `Reset` button:

| Control | Range / step | Rule |
|---|---|---|
| Size (`xhPx`) | 60–160, step 2 | Readout `120 px`. Writes `SessionMeta.guideXHeightPx`. |
| Baseline (`gB`) | `[2·xh + 10, 470 − (2/3)·xh]`, rounded, step 1 | Re-clamped whenever `xh` changes. Writes `guideBaselinePx`. |
| Pen (`penWidthPx`) | 6–32, step 1 | Readout `16 px`; the live pen preview dot (24×24) shows the diameter. Writes `penWidthPx`. Hint: *"Weight of your writing in every export."* |

The footer note reads *"Changes apply to glyphs you draw next."* (every `RawGlyphSample` stores its own guides). The raw preview stroke uses `lineWidth = penWidthPx`, round caps and joins, `rgba(28,25,23,.55)`.

### 5.4 Immediate feedback (raw → ribbon)

* **While drawing:** raw polyline on the canvas, incremental.
* **On pen-up** (`drafted`): a draft `RawGlyphSample` is built from the strokes so far, and `buildGlyphPack([draft], nowIso)` runs on the main thread. It is a single glyph, pure engine code, and has no side effects. The draft's `fitted strokes → ribbonOutline (inkI = inkPressure slider)` produce `PathCmd[]`, which `inkRenderer` draws as a filled `Path2D` in `inkRgb`. The raw polyline fades from opacity 1 to 0 while the ribbon fades from 0 to 1, over `--dur var(--ease)` (a crossfade, not a point-wise morph). If the draft build takes longer than 8 ms, the preview falls back to the raw polyline with the tooltip "Preview paused" for that glyph, and nothing else changes. A new stroke is always drawable immediately; the ribbon is re-fitted on the next pen-up.
* **On Accept:** the committed glyph holds for one frame, then the card content slides 8 px left and fades out over `--dur` while the next prompt's card fades in from 8 px right. The live region announces *"Saved e, variant 2 of 3. 69 of 88."*

### 5.5 Commit pipeline (UI side)

`Accept` with zero strokes shakes the card (`translateX ±3 px`, 2 cycles, `--dur`) and does nothing else. Otherwise: build `RawGlyphSample { char, variantIndex, sessionIndex: nextSessionIndex, guides, penWidthPx, strokes, capturedAt: new Date().toISOString() }` (the clock is read in the UI layer only), run `validateRawSample`, then `saveRawSample` in one transaction together with `meta.session`, increment `nextSessionIndex`, advance the cursor, and schedule the 400 ms debounced rebuild. The first successful commit calls `navigator.storage.persist()` once. Capture-time caps (4,000 points per stroke, 16 strokes, 20,000 points per sample) auto-end the stroke or ignore further strokes, with the toast *"Stroke limit reached — accept or clear."* The capture view ignores `touch` pointers while a `pen` pointer is active (palm rejection).

### 5.6 `GlyphGallery` (bottom drawer, `--gallery-h` 168, collapsible)

* Header (32 px): "Glyphs" label, `68 / 88`, `Imported pack (no raw samples)` when applicable, and a chevron toggle (`G`). Collapsed state is 32 px; the drawer animates its height over `--dur`.
* Body scrolls horizontally per group with sticky group titles, e.g. *"Lowercase 26/26"*. Thumb: 56×64, `--paper`, radius 6, 1px `--hairline`.
  * **Captured:** the ink drawn with `inkRenderer` from the pack (or the raw polyline until `pack-ready`).
  * **Empty:** the character in `--ink-3` on `--track`.
  * **Unreadable (quarantined record):** dashed 1px `--hairline-strong` border and the caption `redo` in `--danger`.
  * **Variant slots:** three 4 px dots under the thumb (filled `--ink` when captured).
  * **Current:** 2 px `--accent` underline.
* Click or `Enter` on a thumb sets the cursor and loads that glyph, so drawing and Accepting **replaces** the record with a new `sessionIndex` (`Architecture.md` §8.7). There is no delete action, because redrawing is the only edit. The drawer is a roving-tabindex grid with arrow-key navigation.

---

## 6. View 2 — Real-Time Synthesis Playground

### 6.1 Desktop layout (≥ 1100 px; `display: grid`)

`grid-template-columns: 38fr 62fr var(--rail-w)` when the rail is open; otherwise `38fr 62fr 0`. The column track animates over `--dur`; the rail slides off-canvas and is `inert` when closed.

* **Left, `TextEditor`:** `--sheet` background, 1px right hairline, padding 24. A borderless `<textarea>` in `--fs-15`, line-height 28, `spellcheck=false`, `maxLength = LIMITS.MAX_TEXT_CHARS (30000)`, placeholder *"Type or paste what you'd like to write by hand…"*. Footer row: `SampleTextButton` (ghost; inserts *"The quick brown fox jumps over the lazy dog."* only when the editor is empty) and the counter `1,284 / 30,000` (`.num`, `--ink-2`, turns `--warn` at ≥ 27,000). The draft is saved to `meta.draft` (debounced 500 ms).
* **Right, `PreviewPane`:** `--desk`, padding 24, vertical scroll. `PreviewToolbar` (32 h): `PageChip` *"Page 1 · ≈ 3 pages"* (`.num`; the estimate is `ceil(chars / 1500)`, clamped to `maxPages`, and labelled approximate in its tooltip), a spacer, `InspectorToggle` (ghost, sliders icon, `⌘\`), and `Export PDF` (primary, `⌘↵`). Below it, `ExportPanel`'s strips (§7.3) and then the sheet.
* **Sheet (`LivePreview`):** an A4 `--paper` card (aspect `595.276 : 841.89`), width `min(100%, 720px)`, centered, radius 4, `--shadow-sheet`. Two stacked canvases: a **backdrop** (`canvas/backdrop.ts`: ruled lines on each baseline at `--hairline-strong`; grid lines every `BACKDROP.gridPitchPt` at `rgba(28,25,23,.10)`; dots on the same pitch at `rgba(28,25,23,.28)`; Cornell cue divider at `cornellCueDividerXPt` and summary rule at `cornellSummaryRuleYPt`, with no text labels) and an **ink** layer. The backdrop is an approximation; the PDF is authoritative.
* **Rail (`InspectorRail`):** 280 px, `--sheet`, 1px left hairline, scrolls independently, padding 16; groups separated by 1px hairlines with 11 px uppercase `--ink-2` titles (letter-spacing .04em).

### 6.2 Preview behavior (`PreviewController`)

* Trigger: any change to text, `VarianceConfig`, template, `xHeightPt`, `inkRgb`, or pack, coalesced to one run per animation frame and debounced 120 ms after the last keystroke.
* Call: `layoutText(text.slice(0, 1500), pack, cfg, { lineWidthEm: m.lineWidthEm, linesPerPage: spec.linesPerPage, maxPages: 1 }, cache)` with `m = pageMetrics(template, xHeightPt)`. The `InstanceCache` is rebuilt only when the pack or `cfg` changes.
* Drawing: each placement's cached outline `Path2D` is drawn under an affine built from `placementToLine` evaluated at local `(pivX, 700)`, `(pivX + 1, 700)`, `(pivX, 701)` (origin and basis vectors), scaled by `S = xHeightPt / 300` and `sheetPx / 595.276`. Ligature outlines (semi-cursive) are drawn directly in line space. The layer's geometry is never re-derived.
* Cost rule: the 8 ms budget from `Architecture.md` §4.7 applies to canvas painting. If a layout run exceeds 8 ms, the sheet keeps the previous frame until it completes (no blank flashes), and the `PageChip` shows a 12 px spinner for the duration. Layout never runs inside a capture stroke.
* Seed re-roll or any slider change redraws instantly. Only the re-roll fades the ink layer (opacity .6→1 over `--dur`).

### 6.3 `VariancePanel` (order is fixed)

| Row | Control | Range | Default | Readout |
|---|---|---|---|---|
| Slant jitter | Slider | 0–1, step .01 | 0.50 | `0.50` |
| Baseline drift | Slider | 0–1, step .01 | 0.50 | `0.50` |
| Spacing variance | Slider | 0–1, step .01 | 0.50 | `0.50` |
| Ink pressure | Slider | 0–1, step .01 | 0.50 | `0.50` |
| Variants per glyph (`poolSize`) | Slider, 4 stops with tick marks | 1–4, step 1 | 4 | `4` |
| Style (`mode`) | Segmented | `Print` \| `Semi-cursive` | Print | — |
| Seed | `<input inputmode=numeric>` (`--mono`, `.num`) + `Re-roll` (secondary, dice icon, `⌥R`) | uint32 | 12345 | — |

Helper text under `poolSize` (`--fs-11`, `--ink-2`): *"Lower values make smaller PDFs."* Re-roll uses `crypto.getRandomValues` (allowed in the UI layer). Seed input accepts 0–4,294,967,295 and resets to the last valid value on blur if invalid. A `Reset to defaults` ghost link sits at the group bottom (restores `DEFAULT_VARIANCE` but keeps the seed).

### 6.4 `TemplatePicker`, `InkPicker`, `SizeControls`

* **TemplatePicker:** 2×2 grid of 120×84 cards (`Ruled`, `Grid`, `Dotted`, `Cornell`), each an inline-SVG mini sheet with the name below. Selected: 2 px `--accent` ring (inset) plus `aria-checked`. Cornell shows the caption *"Lines only — no text labels."*
* **InkPicker:** three 28 px circular swatches with labels in tooltips and `aria-label`: `Fountain Blue` `#1B56DB` → `inkRgb [0.106, 0.337, 0.859]`; `Carbon Black` `#000000` → `[0, 0, 0]` (default); `Graphite` `#4A4744` → `[0.290, 0.278, 0.267]`. Selected: 2 px `--accent` ring with a 2 px `--paper` gap. Ink color applies to the preview, to the capture ribbon preview, and to the PDF's `rg` operator.
* **SizeControls:** `Writing size` slider 6–10.5 pt, step .5, default 10, readout `10.0 pt` (this is `xHeightPt`, clamped as in `pageMetrics`); `Page limit` stepper (− / value / +) 1–10, default 10 (`maxPages`).

---

## 7. Edge, Empty, and Progress States

### 7.1 First-visit zero state (`ZeroStateCard`; shown when `isFirstVisit`)

The app opens in mode 2 (Write & Export). The sheet shows the blank ruled backdrop. Over its upper third sits an inline card (`--paper`, 1px `--hairline`, radius 12, 360 wide, padding 20, no overlay or backdrop dimming): title *"Write in your own hand"* (`--fs-15`, weight 600); body *"Draw your alphabet once, then type anything and export a notebook page."*; primary `Start Drawing Your Alphabet (3 min)`; secondary `Try Instant Demo Handwriting`. The inspector rail and export button stay visible but disabled with the tooltip *"Needs a hand first."* The editor is empty and focusable. The card disappears when a pack exists. `Start` switches to mode 1; `Try Demo` runs §7.6, after which the editor is filled with the sample text (if empty) so synthesized handwriting appears within a second.

### 7.2 `MissingGlyphPill`

Shown at the bottom-center of the sheet pane whenever the preview text contains characters that are non-whitespace and absent from `pack.glyphs` after `normalizeChar`. The set is cross-checked against `LayoutResult.missingChars.length`. It is a pill (`--paper`, 1px `--hairline-strong`, `--shadow-pop`, 28 h, `--fs-12`) reading *"No glyph for  ?  @  é"* (each character in `--mono` on `--track`, max 6 then "+N") and a `Draw` link. One click on a character, or on `Draw`, sets `mode = 'calibrate'`, loads that character (queue item or Custom item, §5.1) and closes the gallery. A trailing `✕` adds the characters to `dismissedMissing` for the session. The pill reappears if new missing characters appear. It never blocks editing or export. In the PDF these characters are left as gaps (`0.6 · K.WORD_SPACE`).

### 7.3 Export flow (`ExportPanel`, rendered between the toolbar and the sheet)

`Export PDF` is disabled (with a reason tooltip) unless `canExport`. Pressing it calls `WorkerClient.generatePdf` with an `AbortController`.

* **`ProgressStrip`** (replaces the button label with `Exporting…` and shows a 56 px strip): determinate bar (4 px, `--track`, fill `--accent`, width = `fraction`, `transition: width 100ms linear`); phase label (`validate` *Checking*, `layout` *Laying out*, `emit` *Drawing pages*, `finalize` *Finishing*); counters in `.num`: `Page 3 / 10 · 1,204 / 13,000 glyphs · 0.62 MB`; and `Cancel` (secondary). Cancel aborts, the label becomes `Cancelling…` and the button is disabled until the AbortError arrives, then the strip closes with the toast *"Export cancelled."* The progress region has `role="progressbar"` with `aria-valuenow`, and screen readers hear updates at most every 2 s.
* **`ResultStrip`** (on `done`): *"handwriting.pdf · 6 pages · 1.04 MB · 3.2 s"* (`.num`) with `Save again` (secondary) and `Dismiss`. The download starts automatically through `store/download.ts`. The Blob is retained until the next export or any settings change.
* **`WarningBanner`s** (from `PdfWarning[]`, stacked, each dismissible):

| Code | Copy |
|---|---|
| `TRUNCATED` | *"Your text runs past the page limit ({maxPages}). Pages beyond it were left out. Shorten the text, raise the page limit (max 10), or export in two parts."* |
| `SIZE_OVER_BUDGET` | *"This PDF is {x.xx} MB, above the 2 MB target. To shrink it: lower Variants per glyph, lower Ink pressure, or switch to Print style. Your PDF was still created."* |
| `MISSING_GLYPHS` | *"{n} characters had no glyph and were left as gaps: {chars}."* + `Draw them` |

* **Failures** (`error` response or stall): banner in `--danger`.

| Code | Copy |
|---|---|
| `PACK_NOT_LOADED` / `REVISION_MISMATCH` | Silent single auto-retry after re-loading the pack. If it fails again: *"Your hand isn't ready. Try again in a moment."* |
| `LIMIT_EXCEEDED` | *"The text or hand is over the supported limit ({detail})."* |
| `NO_GLYPHS` | *"Draw at least one letter first."* + `Calibrate` |
| `EMPTY_TEXT` | Button is already disabled; this is never shown. |
| `BUSY` | Auto-retry once after 500 ms. |
| `UNSUPPORTED_REQUEST` / `INTERNAL` / stall | *"Export failed. Try again; if it keeps failing, export your hand (.json) and reload."* + `Try again` |

### 7.4 Rebuild and loading states

During `building`, the preview keeps the previous pack, `GlyphPill` shows ` · Updating…`, and nothing blocks input. Boot with an unreadable cache shows the skeleton sheet (backdrop only) for at most one worker round-trip. Quarantined raw records appear in the gallery as *unreadable — redo* (§5.6).

### 7.5 Import / Export menu and dialog (`FileMenu`, `PackImportExportDialog`)

Menu items: `Import hand…`, `Export hand (with drawings)` (recommended, reproducible), `Export hand (compact)`. Export runs `export-json` in the worker and downloads `handwriting-glyphpack.json`. Import opens a native file picker (`accept=".json"`), checks `file.size ≤ 16 MiB` before reading, then `import-json`. The dialog (480 wide, `--paper`, radius 12, centered, backdrop `rgba(28,25,23,.28)`) shows a determinate spinner-free status line while the worker validates. On failure it lists up to 25 issues as `path` (`--mono`, `--fs-11`, truncated middle) and message, with a `Close` button. If `CHECKSUM_MISMATCH` is the **only** issue, `Import anyway` appears as a secondary button. On success it first shows `ConfirmDialog` — *"Importing replaces everything on this device (N drawings, M glyphs). Export first to keep your current hand."* — with `Export first`, `Replace`, and `Cancel`. After import the toast reads *"Imported 80 glyphs."*

### 7.6 Demo hand (`Load Demo Hand` and `Try Instant Demo Handwriting`)

`src/demo/demoHand.ts` is loaded with a dynamic `import()` (its own chunk, budget ≤ 14 KiB gzip, excluded from the 130 KiB main-chunk budget; no network). It contains integer polyline strokes for all 88 required keys, with guides 100/220/340/420, `penWidthPx = 16`, `pointerType 'mouse'`, ascending `sessionIndex`, and `capturedAt = DEMO_CAPTURED_AT`. It goes through the same `replaceAll` and `build-pack` path as real data. If the device already holds non-demo raw samples, `ConfirmDialog` appears first (*"Replace your hand with the demo? Export first to keep it."*). While `isDemo`, the glyph pill shows `Demo hand` in `--ink-2` before the count. Drawing any glyph replaces only that sample, and when no demo sample remains `isDemo` becomes false.

---

## 8. Keyboard Shortcuts

Handlers are attached to the view roots. They ignore events whose target is `INPUT`, `TEXTAREA`, `SELECT`, a focused `BUTTON` (for `Enter`/`Space` only), or any open dialog or popover. On macOS `⌘` is `metaKey`; elsewhere it is `ctrlKey`.

| Context | Keys | Action |
|---|---|---|
| Global | `⌘1` / `⌘2` | Calibrate / Write & Export |
| Global | `Esc` | Close the topmost popover, menu, or dialog |
| Calibrate | `Enter` or `Space` | Accept and advance |
| Calibrate | `Backspace` | Undo last stroke |
| Calibrate | `Esc` (nothing open) or `Shift+Backspace` | Clear all strokes of the draft |
| Calibrate | `⌘Z` / `⌘⇧Z` | Undo / redo stroke |
| Calibrate | `←` / `→` | Previous / next queue item (discards the unsaved draft) |
| Calibrate | `G` | Toggle gallery |
| Calibrate | `Y` | Open or close the guide calibration popover |
| Write | `⌘↵` | Export PDF (when `canExport`) |
| Write | `⌘\` | Toggle inspector |
| Write | `⌥R` | Re-roll seed |
| Write | `⌘.` | Cancel running export |
| Gallery | Arrow keys, `Enter` | Move focus, open a glyph for redraw |

The shortcut hints appear in tooltips (`--fs-11`) and in the buttons' `aria-keyshortcuts`.

---

## 9. Responsive, Accessibility, Motion

| Width | Layout |
|---|---|
| ≥ 1100 | Three columns (§6.1). |
| 700–1099 | Editor stacked above the sheet (editor min-height 160, max 30vh, then the sheet). The inspector is a 280 px overlay drawer from the right with a scrim `rgba(28,25,23,.18)`, closed by default. |
| < 700 | Same stack. The inspector is a bottom sheet (max-height 70vh, grab handle, radius 12 12 0 0). The top bar shows the title, mode switcher (icons plus numbers `1` `2`), glyph pill, and `…` menu. The capture card fills the width; the gallery is a bottom drawer. All hit targets are 44 px (`pointer: coarse`). |

* **Focus and semantics:** every control has a visible `--focus-ring` on `:focus-visible`. The mode switcher, template picker, and ink picker are `radiogroup`s. The gallery is a `grid`. The canvas has `role="img"` and `aria-label="Drawing area for the character e"`. Live announcements go through one polite `aria-live` region. Color is never the only state carrier (selection also has a ring or underline).
* **Contrast:** `--ink` on `--desk` ≈ 15:1; `--ink-2` on `--desk` ≥ 4.5:1; `--ink-3` is for placeholders and disabled content only.
* **Motion:** all transitions use `var(--dur) var(--ease)`. Progress width is the sole exception (100 ms linear). `prefers-reduced-motion` zeroes `--dur`, and the crossfade becomes an instant swap.
* **Light only:** `color-scheme: light`; dark mode is out of scope.

---

## 10. Budgets and Acceptance Checklist

* **Bundle:** all CSS together ≤ 14 KiB gzip; main chunk stays within the `Architecture.md` §7.3 budget of 130 KiB gzip; `pdf-lib` never enters the main chunk; the demo chunk is separate (§7.6). There are no fonts or images shipped; the system font stack is used.
* **Dependencies and network:** no new runtime dependency. The CSP from `Architecture.md` §7.2 is unchanged (`connect-src 'none'`); dynamic imports are same-origin.
* **Acceptance:**
  1. A cold first load shows the zero-state card with no modal and no layout shift.
  2. `Try Instant Demo Handwriting` yields visible handwriting within one worker round-trip, and the glyph pill reads `Demo hand · 88 / 88 glyphs`.
  3. Drawing and accepting a glyph with `Space` takes one keypress, and the pill count and gallery thumbnail update.
  4. Pen-up renders the ribbon crossfade in 180 ms (instant under reduced motion).
  5. Changing any of the four sliders, `poolSize`, mode, or seed re-renders the sheet and never touches the PDF until Export.
  6. The progress strip is monotonic, `Cancel` stops the job with the toast and no download, and the three warnings render with the copy in §7.3.
  7. A text containing a character with no glyph shows `MissingGlyphPill`; one click lands on that character's capture screen.
  8. Export then import of a `.json` restores the same pack, with the replace confirmation, and `CHECKSUM_MISMATCH` alone offers `Import anyway`.
  9. Cornell shows no text labels in the preview or the PDF.
  10. Every control is reachable and operable by keyboard alone, and no accent color appears outside §1.2.

*End of UX specification.*
