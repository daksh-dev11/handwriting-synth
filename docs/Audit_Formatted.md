## Audit: MathEngine / Architecture / UX / DesignDoc

I read all four specs and ran the MathEngine reference code to check the vectors. `hash32`, `u01` and TV3F reproduce exactly. The claims in #1, #11, #9 and #8 below are backed by those runs. Where the documents conflict, DesignDoc wins, so those patches target DesignDoc.

**Totals:** 9 HIGH, 17 MEDIUM, 5 LOW.

---

### 1. Cross-spec and TypeScript contradictions

#### #1 `[HIGH]` Slant formula contradicts TV1A and the demo-hand test

**Docs:** MathEngine §2.7, §5 TV1A; DesignDoc §5 and S6 exit gate.

**Defect:** §2.7 uses `atan2(x_last − x_first, y_first − y_last)`. TV1A uses `atan2(110−60, 700−100)`, the opposite sign on y.

- The formula as written returns 175.24° for TV1A, so the stem is rejected by `|θ| ≤ 35`.
- It returns −170.07° for the DesignDoc demo `l`, which is drawn top-down at +10°.
- Every top-down stem is therefore dropped and `slantDeg` becomes 0.
- The S6 criterion “`l` within ±2° of 10°” cannot pass.
- TV1A’s own sign is also wrong. Its stem has the top at x=130 and the bottom at x=150, so it leans left, yet it reports +4.76 against the “+ = leans right” convention.

**Patch (MathEngine §2.7):**

diff

```diff
- θ = atan2( x_last - x_first , y_first - y_last )  (degrees)     // + = leans right
+ let (xt,yt) = chord endpoint with the smaller y (top); (xb,yb) = the other endpoint
+ θ = atan2( xt - xb , yb - yt )  (degrees)      // + = top right of bottom = leans right; independent of stroke direction
```

**Patch (§5 TV1A):** replace the slant row with `| slant (§2.7: atan2(60-110, 700-100), degrees) | -4.763642 |`.

#### #2 `[HIGH]` `GlyphClass` has no home for `i`, and `glyphClassOf` is never defined

**Docs:** MathEngine §1.2 (`GlyphClass` comments); Architecture §1 (`charset.ts`); DesignDoc §1.1 and §1.5.

**Defect:** `x` + `ascender` + `descender` cover 25 lowercase letters, and `i` is in none of them. `glyphClassOf` is exported in the barrel and used by UX §5.2, but no spec defines it. The schema requires `glyphClass` to be in the enumerated set, so an implementer’s fallback decides whether `i#0` validates.

**Patch (MathEngine §1.2):**

diff

```diff
- | 'ascender'   // b d f h k l t
+ | 'ascender'   // b d f h i k l t
```

**Patch (DesignDoc §1.5, append):**

ts

```ts
const ASC = new Set('bdfhiklt'), DESC = new Set('gjpqy');
const PUNCT = new Set(['.',',',';',':','!','?',"'",'"','`','-','_','(',')','[',']','{','}','/']);
export function glyphClassOf(c: string): GlyphClass {
  if (X_CLASS.has(c)) return 'x';
  if (ASC.has(c)) return 'ascender';
  if (DESC.has(c)) return 'descender';
  if (c >= 'A' && c <= 'Z') return 'cap';
  if (c >= '0' && c <= '9') return 'digit';
  return PUNCT.has(c) ? 'punct' : 'symbol';
}
```

Add a test that every key in `REQUIRED_KEYS ∪ OPTIONAL_KEYS` maps to a member of the enum.

#### #3 `[MEDIUM]` The live-preview contract is stated two incompatible ways

**Docs:** Architecture §1 tree comment, §2.5, §4.7; UX §6.2; DesignDoc §3.5.

**Defect:** Architecture says the preview is one line (`linesPerPage: 1`, about 60 glyphs, ≤ 6 ms, “everything above \~8 ms runs in the worker”). UX and DesignDoc say it is a full A4 page on the main thread with `text.slice(0,1500)`. Three problems follow:

- `layoutText` is synchronous, so the “keep the previous frame until it completes” rule in UX §6.2 cannot work. A cold cache blocks the main thread.
- The 1500-character slice is wrong whenever a page holds more than 1500 characters. At `xHeightPt` 6–8 a page holds roughly 2200–3000 characters (`lineWidthEm` 24 803 at 6 pt). The preview then silently omits the bottom of page 1, and the `truncated` caption never shows.
- `PageChip` estimates pages as `ceil(chars/1500)`, which is also wrong at those sizes.

**Patch:**

diff

```diff
# Architecture §1 tree
- # live single-line preview (main thread, same engine code)
+ # live first-page preview (main thread, time-sliced via layoutTextSteps, same engine code)
# Architecture §2.5 table, Layout row, Main-thread cell
- layoutText(previewText, pack, cfg, {lineWidthEm: previewWidthEm, linesPerPage: 1, maxPages: 1}, cache)
+ layoutTextSteps(text, pack, cfg, {lineWidthEm: m.lineWidthEm, linesPerPage: spec.linesPerPage, maxPages: 1}, cache)  // 6 ms slices per rAF
# Architecture §4.7 row
- | Live preview (one line, ≈ 60 glyphs) | main | ≤ 6 ms per update ...
+ | Live preview (first page, ≤ ~3 000 glyphs) | main | each slice ≤ 6 ms; the run is abandoned when `gen` changes
# UX §6.2 and DesignDoc §3.5
- layoutText(text.slice(0, 1500), pack, cfg, {...maxPages: 1}, cache)
+ layoutTextSteps(text, pack, cfg, {...maxPages: 1}, cache)   // layout self-bounds at maxPages·linesPerPage
# UX §6.1 PageChip
- the estimate is `ceil(chars / 1500)`
+ the estimate is `ceil(chars / cpp)` where cpp = consumedChars of the last preview layout when truncated, else 1500
```

#### #4 `[MEDIUM]` Required cooperative checkpoints are impossible with the synchronous engine API

**Docs:** Architecture §2.3 vs §4.4 and §4.1; DesignDoc §1.1.

**Defect:** Architecture §4.4 requires `await checkpoint()` “after each sample in buildPackJob” and “after layout of each paragraph”. `buildGlyphPack(samples, nowIso, onGlyph?)` and `layoutText(...)` are synchronous and cannot await. `onGlyph` is a sync callback, so cancel messages are never delivered mid-job. Only the 1000 ms hard-terminate fallback works, and it recycles the whole worker.

**Patch (Architecture §2.3):**

diff

```diff
- export function buildGlyphPack(samples, nowIso, onGlyph?): GlyphPack;
+ export function* buildGlyphPackSteps(samples: RawGlyphSample[], nowIso: string): Generator<{done:number; total:number}, GlyphPack, void>;
+ export function buildGlyphPack(samples: RawGlyphSample[], nowIso: string): GlyphPack;   // drains the generator
- export function layoutText(text, pack, cfg, geom, cache): LayoutResult;
+ export function* layoutTextSteps(text, pack, cfg, geom, cache): Generator<{consumedChars:number}, LayoutResult, void>; // yields at each paragraph end and every 64 placements
+ export function layoutText(text, pack, cfg, geom, cache): LayoutResult;                  // drains the generator
```

**Patch (DesignDoc §1.1):**

diff

```diff
- export { buildGlyphPack } from './normalize/pipeline';
+ export { buildGlyphPack, buildGlyphPackSteps } from './normalize/pipeline';
- export { layoutText } from './layout/layoutText';
+ export { layoutText, layoutTextSteps } from './layout/layoutText';
```

**Patch (jobs):**

ts

```ts
for (let r = it.next(); !r.done; r = it.next()) await checkpoint(() => info(r.value));
```

#### #5 `[MEDIUM]` Naming and signature drift Roo will trip on

**Docs:** Architecture §4.3, §2.3; UX §5.4; DesignDoc §1.4, §3.5; MathEngine §2.7, §3.7E, §4.4, §6.3, §5 Vitest skeleton.

**Defect and patch:**

- `ImportOutcome` is used in `WorkerClient.importJson` but defined nowhere. In `protocol.ts` add `export type ImportOutcome = {ok:true; pack:GlyphPack; rawSamples:RawGlyphSample[]|null} | {ok:false; issues:ValidationIssue[]};`
- UX §5.4 says `ribbonOutline`, but the barrel exports `glyphOutline`/`ribbonPath`. Change UX to `glyphOutline`.
- DesignDoc §1.4 returns `{path, bounds}` while Architecture’s `CachedOutline` is `{path,minX,minY,maxX,maxY}`. Change `ribbonPath` to return `CachedOutline` (flat fields).
- The MathEngine §5 Vitest skeleton imports `./mathEngine`, which does not exist in the tree. Replace with `import {hash32,u01,gauss,perlin1} from '../../src/engine/rng'; import {catmullRomToBeziers} from '../../src/engine/ink/catmullRom';`
- MathEngine §6.3 still contains the stray lines `a = S·cosθ  b = -S·sinθ` / `c = -S·sinθ·... (see below)` (lines 1075-1077). Delete both lines. Only the “Expanded” block is authoritative.
- MathEngine §2.7 says `slantDeg` is “used as the reference direction for ligature tangent sanity (§4.4)”. §4.4 never uses it. Change the sentence to “exposed to the UI only”.
- `K.LIG_DY_MAX` (330) is dead because `d ≤ 140` already implies `|ΔY| ≤ 140`. Delete compat condition 3 and the constant.
- MathEngine §3.7E says the ligature ribbon is “merged into the same fill path”. Architecture §4.5 and §6.2 emit it as a separate fill outside the glyph XObject. Replace with “a ligature ribbon is a separate fill in the same ink colour (Architecture §4.5)”.
- Architecture §3.4 states `lineWidthEm(ruled) = 14 882.3`. It is `496.063·30 = 14 881.9`.
- Architecture §4.5 step 5 hardcodes `q 0 0 0 rg`. Change to `q {inkRgb} rg`.

#### #6 `[MEDIUM]` Export is disabled in `done`/`failed`, which only return to idle on the next Export

**Docs:** UX §4 (derived flags and Job machine); DesignDoc §2.1 `selectCanExport`, `startExport`.

**Defect:** `canExport` requires `phase === 'idle'`, but UX says `done`, `cancelled` and `failed` “return to idle on the next Export or after Dismiss”. The user cannot press Export again until they find Dismiss.

**Patch (DesignDoc §2.1, UX §4):**

diff

```diff
- ... && s.text.trim() !== '' && s.phase === 'idle';
+ ... && s.text.trim() !== '' && (s.phase === 'idle' || s.phase === 'done' || s.phase === 'cancelled' || s.phase === 'failed');
```

Make `startExport()` call `dismissJob()` first.

#### #7 `[MEDIUM]` Architecture §2.4 lint and purity guards are partly inert

**Docs:** Architecture §2.4(b), §2.4(c), §2.2.4, §7.3.

**Defect:**

- In a flat config, a later block for the same rule replaces earlier options. The pdf-lib block (files `src/{components,canvas,store,engine}/**` and `worker/{client,protocol}.ts`) overwrites `patterns` for those files. That disables “engine: relative imports only” and “`@engine/.+` barrel only” for components, canvas, store, client and protocol.
- `FORBIDDEN_GLOBAL` omits `self`, `globalThis`, `setTimeout`, `console`, `crypto`, `TextEncoder`, `structuredClone`, `sessionStorage` and `process`, all of which §2.2 bans.
- `FORBIDDEN_IMPORT` misses side-effect imports (`import 'x'`).
- The comment stripper `//.*$` truncates any line containing `'http://…'`, which can hide a violation later on that line.
- `"sideEffects": false` for the whole app can drop CSS imports (`tokens.css`).
- `check-size.mjs` greps minified output for the string `PDFDocument`, which is unreliable.

**Patch:**

js

```js
// eslint.config.js: one rule entry per file group, both options in the same object
{ files:['src/engine/**/*.ts'], rules:{'no-restricted-imports':['error',{
    patterns:[{regex:'^(?!\\.{1,2}/).*',message:'engine: relative only'}],
    paths:[{name:'pdf-lib',message:'worker-side only'}] }]}},
{ files:['src/{components,canvas,store}/**/*.{ts,tsx}','src/worker/{client,protocol}.ts'], rules:{'no-restricted-imports':['error',{
    patterns:[{regex:'^@engine/.+',message:"import from '@engine' only"}],
    paths:[{name:'pdf-lib',message:'worker-side only'}] }]}},
{ files:['src/{pdf,worker}/**/*.ts'], ignores:['src/worker/{client,protocol}.ts'], rules:{'no-restricted-imports':['error',{
    patterns:[{regex:'^@engine/.+',message:"import from '@engine' only"}] }]}},
```

diff

```diff
# purity.test.ts
- const FORBIDDEN_GLOBAL = /\b(window|document|navigator|indexedDB|localStorage|requestAnimationFrame|fetch|Worker|performance\.now|Math\.random|Date\.now|new Date)\b/;
+ const FORBIDDEN_GLOBAL = /\b(window|document|self|globalThis|navigator|performance|indexedDB|localStorage|sessionStorage|fetch|Worker|requestAnimationFrame|setTimeout|setInterval|console|TextEncoder|TextDecoder|crypto|structuredClone|process|require|Math\.random|Date\.now|new Date)\b/;
- const FORBIDDEN_IMPORT = /from\s+['"](?!\.{1,2}\/)[^'"]+['"]|import\s*\(\s*['"](?!\.{1,2}\/)/;
+ const FORBIDDEN_IMPORT = /from\s+['"](?!\.{1,2}\/)[^'"]+['"]|import\s*\(\s*['"](?!\.{1,2}\/)|import\s+['"](?!\.{1,2}\/)/;
- .replace(/\/\/.*$/gm, '')
+ .replace(/(^|\s)\/\/.*$/gm, '$1')
```

diff

```diff
# package.json (Architecture §2.2.4)
- "sideEffects": false
+ "sideEffects": ["*.css"]
```

In `check-size.mjs`, test the main chunk for the `%PDF-` or `FlateStream` marker, or assert that no `node_modules/pdf-lib` module id appears in a build manifest, instead of the `PDFDocument` string.

---

### 2. Math, geometry and layout edge cases

#### #8 `[HIGH]` N2 drift: one zero-height X-class sample turns the entire pack into NaN

**Docs:** MathEngine §2.3, §0.6 (`K`); Architecture §3.2 P1.

**Defect:** A single-tap `o` (UX accepts any glyph with at least 1 stroke) gives `h_j = 0`. Then `r_j = ln(0/M) = −∞`, `b = NaN`, and `k_i = clamp(exp(NaN)) = NaN` for every sample, so every coordinate in the pack is NaN. `buildPackJob` output is not validated (see #17), so the NaN reaches the preview and the PDF.

**Patch (MathEngine §2.3, step 2 and step 5):**

diff

```diff
  2. For each collected sample j, after N1, compute h_j = max(y1) - min(y1) ...
+    Exclude from the fit (not from the correction) any sample with h_j < K.DRIFT_MIN_H.
+    If fewer than K.DRIFT_MIN_SAMPLES remain, b = 0, ī = 0, skip to step 5.
  4. ...
+    if b is not finite, b = 0.
  5. k_i = clamp( exp(-b*(i-ī)), LO, HI );  if k_i is not finite, k_i = 1
```

Add `DRIFT_MIN_H: 75` to `K` (0.25·xHeight).

#### #9 `[HIGH]` N7 One Euro: causal lag plus final re-pin creates a 30-50 em hook at every stroke end

**Docs:** MathEngine §3.3, §0.6; Architecture §3.2 N7.

**Defect:** I simulated the spec filter on a radius-150 `o` resampled at 9 em, over 0.3, 0.6 and 1.2 s:

- The filter lags, so `xhat[n−2]` trails the true path.
- `xhat[n−1] = P[n−1]` then snaps the last point ahead by **30-50 em** against a normal step of 8.5 em.
- Mean radius shrinks 3.7% at 0.3 s.
- A 30-50 em jump exceeds `FIT_ERROR` (4.5), so Schneider fits it as a visible hook.

**Patch (MathEngine §3.3, replace the pseudocode tail and `ONE_EURO_MIN_CUTOFF: 8`):**

```
F = oneEuroPass(P, t)                                     // existing loop, start pinned, NO end re-pin
B = reverse( oneEuroPass(reverse(P), t[n] - reverse(t)) ) // same loop on reversed input, start (= P[n]) pinned
xhat[m] = (1 - m/n) * F[m] + (m/n) * B[m]                 // both ends exact, lag cancels mid-stroke
```

I tested this blend. The end step drops to 1.4-2.2 em and shrink improves to 3.2% (minCutoff 8, 0.3 s). Add a test: `|xhat[n] − xhat[n−1]| ≤ 3·RESAMPLE_DS` on the circle fixture. Add a TV4 for N7, since none exists.

#### #10 `[MEDIUM]` §4.5 perturbation can flip a handle and create cusps or loops

**Docs:** MathEngine §4.5.

**Defect:** Handle lengths from Schneider are often 3-10 em. `m_j = σh·z` reaches ±15 em because gauss is clamped at ±3. With `a = 3` and `m_j = +10`, `H_in' = Q − (3−10)T = Q + 7T`, so the handle points backwards. Its length of 7 passes the “≥ HANDLE_MIN” check, but the joint now has a cusp.

**Patch (replace the H_in’/H_out’ lines and the clamp sentence):**

```
a = |H_in - Q|,  b = |H_out - Q|          (0 if the handle does not exist; T_j falls back to the chord direction when a handle has zero length)
Q'     = Q + n_j
H_in'  = Q' - max(K.HANDLE_MIN, a - m_j) * T_j
H_out' = Q' + max(K.HANDLE_MIN, b - m_j) * T_j
```

This is algebraically identical to the current formula except for the signed clamp.

#### #11 `[HIGH]` §4.6 variant weights go negative after a paragraph break, and the guarantee contradicts TV3F

**Docs:** MathEngine §4.6, §5 TV3F, §4.2; Architecture §2.2.4, §3.4, §6.

**Defect 1:** History is per call and not reset, but `k` resets to 0 at `\n\n`. After a paragraph with `use[e] = 480..500`, the age term `min(k − use[e], 8)/8` is about −60. I computed weights of −29.0, −29.6 and 0 (sum −58.6), so `u` is negative and the pick is garbage. The result is deterministic but wrong.

**Defect 2:** The text says “the same composite is never used twice within 3 consecutive occurrences”. The rule only blocks `last` for 2 positions. TV3F, which I reproduced exactly, gives `[2,0,1,2,0,2,1,2,2,1,0,1]`. In it `e` picks 2 at k=5 and k=7, and `a` picks 1 at k=9 and k=11. The assertion “never repeat within 3 positions” fails on the spec’s own vector.

**Patch (MathEngine §4.6):**

diff

```diff
- keep, per character, a history { last, lastPos, use[0..nEff-1] } initialized to { -1, -99, all -99 }.
+ keep, per character, a history ... initialized to { -1, -99, all -99 }; **the history is re-initialised at the start of every paragraph.**
- = 1 + 0.5 * min(k - use[e], K.AGE_CAP) / K.AGE_CAP
+ = 1 + 0.5 * clamp(k - use[e], 0, K.AGE_CAP) / K.AGE_CAP
- Guarantees: the same composite is never used twice within 3 consecutive occurrences of that character, so "ee", "eee", "ss" always differ ...
+ Guarantee: a composite is never picked for two consecutive occurrences of the same character that are ≤ K.RECENT_BLOCK positions apart. It may reappear after one different pick (e.g. 2,1,2).
```

**Patch (TV3F):**

diff

```diff
- the picks differ (`e` at k = 0..7 and `a` at k = 8..11 never repeat within 3 positions).
+ consecutive picks of the same character differ (e: k = 0..7, a: k = 8..11).
```

Update Architecture §3.4 so the per-call `VariantHistory` is reset at `k = 0` (paragraph start).

#### #12 `[MEDIUM]` Ligature placement has a circular dependency, X_k → Δy_line → S.y → compat → X_k

**Docs:** MathEngine §4.3 (`Δy_line(X_k)`), §4.4 (ligature `X_k`, compat, `S.y = Y_k(S0.y)`); Architecture §3.4.

**Defect:** `X_k` depends on whether the ligature test passes. The test uses `S.y`, which includes `Δy_k`, which includes `Δy_line(X_k, L)`. The evaluation order is unspecified, so two implementations differ.

**Patch (MathEngine §4.4, append to the ligature paragraph):**

```
Order of evaluation for glyph B (letters, same word, same line, B not first on its line):
 1. X_lig = E.x + g_lig - S0.x
 2. Δy_B(X_lig) via §4.3 with X_k = X_lig; S = (E.x + g_lig, Y_B(S0.y)).
 3. Run the compatibility test. Pass ⇒ X_k = X_lig. Fail ⇒ X_k = print-mode advance and Δy_B is recomputed at that X_k.
Ligatures are never attempted for the first glyph of a line (including after a wrap retry), or when either glyph is a missing-glyph gap.
```

#### #13 `[MEDIUM]` Instance metrics and kerning profiles depend on render-time state the cache cannot see

**Docs:** MathEngine §2.6, §4.5; Architecture §2.3 `Placement.pivX`; DesignDoc §1.2.

**Defect:**

- §2.6 computes profiles with `w` from §3.6, which depends on the ink slider `I` and the pressure bucket. These are stored in the `GlyphPack` cache, which has no `I`, so profiles are stale after any ink change.
- §4.5 says “recompute entry, exit, and profiles” for a perturbed instance but says nothing about `bbox`, `advance` or `pivX`. Kerning uses `adv_A`, and the pivot uses `bbox`, so implementations diverge.
- It is unspecified whether `m = 0` or `poolSize = 1` is unperturbed.

**Patch:**

diff

```diff
# MathEngine §2.6
- Densely sample every stroke centerline every 4 em, with width `w` from §3.6 at the sample's pressure.
+ Densely sample every stroke centerline every 4 em using the constant disc diameter w = W (pack-wide stroke weight); pressure, I and buckets are ignored. Profiles are therefore independent of all sliders.
# MathEngine §4.5, last sentence
- After perturbation recompute entry, exit, and the optical profiles (§2.6) for the instance.
+ After perturbation recompute entry, exit, leftProfile, rightProfile (§2.6). bbox, lsb, rsb, advance and pivX are copied unchanged from the base variant (placement and kerning use base metrics). m = 0 is the unperturbed base; perturbation applies only for m ≥ 1.
# Architecture §2.3 Placement
- pivX: number; // (bbox.minX + bbox.maxX)/2 of the placed instance
+ pivX: number; // (bbox.minX + bbox.maxX)/2 of the BASE variant
```

#### #14 `[MEDIUM]` Wrapping: three documents give three rules, and over-long words have no terminating rule

**Docs:** MathEngine §4.4; Architecture §3.4 step 2 vs §8.5.

**Defect:** MathEngine says “the break is always at a space”. Architecture §3.4 retries only “if the word does not start at X = 0”, with no rule for a word that does. §8.5 adds glyph-wise breaking but no progress guarantee. A word wider than `lineWidthEm` (a URL, or 30 000 `W` with no spaces) can either overflow past the margin or loop. The ligature rule also leaks across a wrap.

**Patch (MathEngine §4.4):**

diff

```diff
- the break is always at a space and the next line starts at `X = 0`.
+ the break is at the last space of the line; a word wider than lineWidth_em is broken between glyphs (Architecture §8.5). A glyph is always placed when X = 0 (guarantees progress). The next line starts at X = 0 with no ligature from the previous glyph.
```

**Patch (Architecture §3.4 step 2):**

```
for each glyph g of the word:
  if X + adv_g > lineWidthEm:
     if X > 0: L += 1; X = 0; ligatureFromPrev = null; re-run the placement of g (and, if the word was not hard-broken, of the whole word)
     else:     place g anyway
```

Add a layout test: 30 000×`W` with no spaces terminates in at most `maxPages·linesPerPage` lines.

#### #15 `[LOW]` `InstanceCache` invalidation: the outline key quantises a value used at full precision

**Docs:** DesignDoc §1.2; Architecture §2.3, §2.5.

**Defect:** The key uses `inkQ = round(inkPressure·100)`, but the width formula receives the exact value. A value of 0.504 from an import or IDB shares a key with 0.496 and serves stale outlines. `layoutText` also accepts `cfg` and `cache` separately, so they can silently disagree.

**Patch:**

diff

```diff
- inkQ = Math.round(inkPressure * 100)
+ inkQ = Math.round(inkPressure * 10000)
```

Add `InstanceCache.matches(pack, cfg): boolean`, and have `layoutText`/`layoutTextSteps` throw `RangeError('CACHE_CFG_MISMATCH')` when it is false (programmer error, not user data).

---

### 3. Security, memory and DoS

#### #16 `[HIGH]` `db.tx()` does not abort on a synchronous throw, so `replaceAll` is not atomic

**Docs:** DesignDoc §2.2 `tx`, `persistence.replaceAll`; Architecture §5.6.

**Defect:** `fn(...)` runs inside the Promise executor before the handlers are attached. If `put`/`clear` throws synchronously (`DataCloneError`, `DataError`), the Promise rejects but the transaction is not aborted. Requests already queued, such as `clear(raw)` and `clear(pack)`, auto-commit, which wipes the user’s hand and leaves nothing in its place.

`replaceAll` also lists `clear(raw)`, `clear(pack)`. If an implementer uses the exported standalone `clear(db, s)`, each call opens its own transaction. There is also no handling for `versionchange`, `blocked`, an open that never settles, connection loss (Safari), or `QuotaExceededError`.

**Patch (DesignDoc §2.2):**

ts

```ts
export function tx(db: Db, stores: StoreName[], mode: IDBTransactionMode,
                   fn: (st: Record<StoreName, IDBObjectStore>) => void): Promise<void> {
  if (!db.idb) return Promise.reject(new Error('NO_IDB'));
  return new Promise((res, rej) => {
    let t: IDBTransaction | undefined;
    try {
      t = db.idb!.transaction(stores, mode);
      t.oncomplete = () => res();
      t.onerror = () => rej(t!.error);
      t.onabort = () => rej(t!.error ?? new Error('ABORT'));
      fn(Object.fromEntries(stores.map(s => [s, t!.objectStore(s)])) as Record<StoreName, IDBObjectStore>);
    } catch (e) { try { t?.abort(); } catch {} rej(e); }
  });
}
```

- `replaceAll` must use `st.raw.clear()`, `st.pack.clear()` and `st.raw.put(...)` on the `st` handed to `fn`, never the standalone `clear(db,…)`.
- `openDb`: add `req.onblocked` and a 3 s timeout, both falling back to `{idb:null, mem}`.
- After a successful open, set `db.onversionchange = () => db.close()` and `db.onclose = () => ui.persistenceAvailable = false`.
- On `InvalidStateError`/`UnknownError`, reopen once.
- On `t.error?.name === 'QuotaExceededError'`, show the toast “Storage is full. Export your hand (.json) now.”, and keep `draftState = 'drafted'`.

#### #17 `[MEDIUM]` NaN or Infinity can leave the engine, or enter through schema gaps, and reach the PDF

**Docs:** Architecture §5.4 (`NormalizedStroke`), §4.5 step 6 and `fmt`, §3.2 P3, §4.4 jobs; MathEngine §3.7A–B.

**Defect:**

1. `buildPackJob` posts `pack-ready` without validating its own output (see #8), so NaN reaches the preview and `fmt(NaN)` emits `NaN` into the PDF.
2. `pressure[].u` only has to be “non-decreasing”. Two knots with equal `u` make the interpolation 0/0 = NaN.
3. A non-dot stroke of zero length is allowed. Then `S = 0` and `u = s/S = NaN`.
4. Glyph keys only need `[...key].length === 1`. A lone surrogate or control character passes. These break `${char}#${n}` keys and `fnv1a32`/IDB handling.

**Patch:**

diff

```diff
# Architecture §3.2 P3 "assemble" row
+ ... then validateGlyphPack(pack); on failure the job posts error {code:'VALIDATION_FAILED'} and nothing is cached.
# Architecture §5.4 NormalizedStroke
- `u` non-decreasing
+ u[i+1] - u[i] ≥ 1e-9 (strictly increasing)
+ non-dot strokes: Σ|segment chords| ≥ K.DOT_MAX_LEN (INVARIANT_FAILED otherwise)
# Architecture §5.4 glyphs
- keys must each be exactly one Unicode code point (`[...key].length === 1`)
+ ... and /^[^\p{Cc}\p{Cs}\p{Cn}]$/u must match (same for RawGlyphSample.char)
# Architecture §4.6 rule 6
- `fmt()` strips trailing zeros and normalizes `-0` to `0`.
+ ... and throws RangeError('NON_FINITE') on NaN/±Infinity; the job maps it to error code INTERNAL.
```

In MathEngine §3.7A add “if S < 1e-6, treat the stroke as a dot”. `pressureAt` returns `p1` when `u1 − u0 < 1e-9`.

#### #18 `[MEDIUM]` Import: the pack is trusted independently of `rawSamples`, and “Import anyway” persists it under a valid fingerprint

**Docs:** Architecture §5.1, §3.3; DesignDoc §2.1 `applyImported`, §2.4 step 4; UX §7.5.

**Defect:** When `rawSamples` is present, the fingerprint is computed from the raw samples while `pack` comes from the file. With `CHECKSUM_MISMATCH` plus “Import anyway”, an edited pack passes the boot cache check (`fingerprint === fp`) and is never rebuilt. The 32-bit FNV checksum is not tamper-evident, and the user has no signal that the pack and raw samples disagree.

**Patch:**

diff

```diff
# Architecture §5.1 import bullet, append
+ If rawSamples is present, the imported `pack` is discarded after validation and rebuilt via build-pack(rawSamples, nowIso = file.pack.createdAt); the cache record carries sourceFingerprint = computeFingerprint(raw).
+ A pack-only import is stored with sourceFingerprint = 'imported' and never with a computed fingerprint.
# UX §7.5
- If CHECKSUM_MISMATCH is the only issue, Import anyway appears as a secondary button.
+ ... Import anyway appears only when rawSamples is present (the pack is then ignored and rebuilt) or, for pack-only files, after a second ConfirmDialog stating that the file may be corrupted.
```

#### #19 `[MEDIUM]` `parsePackFile` has no nesting or key-enumeration guard, and aggregate caps run after the allocation

**Docs:** Architecture §5.3 stages 1-6, §5.2.

**Defect:** `JSON.parse` has already materialised up to 16 MiB of structure before any cap check. Stage 6 aggregate caps run after stage 4 has built the sanitised copy. At the per-stroke limit (512 segments) that is millions of segments before `MAX_SEGMENTS_PER_PACK` fires. Whitelist checks that enumerate `Object.keys` on a hostile object with \~2M keys allocate before comparing. Peak memory (input string, parsed tree, sanitised copy, checksum `JSON.stringify`) can reach several hundred MB on a phone, and the 10 s watchdog then reports a generic “worker stalled”.

**Patch:** insert stage 1b before `JSON.parse`:

ts

```ts
function nestingOk(s: string, max = 12): boolean {
  let d = 0, inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (inStr) { if (c === 92) i++; else if (c === 34) inStr = false; continue; }
    if (c === 34) inStr = true;
    else if (c === 123 || c === 91) { if (++d > max) return false; }
    else if (c === 125 || c === 93) d--;
  }
  return true;
}
```

Failure returns `CAP_EXCEEDED` with path `/`.

diff

```diff
# Architecture §5.4 primitive rules
+ Object key whitelist check: `let n=0; for (const k in o) { if (++n > allowed.size || !allowed.has(k)) return UNKNOWN_KEY }` (no Object.keys allocation).
# Architecture §5.3 stage 6
- Aggregate caps ... counts against LIMITS while walking
+ Running counters (segments, knots, raw points) are incremented inside the stage-4/7 loops and abort with CAP_EXCEEDED the moment a cap is crossed. Stage 6 is only a final assertion.
```

#### #20 `[MEDIUM]` Settings, session and generate-pdf params are never validated, so corrupted or hostile values cause NaN or a huge allocation

**Docs:** DesignDoc §2.4 steps 2-3; Architecture §4.5 step 1, §4.2 `GeneratePdfParams`; MathEngine §4.6.

**Defect:** `meta.settings`, `meta.session` and `meta.draft` are applied raw at boot. `variance.poolSize` of 1e6 makes `nEff = nBase·M` allocate a `use[]` array of millions per character. NaN sliders become NaN geometry. `generate-pdf` validates only text and page count, not `variance`, `inkRgb` or `template`. `pageMetrics(NaN)` returns NaN because `Math.max/min` propagate it.

**Patch:**

ts

```ts
// engine/schema/settingsSchema.ts (new, barrel export `sanitizeSettings`, `sanitizeVariance`)
export function sanitizeVariance(v: unknown): VarianceConfig {
  const o = (typeof v === 'object' && v) ? v as Record<string, unknown> : {};
  const f = (x: unknown, d: number, lo: number, hi: number) =>
    (typeof x === 'number' && Number.isFinite(x)) ? Math.min(hi, Math.max(lo, x)) : d;
  const seed = (typeof o.seed === 'number' && Number.isInteger(o.seed) && o.seed >= 0 && o.seed <= 4294967295)
    ? o.seed : DEFAULT_VARIANCE.seed;
  return {
    seed,
    slantJitter: f(o.slantJitter, .5, 0, 1), baselineDrift: f(o.baselineDrift, .5, 0, 1),
    spacingVariance: f(o.spacingVariance, .5, 0, 1), inkPressure: f(o.inkPressure, .5, 0, 1),
    mode: o.mode === 'semi-cursive' ? 'semi-cursive' : 'print',
    poolSize: Math.round(f(o.poolSize, 4, 1, LIMITS.MAX_POOL_SIZE)),
  };
}
```

diff

```diff
# limits.ts
+ MAX_POOL_SIZE: 4,
# pageMetrics
- clamp(xHeightPt, 6, 10.5)
+ Number.isFinite(xHeightPt) ? clamp(xHeightPt, 6, 10.5) : 10
```

- Run `sanitizeSettings` in DesignDoc §2.4 step 2. It also clamps `inkRgb` components to 0..1, requires `template ∈ TEMPLATE_SPECS`, makes `maxPages` an integer in 1..10, applies the UX §5.3 guide clamps, requires `nextSessionIndex` to be an integer ≥ 0, and slices `draft` to `MAX_TEXT_CHARS`.
- Run `sanitizeVariance` and the same field checks in Architecture §4.5 step 1 and in `PreviewController.update`.

#### #21 `[MEDIUM]` “Any exported file is guaranteed to import” is false: total raw points are not capped at capture, and floats are written at full precision

**Docs:** Architecture §5.2 closing paragraph, §5.5; DesignDoc §2.3 `commitDraft`, §3.2.

**Defect:** Capture enforces 20 000 points per sample, but `MAX_RAW_POINTS_TOTAL` is 120 000. Across 88 samples a user can legitimately reach 176 000+ points, so `serializePackFile` fails with `LIMIT_EXCEEDED`, which the spec says happens only “through a bug”. Raw points are also stored with 17-digit doubles. A full-resolution point serialises to about 150-160 B, so 120 000 points is about 18-19 MB, above `MAX_FILE_BYTES` (16.78 MB).

**Patch (DesignDoc §2.3, new step between 3 and 4):**

```
(3b) total = Σ points over rawByKey (excluding this key) + sample points.
     If total > LIMITS.MAX_RAW_POINTS_TOTAL: thin this sample (drop points <1.0 px from the previously kept point, always keep each stroke's first and last point).
     If still over: draftState = 'drafted', toast "Your hand has too much detail to export. Clear and redraw this glyph with fewer strokes."
```

diff

```diff
# CaptureController push(): round at capture
- {x: ev.clientX-rect.left, y: ev.clientY-rect.top, ... t: ev.timeStamp, ...}
+ {x: round2(ev.clientX-rect.left), y: round2(ev.clientY-rect.top), ... t: round2(ev.timeStamp), ...}   // round2 = Math.round(v*100)/100
# Architecture §5.5, serializePackFile
+ after JSON.stringify: if (json.length > LIMITS.MAX_FILE_BYTES) return LIMIT_EXCEEDED ("export compact instead").
```

#### #22 `[HIGH]` WorkerClient: revision ownership is contradictory, `packRevision` is filled at the wrong time, and hard-cancel re-sends the wrong pack

**Docs:** Architecture §4.2, §4.3; DesignDoc §2.1 (`PackSlice.revision`, `rebuildNow`).

**Defect:**

- The store “owns” `revision`, and `build-pack` carries `{revision}`, but `WorkerClient.buildPack(samples, nowIso, opts)` has no revision parameter. Nobody can supply the value.
- `generatePdf` fills `packRevision` “from the last pack-ready” at call time. If a build is queued or running, the revision is stale by dispatch, which causes a spurious `REVISION_MISMATCH`.
- Hard-cancel “re-sends the last `load-pack`”. A pack produced by `build-pack` never had a `load-pack`, so after respawn the worker has no pack.
- `rebuildNow` “cancels … running job”. If the running job is an export started before the user switched to Calibrate, the export is aborted.

**Patch (Architecture §4.3):**

diff

```diff
- buildPack(samples, nowIso, opts?): Promise<{ revision: number; pack: GlyphPack }>;
- loadPack(pack, opts?): Promise<{ revision: number }>;
+ buildPack(samples, nowIso, revision: number, opts?): Promise<{ revision: number; pack: GlyphPack }>;
+ loadPack(pack, revision: number, opts?): Promise<{ revision: number }>;
- Hard-cancel fallback ... re-sends the last `load-pack`
+ The client keeps lastPack = { revision, pack } (updated on every pack-ready and every load-pack) and re-sends it after a respawn; if the cancelled job was a build-pack, lastPack is the pre-job pack.
- `generatePdf` fills `packRevision` automatically from the last pack-ready/load-pack.
+ `generatePdf` fills `packRevision = this.lastPack.revision` at DISPATCH time (when the job is dequeued), not at call time.
```

**Patch (DesignDoc §2.1 `rebuildNow`):** abort only `buildAbort`, the controller of the previous build job, never `jobSlice.abort`.

#### #23 `[HIGH]` Build-pack race can cache a stale pack under a fresh fingerprint

**Docs:** DesignDoc §2.4 step 6 (`rebuildNow` token, `put pack.current {sourceFingerprint: fp}`), §2.1; UX §4 Pack machine.

**Defect:** The token only increments when `rebuildNow` is called. A commit during a running build only calls `scheduleRebuild` (400 ms), so the in-flight build keeps a valid token. The spec does not say when `fp` is computed. If it is computed at completion from the current `rawByKey`, the cache stores the older pack with the newer fingerprint. After a reload the boot check passes and the newest glyph is silently missing. `packStatus` can also flip `stale → ready` while a rebuild is pending.

**Patch (DesignDoc §2.1/§2.4, `rebuildNow` body):**

ts

```ts
async function rebuildNow() {
  const token = ++buildToken;
  const samples = sortedValid(get().rawByKey);              // snapshot
  const fp = computeFingerprint(samples);                    // fingerprint of THE SNAPSHOT, never recomputed later
  buildAbort?.abort(); buildAbort = new AbortController();
  set({ packStatus: 'building' });
  const rev = get().revision + 1;
  try {
    const { pack } = await client.buildPack(samples, nowIso(), rev, { signal: buildAbort.signal });
    if (token !== buildToken) return;
    const current = computeFingerprint(sortedValid(get().rawByKey));
    set({ pack, revision: rev, fingerprint: fp, packStatus: current === fp ? 'ready' : 'stale' });
    await savePackCache(db, { engineSpec: ENGINE_SPEC_REV, sourceFingerprint: fp, pack, savedAt: nowIso() });
  } catch (e) { if (!isAbort(e) && token === buildToken) fail(e); }
}
```

When `status === 'stale'` after completion, `scheduleRebuild` has already been armed and takes over.

#### #24 `[MEDIUM]` Two tabs corrupt `sessionIndex` uniqueness, which makes export unimportable

**Docs:** DesignDoc §2.2 `saveRawSample`, §2.4 step 3; Architecture §3.3, §5.3 stage 7 (`sessionIndex` unique).

**Defect:** `nextSessionIndex` lives in memory and is written last-writer-wins. Two tabs hand out the same index. Boot only recomputes `max(sessionIndex)+1` “if `meta.session` was absent”. The export validator then rejects duplicates, and the user cannot export their own hand.

**Patch:**

diff

```diff
# DesignDoc §2.4 step 3
- if `meta.session` was absent set `nextSessionIndex = max(sessionIndex)+1`
+ always set nextSessionIndex = max(meta.session.nextSessionIndex ?? 0, max(raw.sessionIndex) + 1)
# DesignDoc §2.4, new step 1b
+ const lock = await navigator.locks?.request('hw-synth-writer', { ifAvailable: true }, l => l ? new Promise(() => {}) : null);
+ A tab that does not obtain the lock sets ui.readOnly = true: commitDraft, demo load and import are disabled; a Banner says "This hand is open in another tab."
```

(The first tab holds the lock until it closes. If `navigator.locks` is undefined, the `max(...)` rule above is the only guard.)

---

### 4. UI and canvas race conditions

#### #25 `[HIGH]` Palm rejection ignores the pen if the palm touched first

**Docs:** DesignDoc §3.2 `CaptureController` pointerdown; UX §5.5.

**Defect:** The rule “ignore if `activeId !== null`” means a palm resting on the screen starts a stroke with a touch pointer. The pen then comes down and is ignored, because `activeId` is held by the palm. `penActive` only becomes true after a pen pointerdown, so it never protects against this ordering. Pen hover is not tracked, so a palm landing just before pen contact is accepted.

**Patch (replace the three pointerdown ignore rules):**

```
- ignore (and preventDefault) if touch && (penActive || performance.now()-penUpAt<300)
- ignore if activeId!==null
+ Separate listener on rawCanvas: pointerenter/pointermove with pointerType==='pen' (any buttons) ⇒ lastPenAt = performance.now().
+ ignore (and preventDefault) if touch && (penActive || performance.now() - lastPenAt < 1000)
+ if pointerType==='pen' && activeId!==null && activeType==='touch': discard cur (no onStrokeEnd), releasePointerCapture(activeId), activeId=null, then continue as a normal pen pointerdown
+ else if activeId!==null: ignore
+ ignore if pointerType==='pen' && (e.button===5 || (e.buttons & 32))   // eraser
```

Set `activeType = e.pointerType` when a stroke starts.

#### #26 `[MEDIUM]` Cached `getBoundingClientRect()` goes stale during the UI’s own transitions, shifting captured y

**Docs:** DesignDoc §3.2 pointerdown; UX §2.2, §5.4.

**Defect:** `rect` is re-read only on `ResizeObserver`. Mode switches animate the incoming view `translateY(4px)→0`, and Accept slides the card 8 px. Transforms do not fire `ResizeObserver`, and scroll and viewport changes do not either. A rect read during the animation gives a systematic offset. A 4 px y error becomes 10 em after N1 (`s = 2.5`) on every glyph of the session. `y` is anchored to the baseline, so it matters even though `x` is later translated.

**Patch (DesignDoc §3.2):**

diff

```diff
- `rect = canvas.getBoundingClientRect()` (re-read on `ResizeObserver`).
+ `rect = canvas.getBoundingClientRect()` is re-read on every pointerdown and held for that stroke. The ResizeObserver is used only to re-run `fitCanvas`.
```

#### #27 `[MEDIUM]` Controller limits and draft state desynchronise from the store

**Docs:** DesignDoc §3.2 (pointermove/up, `setDraft`), §2.1, §2.3; UX §5.5.

**Defect:**

1. `strokeCount` and `samplePoints` are controller-internal and never reset or recomputed. After Undo, Clear, Accept or navigation, the controller still refuses new strokes (“strokes limit”) or counts the old glyph’s points.
2. The mid-stroke test `samplePoints >= 20000` sees only completed strokes. At 16 000 points the next stroke can reach 20 000, then a following stroke pushes 1 point to 20 001. `validateRawSample` fails (“couldn’t be saved”).
3. pointerup never calls `onDrawingChange(false)`. A `pointercancel` with `cur.length < 2` discards the stroke and leaves `draftState = 'drawing'`.
4. `commitDraft`, `goTo/next/prev` and mode switch do not check for an in-flight stroke. Pressing Space mid-stroke commits without it, and the stroke then lands on the next character. Holding Space auto-repeats Accept.

**Patch (DesignDoc §3.2):**

diff

```diff
+ setDraft(strokes, …) also sets strokeCount = strokes.length; samplePoints = Σ strokes[i].length.
+ Add CaptureController.abortActive(): discards cur, releases capture, activeId = null.
- samplePoints>=20000 ⇒ end stroke and cb.onLimit('sample-points')
+ samplePoints + cur.length >= 20000 ⇒ end stroke and cb.onLimit('sample-points'); pointerdown with samplePoints >= 20000 ⇒ cb.onLimit('sample-points'), return.
+ Every terminal path (pointerup, pointercancel, limit end) calls cb.onDrawingChange(false).
```

**Patch (DesignDoc §2.1/§2.3):**

diff

```diff
+ onDrawingChange(false) ⇒ draftState = draftStrokes.length ? 'drafted' : 'idle'.
+ commitDraft() returns immediately unless draftState === 'drafted'.
+ goTo/next/prev/setMode call controller.abortActive() before discarding the draft.
# UX §8
+ Accept, Undo and navigation shortcuts ignore events with e.repeat === true.
```

#### #28 `[MEDIUM]` Changing guides mid-draft corrupts the normalisation of the glyph being drawn

**Docs:** DesignDoc §2.3 step (3) (guides from the current slice values at commit); UX §5.3.

**Defect:** Strokes are in canvas px under the guides active when they were drawn. If the user opens GuideCalibration mid-draft, `commitDraft` builds the sample with the new `gB`/`xhPx`. N1 then maps the old px with the new scale and baseline, and the glyph is mis-sized and mis-placed with no indication.

**Patch (DesignDoc §2.1 `CaptureSlice`, §2.3):**

diff

```diff
+ draftGuides: CaptureGuides | null;   // snapshot taken when draftStrokes goes from empty to non-empty
- (3) build RawGlyphSample{ …, guides:{ascenderY:gB−2xh, …}, … }
+ (3) build RawGlyphSample{ …, guides: draftGuides, … }
+ setGuides/setPenWidth: while draftStrokes.length > 0 the GuideCalibration sliders are disabled with the tooltip "Accept or clear this glyph first."
```

#### #29 `[MEDIUM]` Keyboard handling blocks the main Write shortcuts while typing, and collides with the gallery and the browser

**Docs:** UX §8; DesignDoc §1.6.

**Defect:**

- Handlers ignore events whose target is `TEXTAREA`/`INPUT`, but Write-mode focus is almost always in the editor. So `⌘↵`, `⌘\`, `⌥R`, `⌘1` and `⌘2` never fire while typing.
- If this is “fixed” naively, `⌥R` matches `e.key` (`®` on macOS) and inserts `®` into the text.
- Calibrate-mode `←`/`→` and `Enter` are not ignored for gallery grid cells (UX only exempts focused `BUTTON` for Enter/Space). Arrow keys in the gallery both move focus and navigate the queue, discarding the draft. `Enter` on a thumb both opens it and Accepts.
- `⌘1`/`⌘2` collide with browser tab-switch shortcuts.

**Patch (UX §8, replace the first paragraph):**

```
Handlers are attached to the view roots. Events whose target is INPUT, TEXTAREA or SELECT are ignored only when none of metaKey/ctrlKey/altKey is held.
Shortcuts match e.code (KeyR, Enter, Backslash, Digit1, Digit2, Period, KeyG, KeyY), never e.key, call preventDefault(), and skip e.repeat.
Calibrate single-key handlers (Enter, Space, Backspace, ←, →, G, Y) also ignore events whose target is inside [role=grid], [role=radiogroup], [role=menu] or [role=dialog].
Mode shortcuts become ⌘⇧1 / ⌘⇧2 (Ctrl+Shift on Windows/Linux).
```

Update the Global table rows and the `aria-keyshortcuts` values to match.

#### #30 `[MEDIUM]` PreviewController scheduling: `raf` is never cleared (preview freezes) and `destroy()` leaks timers and paints

**Docs:** DesignDoc §3.5 `mark`/`run`/`destroy`; UX §6.2.

**Defect:** `mark()` does `if(!raf) raf = requestAnimationFrame(run)`. `run` never sets `raf = 0` on the normal path, so after the first run no further runs are scheduled. `destroy()` has no body in the spec, so the debounce `timer`, the pending `raf` and the paint continuation survive unmount. UX §2.2 crossfades views, so a stale paint can call `onResult`/`onBusy` after unmount. The paint continuation reads `this.cache` across frames instead of capturing the one used for the layout. The `back` canvas plus two visible canvases at `dpr = 3` is about 20 MP, which is heavy for iOS.

**Patch (DesignDoc §3.5):**

diff

```diff
- run(frameStart): if `deferNext` ⇒ …
+ run(frameStart): raf = 0; if (!dirty) return; dirty = false; if (deferNext) { deferNext = false; mark(); return; } …
+ run captures { cache, layout, memo, gen } in locals; the paint continuation uses only those.
+ destroy(): clearTimeout(timer); if (raf) cancelAnimationFrame(raf); if (paintRaf) cancelAnimationFrame(paintRaf); gen++; destroyed = true; back.width = back.height = 0.
# DesignDoc §3.1
- dpr = Math.min(window.devicePixelRatio || 1, 3)
+ fitCanvas(c, cssW, cssH, maxDpr = 3); the preview sheet and `back` call it with maxDpr = 2.
```

---

### 5. Cross-cutting notes

**#31 `[LOW]` PDF template size is mis-estimated.** Architecture §4.6 budgets the template at “≈ 10 KB”. `dotted` emits 2 378 circles (41×58 dots, 4 cubics each), about 450 KB raw operator text, so roughly 50 KB after Flate. It is still far under budget, but `check-size`-style tests that assert 10 KB will fail. Patch: Architecture §4.6 “template ≈ 10 KB” → “template ≈ 10 KB (ruled/grid/cornell), ≈ 50 KB (dotted)”.

**#32 `[LOW]` UX §5.3 baseline clamp rounds the wrong way.** The upper bound is `470 − (2/3)·xh` “rounded”. For `xh = 62` that rounds to 429, giving `gD = 470.33`, which is 0.33 px beyond the stated limit (still on the 480 canvas). Patch: use `Math.floor` for the upper bound and `Math.ceil` for the lower bound.

**#33 `[LOW]` Dev-server CSP.** Architecture §7.2 mirrors the CSP into `index.html` as a `<meta>` tag. Vite’s dev server injects an inline React-refresh preamble, which `script-src 'self'` blocks, so `npm run dev` shows a blank page. Patch: inject the CSP `<meta>` only in the build, using a `transformIndexHtml` plugin hook gated on `command === 'build'`.