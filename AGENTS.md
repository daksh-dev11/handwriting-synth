# AGENTS.md — Handwriting Synthesis App (Roo Code Operating Manual)

Applies to Roo Code modes `Orchestrator`, `Architect`, `Code`, `Debug`. Specs live in `/docs/` (`MathEngine.md`, `Architecture.md`, `UX.md`, `DesignDoc.md`, `Audit_Formatted.md`). This file is the distilled, binding summary. Read your slice section and the rules that touch it; open a spec only for the exact section named here.

## 0. Non-Negotiables

- 100% client-side and deterministic from a `uint32` seed. No ML, backend, auth, billing, telemetry, or runtime network. CSP `connect-src 'none'`.
- Stack: TypeScript 5 strict, Vite 5, React 18, `zustand`, Canvas 2D, `pdf-lib@1.17.1` (exact pin), hand-rolled IndexedDB wrapper, one module Web Worker, Vitest + `fake-indexeddb`.
- Output target: 10 A4 pages, vector ink, under 2,000,000 bytes (`LIMITS.PDF_BUDGET_BYTES`).
- Never invent constants. Every number comes from `K`, `EM`, `CH`, `LIMITS`, `BACKDROP`, `TEMPLATE_SPECS`, or `PAGE`, each defined once.
- Never edit `/docs/*`. If a spec is wrong or ambiguous, stop and report to the Orchestrator. Do not guess.
- A slice owns its files exclusively. Never create or modify a file owned by another slice (§4.2).
- Never use `Math.random` or `Date.now` in `src/engine/**`. Time enters as `nowIso: string`. Randomness is `hash32/u01/gauss/perlin1` only.
- No placeholders, TODOs, stubs, or `any` in committed code. No `eslint-disable` anywhere in `src/engine/`.

## 1. Specification Precedence & Lookup Map

**Precedence (highest wins):** `Audit_Formatted.md` (#1–#33) > `DesignDoc.md` > `Architecture.md` = `UX.md` > `MathEngine.md`. Audit patches override every older text, including constants and test vectors. Where the audit patches MathEngine text, implement the patched text and update the matching test vector, for example TV1A slant becomes `-4.763642`.

| Domain | Authoritative location |
|---|---|
| Constants `K`, `EM`, anchors, coordinate systems | MathEngine §0.3, §0.6 (+ audit #8 `DRIFT_MIN_H`, #9 `ONE_EURO_MIN_CUTOFF`, #5 removes `LIG_DY_MAX`) |
| Data types (`RawGlyphSample`, `NormalizedGlyph`, `VarianceConfig`) | MathEngine §1 |
| Normalization N1–N4, drift, snapping | MathEngine §2.1–§2.5; audit #8 |
| Slant/style/anchors/profiles | MathEngine §2.6–§2.7; audit #1, #13 |
| Resample, pressure, One Euro, Schneider, Catmull-Rom | MathEngine §3.1–§3.5; audit #9 |
| Width + ribbon outline | MathEngine §3.6–§3.7; audit #17; DesignDoc §1.4 |
| RNG, slant/baseline variance, spacing, ligature, perturbation, variants | MathEngine §4.1–§4.7; audit #10–#14 |
| Test vectors TV1–TV3 | MathEngine §5 (tests live in `tests/engine/*`) |
| PDF placement matrix, XObject reuse | MathEngine §6.2–§6.3; Architecture §4.5–§4.6, §8.1 |
| Engine public API / barrel | DesignDoc §1.1; Architecture §2.3; audit #4 |
| `InstanceCache`, `normalizeChar`, `charset.ts` | DesignDoc §1.2, §1.3, §1.5; audit #2, #15 |
| Layer ranks, purity enforcement | DesignDoc §1.8; Architecture §2.1–§2.4; audit #7 |
| Worker protocol, client, checkpoint | Architecture §4.1–§4.4; audit #4, #22 |
| `generate-pdf` job and memory model | Architecture §4.5–§4.6; audit #17 |
| Schema, caps, import/export | Architecture §5; audit #17–#21 |
| IndexedDB, boot, persistence | DesignDoc §2.2, §2.4; Architecture §3.3; audit #16, #23, #24 |
| Zustand slices | DesignDoc §2.1, §2.3; audit #6, #27, #28 |
| CSS tokens and controls | UX §1 (`tokens.css`) |
| Views and states, shortcuts | UX §4–§9; audit #29 |
| Canvas controllers | DesignDoc §3.1–§3.5; audit #25–#27, #30 |
| PDF templates and `BACKDROP` | DesignDoc §4; UX §3.2 |
| Demo hand DSL | DesignDoc §5 |
| Slices, file ownership, exit gates | DesignDoc §6 |

## 2. Consolidated Critical Patch Registry (Audit #1–#33)

### 2.1 Engine Math & Generators

- **#1 Slant (HIGH).** In `n9Style.ts`, take the chord endpoint with the smaller y as top `(xt,yt)` and the other as bottom `(xb,yb)`. Then `θ = atan2(xt − xb, yb − yt)` in degrees, independent of stroke direction. Keep `|θ| ≤ 35` and chord ≥ 240. TV1A expects `-4.763642`. `slantDeg` is exposed to the UI only (#5), not used by the ligature test.
- **#2 `glyphClassOf` (HIGH).** `ASC = new Set('bdfhiklt')` (includes `i`), `DESC = new Set('gjpqy')`. Follow the DesignDoc §1.5 + audit #2 body exactly, with the `PUNCT` set. Add a test that every `REQUIRED_KEYS ∪ OPTIONAL_KEYS` char maps into the `GlyphClass` enum. MathEngine `GlyphClass` comment: ascender is `b d f h i k l t`.
- **#8 Drift NaN (HIGH).** Add `K.DRIFT_MIN_H = 75`. Exclude samples with `h_j < 75` from the fit only, not from the correction. If fewer than 6 remain, set `b = 0, ī = 0`. If `b` is non-finite, set `b = 0`. If `k_i` is non-finite, set `k_i = 1`.
- **#9 One Euro (HIGH).** Set `ONE_EURO_MIN_CUTOFF = 8`. Compute `F = oneEuroPass(P,t)` (start pinned, no end re-pin). Compute `B = reverse(oneEuroPass(reverse(P), t[n] − reverse(t)))`. Output `xhat[m] = (1 − m/n)·F[m] + (m/n)·B[m]`, so both ends are exact. Add TV4: on a radius-150 circle fixture, `|xhat[n] − xhat[n−1]| ≤ 3·RESAMPLE_DS`.
- **#11 Variants (HIGH).** Re-initialise the per-character `VariantHistory` at every paragraph start (`k = 0`). Age term is `clamp(k − use[e], 0, AGE_CAP)`. Guarantee: a composite is not picked twice for consecutive occurrences within `RECENT_BLOCK` positions. `2,1,2` is legal. TV3F picks stay `[2,0,1,2,0,2,1,2,2,1,0,1]`. The assertion is only that consecutive picks of the same char differ.
- **#4 Generators (MEDIUM).** Export `buildGlyphPackSteps(samples, nowIso): Generator<{done,total}, GlyphPack, void>` and `layoutTextSteps(...): Generator<{consumedChars}, LayoutResult, void>`. `layoutTextSteps` yields at each paragraph end and every 64 placements. `buildGlyphPack` and `layoutText` drain them. Both generators are in the barrel.
- **#10 Perturbation.** `a = |H_in − Q|`, `b = |H_out − Q|`, `Q' = Q + n_j`, `H_in' = Q' − max(HANDLE_MIN, a − m_j)·T_j`, `H_out' = Q' + max(HANDLE_MIN, b − m_j)·T_j`. Perturb only for `m ≥ 1`; `m = 0` is the unperturbed base.
- **#12 Ligature order.** (1) `X_lig = E.x + g_lig − S0.x`. (2) Compute `Δy_B` at `X_lig`, then `S = (E.x + g_lig, Y_B(S0.y))`. (3) Run the compatibility test. Pass keeps `X_lig`. Fail uses the print advance and recomputes `Δy_B`. Never ligate the first glyph of a line (including after a wrap retry) or next to a missing-glyph gap. Delete compat condition 3 and `LIG_DY_MAX`.
- **#13 Profiles/metrics.** Profiles use constant disc diameter `w = W` (independent of pressure, `I`, buckets). Instances copy `bbox, lsb, rsb, advance, pivX` from the base variant. Recompute only `entry, exit, leftProfile, rightProfile`. `Placement.pivX` is the base variant's.
- **#14 Wrapping.** Break at the last space. A word wider than the line is broken between glyphs. A glyph is always placed when `X = 0`. A new line never carries `ligatureFromPrev`. Add a test: 30,000×`W` without spaces terminates in at most `maxPages·linesPerPage` lines.
- **#15 (LOW).** `inkQ = Math.round(inkPressure·10000)`. Add `InstanceCache.matches(pack, cfg)`; layout throws `RangeError('CACHE_CFG_MISMATCH')` when false.
- **#5 Drift fixes.** `ribbonPath` returns flat `CachedOutline`. UX text says `glyphOutline`. Ligature ribbon is a separate fill (not merged into the glyph path). Delete the stray §6.3 `a=/b=/c=… (see below)` lines. Ruled `lineWidthEm = 14 881.9`. The page stream uses `q {inkRgb} rg`, not a hardcoded black. The test skeleton imports `src/engine/rng` and `src/engine/ink/catmullRom`.

### 2.2 Schema & Security

- **#17 (MEDIUM).** `buildPackJob` runs `validateGlyphPack(pack)` before posting `pack-ready` (failure → `VALIDATION_FAILED`). Pressure `u` must be strictly increasing (gap ≥ 1e-9). Non-dot strokes need total chord ≥ `DOT_MAX_LEN`. In ribbon, `S < 1e-6` is treated as a dot. `pressureAt` returns `p1` when `u1 − u0 < 1e-9`. Glyph keys and `RawGlyphSample.char` must match `/^[^\p{Cc}\p{Cs}\p{Cn}]$/u`. `fmt()` throws `RangeError('NON_FINITE')` on NaN/±Infinity, and the job maps it to `INTERNAL`.
- **#18 (MEDIUM).** If `rawSamples` is present, discard the imported `pack`, rebuild via `build-pack(rawSamples, file.pack.createdAt)`, and use `sourceFingerprint = computeFingerprint(raw)`. A pack-only import is stored with `sourceFingerprint = 'imported'`. "Import anyway" appears only when `rawSamples` exists, or after a second `ConfirmDialog` for pack-only files.
- **#19 (MEDIUM).** Add stage 1b `nestingOk(text, 12)` before `JSON.parse` (`CAP_EXCEEDED`, path `/`). Whitelist checks use `for…in` with a counter, not `Object.keys`. Running counters inside stage-4/7 loops abort at the moment a cap is crossed.
- **#20 (MEDIUM).** Add `src/engine/schema/settingsSchema.ts` with `sanitizeVariance` and `sanitizeSettings` (barrel exports). Add `LIMITS.MAX_POOL_SIZE = 4`. `pageMetrics` returns the default of 10 for non-finite `xHeightPt`. Run sanitizers at boot step 2, at `generate-pdf` step 1, and in `PreviewController.update`. `sanitizeSettings` also clamps `inkRgb` to 0..1, requires a valid `template`, makes `maxPages` an integer 1..10, applies UX §5.3 guide clamps, requires `nextSessionIndex` to be an integer ≥ 0, and slices `draft` to `MAX_TEXT_CHARS`.
- **#21 (MEDIUM).** Capture rounds `x, y, t` with `round2`. `commitDraft` step 3b: if the total raw points would exceed `MAX_RAW_POINTS_TOTAL`, thin the sample (drop points under 1 px from the last kept point, always keep stroke ends). If it is still over, stay `drafted` with a toast. `serializePackFile` returns `LIMIT_EXCEEDED` when `json.length > MAX_FILE_BYTES`.

### 2.3 Worker & IndexedDB

- **#16 (HIGH).** `db.tx()` attaches `oncomplete/onerror/onabort` first, then runs `fn` inside `try`. The `catch` calls `t.abort()` and rejects. `replaceAll` uses only the `st.raw`/`st.pack` store handles from `fn`, never standalone `clear(db,…)`. `openDb` handles `onblocked` and a 3 s timeout (fallback `{idb:null, mem}`). Set `db.onversionchange = () => db.close()` and `db.onclose` → `persistenceAvailable = false`. Reopen once on `InvalidStateError`/`UnknownError`. On `QuotaExceededError` toast "Storage is full. Export your hand (.json) now." and keep `drafted`.
- **#22 (HIGH).** The signatures are `buildPack(samples, nowIso, revision, opts?)` and `loadPack(pack, revision, opts?)`. Define `ImportOutcome` in `protocol.ts` as the audit #5 union. The client keeps `lastPack = {revision, pack}`, updated on every `pack-ready`/`load-pack`, and re-sends it after a hard-cancel respawn. If the cancelled job was a `build-pack`, `lastPack` is the pre-job pack. `generatePdf` fills `packRevision = lastPack.revision` at dispatch (dequeue) time. `rebuildNow` aborts only `buildAbort`, never `jobSlice.abort`.
- **#23 (HIGH).** `rebuildNow` follows the audit #23 body: snapshot the samples, compute `fp` from the snapshot once, bump `buildToken`, abort the previous build, drop results from stale tokens, and set `ready` only if `computeFingerprint(current raw) === fp`, else `stale`. `savePackCache` stores the snapshot `fp`.
- **#24 (MEDIUM).** Boot always sets `nextSessionIndex = max(meta.nextSessionIndex ?? 0, max(raw.sessionIndex) + 1)`. Acquire `navigator.locks.request('hw-synth-writer', {ifAvailable:true}, …)`. A tab without the lock sets `ui.readOnly = true` (commit, demo, import disabled; Banner "This hand is open in another tab.").
- **#4 Checkpoints.** Jobs iterate generators: `for (let r = it.next(); !r.done; r = it.next()) await checkpoint(() => info(r.value))`. Cancel latency is one slice (12 ms).

### 2.4 Canvas & UI

- **#25 (HIGH).** A pen `pointerenter`/`pointermove` sets `lastPenAt`. Ignore (and `preventDefault`) touch while `penActive || now − lastPenAt < 1000`. A pen `pointerdown` while `activeType === 'touch'` discards `cur` (no `onStrokeEnd`), releases capture, and starts the pen stroke. Ignore pen eraser (`button === 5 || buttons & 32`).
- **#26 (MEDIUM).** Call `getBoundingClientRect()` on every `pointerdown` and hold it for that stroke. `ResizeObserver` only re-runs `fitCanvas`.
- **#27 (MEDIUM).** `setDraft` syncs `strokeCount` and `samplePoints`. Add `abortActive()`. The limit check is `samplePoints + cur.length ≥ 20000`. Every terminal path calls `onDrawingChange(false)`. The store sets `draftState = strokes.length ? 'drafted' : 'idle'`. `commitDraft` returns unless `draftState === 'drafted'`. `goTo/next/prev/setMode` call `abortActive()`. Accept, Undo, and navigation ignore `e.repeat`.
- **#28 (MEDIUM).** `CaptureSlice.draftGuides` is snapshotted at the first stroke, and `commitDraft` uses it. Guide and pen sliders are disabled while a draft exists ("Accept or clear this glyph first.").
- **#29 (MEDIUM).** Shortcuts match `e.code` (`KeyR`, `Enter`, `Backslash`, `Digit1`, `Digit2`, `Period`, `KeyG`, `KeyY`), call `preventDefault`, and skip `e.repeat`. INPUT/TEXTAREA/SELECT targets are ignored only when no meta/ctrl/alt is held. Calibrate single-key handlers ignore targets inside `[role=grid|radiogroup|menu|dialog]`. Mode shortcuts are `⌘⇧1`/`⌘⇧2` (Ctrl+Shift elsewhere). Update the `aria-keyshortcuts` values.
- **#30 (MEDIUM).** `run()` starts with `raf = 0; if (!dirty) return; dirty = false;` and `deferNext` calls `mark()`. The paint continuation uses only locals captured at layout (`cache, layout, memo, gen`). `destroy()` clears the timer, cancels both rafs, bumps `gen`, and zeroes the back canvas. `fitCanvas(c, w, h, maxDpr = 3)` is used with `maxDpr = 2` for the sheet and `back`.
- **#3 (MEDIUM).** The preview lays out the first page with `layoutTextSteps` in 6 ms slices per frame (no `slice(0,1500)`). `PageChip` estimate is `ceil(chars / cpp)`, where `cpp = consumedChars` of the last truncated preview, else 1500.
- **#6 (MEDIUM).** `selectCanExport` is true in `idle|done|cancelled|failed`. `startExport()` calls `dismissJob()` first.

### 2.5 Tooling (#7, #31–#33)

- **#7.** Use the three merged `no-restricted-imports` blocks from the audit (one entry per file group, `patterns` and `paths` together). Use the extended `FORBIDDEN_GLOBAL`, the side-effect-import regex, and the comment stripper `/(^|\s)\/\/.*$/gm`. `package.json` has `"sideEffects": ["*.css"]`. `check-size.mjs` detects `pdf-lib` in the main chunk by module id or `%PDF-`/`FlateStream` markers, not the string `PDFDocument`.
- **#31.** The dotted template is about 50 KB; tests must not assert 10 KB. **#32.** The baseline slider upper bound uses `Math.floor`, the lower bound `Math.ceil`. **#33.** Inject the CSP `<meta>` into `index.html` only at build time (`transformIndexHtml`, `command === 'build'`).

## 3. Hard Architectural, Purity & Dependency Guardrails

**Layer ranks (import only lower):** `engine(0) < pdf(1) = canvas(1) = worker/protocol(1) < worker/client(2) = worker/rest(2) < store(3) < components(4)`. Allowed: `canvas` ↛ `pdf`. `src/demo/**` imports only `import type` from `@engine` and loads via dynamic `import()` from `captureSlice.ts`. `tokens.css` is imported by `main.tsx` only.

**Engine purity (`src/engine/**`):** relative imports only. No packages or `node:` modules. No `window, document, self, globalThis, navigator, performance, indexedDB, localStorage, sessionStorage, fetch, Worker, requestAnimationFrame, setTimeout, setInterval, console, TextEncoder, TextDecoder, crypto, structuredClone, process, require`. No `Math.random`, `Date.now`, or `new Date`. No module-level mutable state. Failures return `ValidationResult`, never throw on user data. Geometry leaves the engine as `Pt`, `CubicBezier`, or `PathCmd[]`.

**Outside the engine:** import `@engine` (barrel) only, never `@engine/*`. Only `src/pdf/**` and the worker shell (`pdf.worker.ts`, `dispatcher.ts`, `jobs/*`) may import `pdf-lib`. `worker/client.ts` and `worker/protocol.ts` never do.

**Enforcement layers (all must pass in CI):** `tsconfig.engine.json` (lib ES2022, `types: []`); ESLint flat config with the merged blocks (#7); `tests/architecture/purity.test.ts` and `barrel.test.ts`. The barrel is exactly DesignDoc §1.1 plus the audit additions: `buildGlyphPackSteps`, `layoutTextSteps`, `sanitizeSettings`, `sanitizeVariance`, `InstanceCache.matches`.

**Dependency lock:** runtime dependencies are exactly `react`, `react-dom`, `pdf-lib@1.17.1`, `zustand`. Adding another runtime dependency is forbidden. Dev tooling is limited to Vite, Vitest, TypeScript, ESLint (+ `typescript-eslint`, `eslint-plugin-import`), `@vitejs/plugin-react`, `fake-indexeddb`.

**Bundle budgets (gzip, enforced by `scripts/check-size.mjs`, build fails on breach):**

| Artifact | Budget |
|---|---|
| Main chunk (`index-*.js`) | 130 KiB |
| Worker chunk (`pdf.worker-*.js`) | 280 KiB |
| Demo chunk (`demoHand-*.js`) | 14 KiB |
| All CSS combined | 14 KiB |

`pdf-lib` must be absent from the main chunk. The demo chunk is excluded from the main budget. No fonts or images ship.

**Determinism rules:** iterate sorted (`char` by code point, then `variantIndex`) and sort only with explicit comparators. Same-browser byte-identical PDFs. `PDFDocument.create({updateMetadata:false})` with explicit dates from `documentDateIso`. XObject names `G1…` in first-use order. Fixed precision: XObject coordinates 1 decimal, matrix `a b c d` 4 decimals, `e f` 2 decimals. Stateless counter-based RNG keyed `(seed, index, channel)`.

## 4. Roo Code Multi-Agent Execution Protocol (DesignDoc §6)

### 4.1 Orchestrator mode

1. Run **S1 → S2 sequentially**, one `Code` subtask each. Do not start S2 until S1 is merged and its gate is green.
2. After S2 is green, spawn **three parallel `Code` subtasks**: **S3 ∥ S4 ∥ S5**. Each brief lists the owned files from §4.2 and names the audit items it must honor.
3. When S3, S4, and S5 have all reported green, run **S6** as a single `Code` subtask.
4. Use `Architect` mode only for spec questions (never to edit `/docs`) and `Debug` mode only for a failing gate, with the failing command output attached. A `Debug` fix may touch only files the failing slice owns.
5. Reject any completion report lacking the pasted output of the gate commands in §4.3.
6. Never let two concurrent subtasks edit one file. If a needed change is outside a slice's ownership, queue it as a follow-up subtask after the owner finishes.

### 4.2 Slice ownership (exclusive; nothing is shared)

| Slice | Owns | Key obligations |
|---|---|---|
| **S1** Foundation + normalization | All config (`package.json`, `tsconfig*.json`, `eslint.config.js`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `public/_headers`, `scripts/check-size.mjs`, `.github/workflows/ci.yml`, `docs/CHANGELOG.md` stub); `src/engine/{constants,limits,types,rng,mathUtil,guides,charset}.ts`; `src/engine/normalize/*`; `src/engine/ink/{catmullRom,width,ribbon}.ts`; `src/engine/schema/validate.ts`; `src/styles/tokens.css`; `tests/fixtures/*`; `tests/engine/{tv1.normalization,tv2.curves,charset,pipeline}.test.ts`; `tests/architecture/purity.test.ts` | TV1A–1C and TV2A–2C within 1e-4. `buildGlyphPackSteps`, #1, #2, #8, #9 (+TV4), #13 profiles. `ENGINE_SPEC_REV = 'MathEngine/1'`. `check-size.mjs` carries all four budgets. |
| **S2** Variance, layout, schema, barrel | `src/engine/variance/*`; `src/engine/layout/*`; `src/engine/ink/ligatureOutline.ts`; `src/engine/schema/{glyphPackSchema,rawSampleSchema,packFile,settingsSchema}.ts`; `src/engine/index.ts`; `tests/engine/{tv3.variance,determinism,layout}.test.ts`; `tests/schema/*`; `tests/architecture/barrel.test.ts` | TV3A–3F (`hash32` integers exact). #10–#12, #14, #15, #17–#21 schema parts, `layoutTextSteps`. Cache test: changed `inkPressure` keeps instance identity, changed `seed` does not. |
| **S3** PDF + worker | `src/pdf/**`; `src/worker/{protocol,client,pdf.worker,dispatcher,checkpoint}.ts`; `src/worker/jobs/*`; `tests/pdf/*`; `tests/worker/*` | §6.3 matrix equals `placementToLine`. One XObject per `(glyph, composite, bucket)`. Byte-identical reruns. 10-page fixture ≤ 2,000,000 B. Exact operators per template; no `BT/Tj` in Cornell. #4, #17, #22 (worker side). |
| **S4** Store + persistence | `src/store/{db,persistence,boot,debounce,timing,download,useAppStore}.ts`; `src/store/slices/*`; `src/demo/constants.ts`; `tests/store/*` | #16, #20, #23, #24, #6, #27/#28 store parts. Debounces 300/500/400 under fake timers. No write on `pushStroke`. |
| **S5** Canvas + UI primitives | `src/canvas/*`; `src/components/ui/*`; `src/components/shell/{Banner,ToastHost,ConfirmDialog}.tsx` + CSS modules; `tests/canvas/*` | #25–#27, #30, #3. Coalesced events, palm rejection, caps, affine test. Accent only per UX §1.2. |
| **S6** Views, demo, integration | `src/main.tsx`; `src/components/{App,ErrorBoundary}.tsx`; `src/components/{capture,compose,export}/*`; `src/components/shell/{TopBar,ModeSwitcher,GlyphPill,FileMenu}.tsx`; `src/demo/demoHand.ts`; `tests/demo/*`; `tests/e2e/*` | Demo: exactly 88 valid deterministic samples, `l` slant within ±2° of 10°. #29, #28 UI, #18 UI, §1.6 locks. Map every UX §10 item to a test or a CHANGELOG checklist line. |

### 4.3 Mandatory verification gate (before any subtask reports completion)

- **Every slice (S1–S6):** `npm run lint && npm run typecheck && npm test`. All must exit 0.
- **S3, S5, S6 additionally:** `npm run build && node scripts/check-size.mjs`. At S3 the worker chunk and the pdf-lib exclusion are checked. At S5 the main chunk is checked. At S6 all four budgets (main, worker, demo, CSS) must pass.
- The completion report must paste the command output and list the files created or modified. Any file outside the slice's ownership list means the report is rejected.
- Failures are fixed in the same subtask (or a `Debug` subtask). Never weaken a test, budget, tolerance, or lint rule to pass a gate.

### 4.4 Subtask brief template (Orchestrator fills this for every `Code` subtask)

1. Slice id and the exact owned-file list from §4.2.
2. The spec sections to read, from §1's lookup table, and the audit numbers to apply from §2.
3. Exit criteria from DesignDoc §6 for that slice, plus the gate in §4.3.
4. Prohibitions: do not touch unowned files, do not add dependencies, do not edit `/docs`, do not restate constants.

### 4.5 Mode duties

- **Orchestrator:** sequencing, briefs, gate verification, merge order. Writes no product code.
- **Architect:** answers boundary and precedence questions using §1 and §3, and proposes an Audit-style patch note when specs conflict. Never changes code.
- **Code:** implements only its slice, tests first for math (test vectors from `tests/fixtures/testVectors.ts`), then code.
- **Debug:** reproduces with a failing test, fixes the root cause inside the owning slice, and re-runs the full gate.

### 4.6 Stop-and-report conditions

Stop and message the Orchestrator if a spec conflict is unresolved by §1 precedence, if a needed file is owned by another slice, if a budget cannot be met without a spec change, or if a test vector disagrees with the implemented patched formula. Do not work around it.
