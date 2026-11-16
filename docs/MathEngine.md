# MathEngine.md — Handwriting Synthesis Math Specification

**Status:** Normative. Every constant, formula, and test vector in this document is authoritative. A coding agent must implement exactly what is written here; no behavior is left to interpretation.
**Scope:** Client-side only, geometric/heuristic only (no ML), deterministic from a `uint32` seed, runs in a Web Worker, outputs vector ink for `pdf-lib`.
**Test tolerance:** Unless a value is marked "exact" (integers), assert with absolute tolerance `1e-4`.

---

## 0. Conventions and Global Constants

### 0.1 Coordinate systems

| Name | Origin | Axes | Units | Used for |
|---|---|---|---|---|
| **Canvas space** | top-left of the capture `<canvas>` | x right, **y down** | CSS pixels (not device pixels) | Raw capture |
| **Em space** (glyph space) | top-left of the 1000×1000 em-square | x right, **y down** | em units (1000 per em) | Stored glyphs, all variance math |
| **Line space** | pen origin on the ruled line | x right, **y down**, `y = 0` is the rule | em units | Placement of glyphs on a line |
| **PDF space** | bottom-left of page | x right, **y up** | points | Final output only |

Everything except the last step happens in y-down coordinates. The only y-flip is in §6.3.

Raw `x, y` are `event.clientX - rect.left`, `event.clientY - rect.top` in **CSS pixels**. `dpr` is stored for provenance only and is never used in geometry.

### 0.2 Angle convention

Angles are in **radians** in code and **degrees** where noted. Because y is down, a **positive** slant angle `θ` means the glyph leans **right** (clockwise on screen). Direction angles use `atan2(dy, dx)` in y-down space, so a segment heading up-and-right has a **negative** angle.

`wrap(a)` maps an angle to `(-π, π]`:

```ts
export function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}
```

### 0.3 Em-square anchors (fixed)

```ts
export const EM = {
  unitsPerEm: 1000,
  ascenderY: 100,   // top of ascenders, capitals, digits
  xHeightY: 400,    // top of x-height letters
  baselineY: 700,   // baseline
  descenderY: 900,  // bottom of descenders
  xHeight: 300,     // baselineY - xHeightY
} as const;
```

Ratios are fixed at `ascender height : x-height : descender depth = 600 : 300 : 200`. Capitals and digits align to `ascenderY`.

### 0.4 Capture guide geometry

The capture UI draws four guides in canvas space from two numbers: the baseline pixel row `gB` and the x-height in pixels `xhPx`:

```
gX = gB - xhPx                 // x-height guide
gA = gB - 2 * xhPx             // ascender guide
gD = gB + (2/3) * xhPx         // descender guide
```

Example: `gB = 340`, `xhPx = 120` gives `gA = 100, gX = 220, gB = 340, gD ≈ 420` (exactly `420` since `(2/3)*120 = 80`).

### 0.5 Pipeline order (authoritative)

```
raw samples
 → N1  guide mapping px → em                (§2.2)
 → N2  session scale-drift correction       (§2.3)
 → N3  class snapping (punct/symbols)       (§2.4)
 → N4  x-translation + side bearings        (§2.5)
 → N5  arc-length resampling                (§3.1)
 → N6  pressure synthesis + taper           (§3.2)
 → N7  One Euro smoothing                   (§3.3)
 → N8  Schneider Bezier fitting             (§3.4)
 → N9  anchors, profiles, StyleProfile      (§2.6, §2.7)
 → derived-cache NormalizedGlyph            (stored in GlyphPack)
```

Rendering (§3.5–§3.7, §4) consumes only `NormalizedGlyph`.

### 0.6 Constants table (single source of truth)

```ts
export const K = {
  // normalization
  LSB: 40, RSB: 40,
  DRIFT_MIN_SAMPLES: 6, DRIFT_CLAMP_LO: 0.8, DRIFT_CLAMP_HI: 1.25,
  // preprocessing
  RESAMPLE_DS: 9,            // em units (= 0.03 * xHeight)
  DOT_MAX_LEN: 6,            // em units; strokes shorter than this become dots
  ONE_EURO_MIN_CUTOFF: 1.2,  // Hz
  ONE_EURO_BETA: 0.002,      // Hz per (em/s)
  ONE_EURO_D_CUTOFF: 1.0,    // Hz
  FIT_ERROR: 4.5,            // em units (= 0.015 * xHeight)
  FIT_MAX_REPARAM_ITER: 4,
  // pressure
  P_MIN: 0.25, P_MAX: 0.95, V0: 2400, // V0 in em/s (= 8 x-heights/s)
  TAPER_LEN: 18,             // em units
  // ink width
  W_GAMMA: 0.7, W_BASE: 0.40, W_GAIN: 0.85,
  // outline
  OUTLINE_STEP: 15,          // em units
  KAPPA: 0.5522847498,       // circle-arc cubic constant
  // kerning
  PROFILE_ROWS: 32, GAP_CAP: 160, TARGET_GAP: 85, KERN_DAMP: 0.7,
  KERN_MIN: -70, KERN_MAX: 40, ROW_W_CORE: 1.0, ROW_W_OUTER: 0.35,
  WORD_SPACE: 260,
  // variance (amplitudes multiply the 0..1 slider value)
  SIGMA_THETA_F: 3.0,   // deg, fast Gaussian slant
  AMP_THETA_M: 4.0,     // deg, medium Perlin slant
  SIGMA_Y_F: 16,        // em, fast Gaussian baseline
  AMP_Y_M: 14,          // em, medium Perlin baseline
  AMP_Y_WAVE: 22,       // em, line-wave Perlin
  WAVE_WAVELENGTH: 1500,// em
  SIGMA_LINE_TILT: 0.35,// deg
  SIGMA_Y_WORD: 8,      // em
  SIGMA_SPACE: 14,      // em
  WORD_SPACE_VAR: 0.25, // fraction
  PRESSURE_JITTER: 0.15,
  THETA_CLAMP: 12,      // deg
  Y_SOFT_CLAMP: 60,     // em
  FATIGUE_GAIN: 0.5, FATIGUE_TAU: 400,
  MEDIUM_PERIOD: 40,    // glyphs
  // perturbation / variants
  PERTURB_SIGMA_KNOT: 3.0, PERTURB_SIGMA_HANDLE: 5.0, HANDLE_MIN: 2,
  POOL_SIZE: 4,
  RECENT_BLOCK: 2,      // forbid same composite id if (k - lastPos) <= 2
  AGE_CAP: 8,
  // ligature
  LEVEL_TOL: 90, LIG_D_MAX: 140, LIG_ANG_TOL_DEG: 70, LIG_DY_MAX: 330,
  LIG_KAPPA: 0.38, LIG_BETA: 0.4, LIG_GAP: 30, LIG_PRESSURE_SCALE: 0.85,
} as const;
```

---

## 1. Data Structures (TypeScript)

```ts
/* ---------- 1.1 Raw capture ---------- */

export type PointerKind = 'mouse' | 'pen' | 'touch'; // trackpads report 'mouse'

/** One coalesced pointer sample. Coordinates are CSS pixels in canvas space. */
export interface RawStrokePoint {
  x: number;            // CSS px, event.clientX - rect.left
  y: number;            // CSS px, event.clientY - rect.top
  pressure: number;     // 0..1 as reported; mouse reports 0.5 while pressed
  tiltX: number;        // degrees, -90..90 (0 if unsupported)
  tiltY: number;        // degrees, -90..90 (0 if unsupported)
  t: number;            // event.timeStamp in ms (monotonic)
  pointerType: PointerKind;
  dpr: number;          // window.devicePixelRatio at capture time
}

export interface CaptureGuides {
  ascenderY: number;    // gA, canvas px
  xHeightY: number;     // gX, canvas px
  baselineY: number;    // gB, canvas px
  descenderY: number;   // gD, canvas px
}

/** Immutable source of truth persisted in IndexedDB (key: `${char}#${variantIndex}`). */
export interface RawGlyphSample {
  char: string;                 // single Unicode code point
  variantIndex: number;         // 0-based; 0..2 for e,t,a,o,i,n,s; 0 otherwise
  sessionIndex: number;         // 0-based global capture order across the whole session
  guides: CaptureGuides;
  penWidthPx: number;           // live-preview pen diameter used during capture, CSS px
  strokes: RawStrokePoint[][];  // pen-down to pen-up, in writing order
  capturedAt: string;           // ISO-8601
}

/* ---------- 1.2 Normalized (derived, cached, versioned) ---------- */

export interface Pt { x: number; y: number; }

export interface CubicBezier { p0: Pt; p1: Pt; p2: Pt; p3: Pt; }

/** Piecewise-linear pressure profile over normalized arc length u in [0,1]. */
export interface PressureKnot { u: number; p: number; }

export interface NormalizedStroke {
  segments: CubicBezier[];        // G1-continuous chain, em space; for dots: one degenerate segment (all 4 points equal)
  pressure: PressureKnot[];       // sorted by u, first u = 0, last u = 1, p in [0,1]
  isDot: boolean;
}

export type GlyphClass =
  | 'x'          // a c e m n o r s u v w x z
  | 'ascender'   // b d f h k l t
  | 'descender'  // g j p q y
  | 'cap'        // A-Z
  | 'digit'      // 0-9
  | 'punct'      // . , ; : ! ? ' " ` - _ ( ) [ ] { } /
  | 'symbol';    // everything else

export interface Anchor {
  x: number;
  y: number;
  tangentRad: number;             // direction of travel at the anchor, y-down atan2
}

export interface NormalizedGlyph {
  id: string;                     // `${char}#${variantIndex}`
  char: string;
  variantIndex: number;
  glyphClass: GlyphClass;
  strokes: NormalizedStroke[];    // writing order
  bbox: { minX: number; minY: number; maxX: number; maxY: number }; // OUTLINE bbox (centerline ± strokeWeight/2); minX === K.LSB
  lsb: number;                    // = K.LSB
  rsb: number;                    // = K.RSB
  advance: number;                // = lsb + (bbox.maxX - bbox.minX) + rsb
  entry: Anchor;                  // first knot of first stroke
  exit: Anchor;                   // last knot of last stroke
  /** Optical profiles for kerning: K.PROFILE_ROWS rows at y_j = 100 + (j + 0.5)*25. null = no ink on that row. */
  leftProfile: (number | null)[]; // min ink x per row (em space)
  rightProfile: (number | null)[];// max ink x per row (em space)
  measuredSlantDeg: number | null;// per-glyph stem slant if measurable (§2.7), else null
}

export interface StyleProfile {
  slantDeg: number;               // median stem slant, + = leans right
  aspectRatio: number;            // median (outline width / centerline height) of x-class glyphs
  strokeWeight: number;           // W, em units: median(penWidthPx_i * s_i)
  driftSlopePerIndex: number;     // b from §2.3 (0 if not fitted)
  driftMeanIndex: number;         // i-bar from §2.3
}

export interface GlyphPack {
  version: 1;
  unitsPerEm: 1000;
  metrics: typeof EM;
  style: StyleProfile;
  /** glyphs[char] = base variants. length 1..3. Perturbation instances are generated on demand (§4.5). */
  glyphs: Record<string, NormalizedGlyph[]>;
  createdAt: string;              // ISO-8601
}

/* ---------- 1.3 Variance ---------- */

export interface VarianceConfig {
  seed: number;                   // uint32
  slantJitter: number;            // 0..1 slider, default 0.5
  baselineDrift: number;          // 0..1 slider, default 0.5
  spacingVariance: number;        // 0..1 slider, default 0.5
  inkPressure: number;            // 0..1 slider, default 0.5; also the I in §3.6
  mode: 'print' | 'semi-cursive'; // default 'print'
  poolSize: number;               // perturbation instances per base variant, default K.POOL_SIZE; 1 disables pooling
}

export const DEFAULT_VARIANCE: VarianceConfig = {
  seed: 12345, slantJitter: 0.5, baselineDrift: 0.5,
  spacingVariance: 0.5, inkPressure: 0.5, mode: 'print', poolSize: 4,
};
```

---

## 2. Normalization Pipeline (raw canvas → 0..1000 em-square)

### 2.1 Per-sample scale factor and pen weight

For each `RawGlyphSample` `i` with guides `(gA, gX, gB, gD)`:

```
xhPx_i = gB - gX
s_i    = EM.xHeight / xhPx_i = 300 / xhPx_i        // em per canvas px
W_i    = penWidthPx_i * s_i                        // em
```

Compute `W_i` for **all** samples first, then set the pack-wide stroke weight:

```
W = median(W_i over all samples)     // StyleProfile.strokeWeight
```

`W` is used for every outline bbox and every rendered outline of the pack. (Samples are not given individual widths; this is what makes weight a measured, pack-level style property.)

### 2.2 N1 — Guide mapping (px → em)

Uniform scale (aspect ratio is preserved), with the baseline pinned to `EM.baselineY`:

```
x1 = s_i * x
y1 = EM.baselineY + (y - gB) * s_i
```

Verification of anchors (for guides `gA=100, gX=220, gB=340, gD=420`, `s=2.5`):

| Guide | px | em |
|---|---|---|
| ascender | 100 | `700 + (100-340)*2.5 = 100` ✔ |
| x-height | 220 | `700 + (220-340)*2.5 = 400` ✔ |
| baseline | 340 | `700` ✔ |
| descender | 420 | `700 + (420-340)*2.5 = 900` ✔ |

`x1` is left unshifted until N4. Every raw point's `pressure, tiltX, tiltY, t, pointerType` is carried along unchanged.

### 2.3 N2 — Session scale-drift correction (accidental drift only)

Goal: remove the **linear trend** in glyph size across the capture session while preserving the user's habitual size.

1. Let `X-class = { a c e m n o r s u v w x z }`. Collect every sample whose `char` is in X-class. If fewer than `K.DRIFT_MIN_SAMPLES` (6), set `b = 0`, `ī = 0` and skip to step 5.
2. For each collected sample `j`, after N1, compute the centerline height `h_j = max(y1) - min(y1)` over all points of all strokes.
3. `M = median(h_j)`. `r_j = ln(h_j / M)`. Let `i_j = sessionIndex_j`, `ī = mean(i_j)`, `r̄ = mean(r_j)`.
4. Ordinary least squares slope (log-size per capture index):
   ```
   b = Σ (i_j - ī)(r_j - r̄) / Σ (i_j - ī)²        // if the denominator is 0, b = 0
   ```
5. For **every** sample (any char) with `sessionIndex = i`:
   ```
   k_i = clamp( exp( -b * (i - ī) ), K.DRIFT_CLAMP_LO, K.DRIFT_CLAMP_HI )
   cx  = (min(x1) + max(x1)) / 2                  // centerline bbox center x
   x2  = cx + k_i * (x1 - cx)
   y2  = EM.baselineY + k_i * (y1 - EM.baselineY)
   ```
6. Store `StyleProfile.driftSlopePerIndex = b`, `driftMeanIndex = ī`.

Properties: `exp(-b(i-ī))` has geometric mean 1 over the fitted indices, so the median size is preserved; only the trend is removed. The scale pivots on the baseline so descenders and ascenders scale consistently.

### 2.4 N3 — Class snapping for punctuation and symbols

Letters, digits, and capitals are **never** snapped (the capture guides already placed them). Only the characters in this table are translated **vertically** (no scaling, so the user's size is preserved). Anchors refer to the **outline bbox** (`centerline ± W/2`):

| Characters | Anchor | Target `y` (em) |
|---|---|---|
| `.` | bottom | `EM.baselineY` (700) |
| `,` | top | `EM.baselineY - 90` (610) |
| `:` | bottom | `EM.baselineY` (700) |
| `;` | top | `EM.xHeightY` (400) |
| `!` `?` | top | `EM.ascenderY` (100) |
| `'` `"` `` ` `` `^` `*` | top | `EM.ascenderY` (100) |
| `-` `–` `—` | center | `EM.baselineY - 150` (550) |
| `_` | center | `EM.baselineY + 70` (770) |
| `+` `=` `<` `>` `~` | center | `EM.baselineY - 150` (550) |
| `(` `)` `[` `]` `{` `}` `/` `\` `\|` | center | `(EM.ascenderY + EM.descenderY) / 2` (500) |

```
outlineTop    = min(y2) - W/2
outlineBottom = max(y2) + W/2
anchorY = top ? outlineTop : bottom ? outlineBottom : (outlineTop + outlineBottom)/2
y3 = y2 + (targetY - anchorY)          // applied to every point of the glyph
x3 = x2
```

### 2.5 N4 — Horizontal translation and side bearings

Place the glyph so its **outline** left edge sits at `K.LSB`:

```
minXc = min(x3)                         // over all centerline points
x4 = x3 - minXc + K.LSB + W/2
y4 = y3
bbox.minX = K.LSB
bbox.maxX = max(x4) + W/2
bbox.minY = min(y4) - W/2
bbox.maxY = max(y4) + W/2
lsb = K.LSB;  rsb = K.RSB
advance = lsb + (bbox.maxX - bbox.minX) + rsb
```

### 2.6 N9a — Entry/exit anchors and optical profiles (computed after fitting, §3.4)

```
entry = { x: seg0.p0.x, y: seg0.p0.y, tangentRad: atan2(p1 - p0) }       // first segment of first stroke
        // if |p1 - p0| < 1e-6 use p2 - p0; if still zero use p3 - p0; else 0
exit  = { x: segN.p3.x, y: segN.p3.y, tangentRad: atan2(p3 - p2) }       // last segment of last stroke
        // if |p3 - p2| < 1e-6 use p3 - p1; if still zero use p3 - p0; else 0
```

**Profiles.** `J = K.PROFILE_ROWS = 32` rows over `y ∈ [100, 900]`, row height 25:

```
y_j = 100 + (j + 0.5) * 25           for j = 0..31
```

Densely sample every stroke centerline every 4 em, with width `w` from §3.6 at the sample's pressure. For each sample `(cx, cy, w)` and each row with `|y_j - cy| ≤ w/2`:

```
halfChord = sqrt( (w/2)² - (y_j - cy)² )
rightProfile[j] = max( rightProfile[j], cx + halfChord )
leftProfile[j]  = min( leftProfile[j],  cx - halfChord )
```

Rows that receive no sample stay `null`. (This is the exact union of round-brush discs.)

### 2.7 N9b — `StyleProfile` measurements

* **`slantDeg`:** from glyphs `l I i t 1 h b d p q` (sample variants all included). For each sample take its **longest stroke by chord length** (from first to last centerline point, after N4). Require chord length `≥ 0.8 * EM.xHeight = 240`. Then
  ```
  θ = atan2( x_last - x_first , y_first - y_last )  (degrees)     // + = leans right
  ```
  Keep samples with `|θ| ≤ 35`. `slantDeg = median(θ)`; if no sample qualifies, `slantDeg = 0`. Each glyph's own value is stored in `measuredSlantDeg` (`null` if not measured).
* **`aspectRatio`:** median over X-class samples of `(bbox.maxX - bbox.minX) / (bbox.maxY - bbox.minY)`; default `1` if no X-class sample.
* **`strokeWeight`:** `W` from §2.1.

The generator **never removes** the user's slant. `slantDeg` is used only as the reference direction for ligature tangent sanity (§4.4) and exposed to the UI.

---

## 3. Stroke Smoothing and Variable-Width Ink

### 3.1 N5 — Arc-length resampling

Input: the stroke's N4-space points. Let `L = Σ|P_i - P_{i-1}|`.

* **Dot rule:** if `L < K.DOT_MAX_LEN` (6 em) → `isDot = true`. Stroke becomes one degenerate segment with `p0=p1=p2=p3 = mean(points)`, pressure `[{u:0,p},{u:1,p}]` with `p` = mean raw pressure (or synthesized per §3.2 using `v = 0`), and skips §3.2–§3.4.
* Otherwise emit points at arc-length positions `s_m = m * K.RESAMPLE_DS` for `m = 0, 1, …, floor(L / DS)`. If `L - s_last ≥ 0.4 * DS`, append the end point; otherwise **replace** the last emitted point with the true end point. Every channel (`x, y, pressure, tiltX, tiltY, t`) is linearly interpolated between the two surrounding original samples.
* If `t` is missing or the stroke duration is `≤ 0`, set `t_m = m * 8` ms.
* Relative time: `t ← (t - t_0) / 1000` (seconds).

### 3.2 N6 — Pressure resolution, synthesis, taper

A stroke needs **synthesized** pressure if **any** is true:

1. `pointerType !== 'pen'`
2. every `pressure === 0`
3. every `pressure === 0.5`
4. `max(pressure) - min(pressure) < 0.02`

Synthesis (inverse stroke velocity). Velocity `v_m` in em/s by central differences on the resampled points:

```
v_m = | P_{m+1} - P_{m-1} | / ( t_{m+1} - t_{m-1} )          // one-sided at the ends
p_m = K.P_MIN + (K.P_MAX - K.P_MIN) * exp( -v_m / K.V0 )        // P_MIN=0.25, P_MAX=0.95, V0=2400
```

(Slow = heavy ink; fast = light.) After synthesis, smooth `p` with a 3-tap kernel `[0.25, 0.5, 0.25]` (end points copy their neighbor).

Taper (applied to **both** real and synthesized pressure), with `s` the arc length from the stroke start and `S` the stroke length:

```
smoothstep(a,b,x) = t²(3 - 2t),  t = clamp((x-a)/(b-a), 0, 1)
tp(s)   = 0.55 + 0.45 * smoothstep(0, K.TAPER_LEN, s)
p_m    ← p_m * min( tp(s_m), tp(S - s_m) )
```

Finally `p_m = clamp(p_m, 0, 1)`.

### 3.3 N7 — One Euro smoothing

Applied to `(x, y)` jointly (shared scalar cutoff from the 2-D speed). Pressure is **not** filtered here. Parameters: `minCutoff = 1.2 Hz`, `beta = 0.002`, `dCutoff = 1.0 Hz`.

```ts
const alpha = (fc: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * fc * dt)); // tau/dt with tau = 1/(2π fc)

// points[0] and points[n-1] are pinned: output = input.
xhat[0] = P[0]; dxhat = (0,0)
for m = 1..n-1:
  dt   = max(t[m] - t[m-1], 1e-3)                       // seconds
  dRaw = (P[m] - xhat[m-1]) / dt                        // vector, em/s
  dxhat = dxhat + alpha(dCutoff, dt) * (dRaw - dxhat)
  fc   = minCutoff + beta * |dxhat|
  xhat[m] = xhat[m-1] + alpha(fc, dt) * (P[m] - xhat[m-1])
xhat[n-1] = P[n-1]                                      // re-pin the end
```

### 3.4 N8 — Schneider cubic Bezier fitting (`ε = 4.5 em`)

Fit a chain of cubic Beziers to the filtered points `P_0..P_n` (n ≥ 1) with maximum distance error `ε = K.FIT_ERROR`.

**`fitCubic(P[first..last], t̂1, t̂2)`:**

1. If `last - first == 1`: `d = |P_last - P_first|`; return `{ p0=P_first, p1=P_first + t̂1·d/3, p2=P_last + t̂2·d/3, p3=P_last }`.
2. Chord-length parameter: `u_first = 0; u_i = u_{i-1} + |P_i - P_{i-1}|`; divide all by `u_last`.
3. Initial fit `generateBezier` (below). Compute `maxSqErr` and its index `splitIdx` (the point with largest squared distance to the curve at `u_i`).
4. If `maxSqErr < ε²`: return the curve.
5. If `maxSqErr < 4ε²` (close enough to refine), repeat up to `K.FIT_MAX_REPARAM_ITER = 4` times: Newton–Raphson reparameterization (below), `generateBezier`, recompute error; return as soon as `maxSqErr < ε²`.
6. Otherwise split at `splitIdx` (clamped to `[first+1, last-1]`): `tC = normalize(P_{m-1} - P_{m+1})`; return `fitCubic(first..m, t̂1, tC)` followed by `fitCubic(m..last, -tC, t̂2)`.

**End tangents** (3-point, for noise robustness; `n ≥ 2`): `t̂1 = normalize(P_2 - P_0)`, `t̂2 = normalize(P_{n-2} - P_n)`. If `n == 1`: `t̂1 = normalize(P_1 - P_0)`, `t̂2 = -t̂1`. A zero-length vector falls back to `(1, 0)`.

**`generateBezier`:** Bernstein basis `B0 = (1-u)³, B1 = 3u(1-u)², B2 = 3u²(1-u), B3 = u³`.

```
A1_i = t̂1 · B1(u_i)             (vector)
A2_i = t̂2 · B2(u_i)             (vector)
C00 = Σ A1_i·A1_i   C01 = Σ A1_i·A2_i   C11 = Σ A2_i·A2_i     (C10 = C01)
d_i = P_i - ( P_first·(B0+B1) + P_last·(B2+B3) )
X0  = Σ A1_i·d_i    X1 = Σ A2_i·d_i
det = C00·C11 - C01·C01
α1 = (X0·C11 - X1·C01) / det
α2 = (C00·X1 - C01·X0) / det
segLen = |P_last - P_first|;  ε_α = 1e-6 · segLen
if |det| < 1e-12 or α1 < ε_α or α2 < ε_α: α1 = α2 = segLen / 3
p0 = P_first;  p3 = P_last
p1 = p0 + t̂1·α1;  p2 = p3 + t̂2·α2
```

**Newton–Raphson reparameterization** per point:

```
Q(u) = cubic;  Q'(u), Q''(u) = first and second derivative
u ← u - ( (Q(u) - P)·Q'(u) ) / ( Q'(u)·Q'(u) + (Q(u) - P)·Q''(u) )
if the denominator is 0, keep u
```

Joins between consecutive output segments share the center tangent `tC`, so the chain is **G1-continuous** at every interior knot.

**Pressure profile:** for the filtered points `P_m` with cumulative arc `a_m`, store `{ u: a_m / a_n, p: p_m }`. (`u` is normalized arc length; this is independent of Bezier parametrization.)

### 3.5 Catmull-Rom → cubic Bezier (exact conversion)

Used to turn a **sampled polyline** (ribbon edges, §3.7) into compact cubic segments. Because these points are uniformly spaced in arc length, the **uniform** Catmull-Rom (tension 0.5) is the correct parametrization.

For consecutive points `P_{i-1}, P_i, P_{i+1}, P_{i+2}`, the cubic from `P_i` to `P_{i+1}` is:

```
B0 = P_i
B1 = P_i     + (P_{i+1} - P_{i-1}) / 6
B2 = P_{i+1} - (P_{i+2} - P_i)     / 6
B3 = P_{i+1}
```

**End conditions (reflection):**

```
P_{-1}  = 2·P_0 - P_1              // before the first point
P_{n+1} = 2·P_n - P_{n-1}          // after the last point
```

A 2-point input therefore produces the straight cubic with `B1 = P0 + (P1-P0)/3`, `B2 = P1 - (P1-P0)/3`.

```ts
export function catmullRomToBeziers(P: Pt[]): CubicBezier[] {
  const n = P.length - 1;
  const at = (i: number): Pt =>
    i < 0 ? { x: 2 * P[0].x - P[1].x, y: 2 * P[0].y - P[1].y }
    : i > n ? { x: 2 * P[n].x - P[n - 1].x, y: 2 * P[n].y - P[n - 1].y }
    : P[i];
  const out: CubicBezier[] = [];
  for (let i = 0; i < n; i++) {
    const a = at(i - 1), b = P[i], c = P[i + 1], d = at(i + 2);
    out.push({
      p0: b,
      p1: { x: b.x + (c.x - a.x) / 6, y: b.y + (c.y - a.y) / 6 },
      p2: { x: c.x - (d.x - b.x) / 6, y: c.y - (d.y - b.y) / 6 },
      p3: c,
    });
  }
  return out;
}
```

### 3.6 Pressure → ink width

Inputs: pack `W = StyleProfile.strokeWeight` (em), pressure `p ∈ [0,1]`, ink slider `I = VarianceConfig.inkPressure ∈ [0,1]`.

```
q(p) = p ^ K.W_GAMMA                                   // γ = 0.7
shape(p) = K.W_BASE + K.W_GAIN * q(p)                  // 0.40 + 0.85 q  ∈ [0.40, 1.25]
w(p) = W * ( (1 - I) + I * shape(p) )
```

* `I = 0` → constant-width gel pen: `w = W` for every `p`.
* `I = 1` → full fountain-pen dynamics: `w ∈ [0.40·W, 1.25·W]`.
* Pressure is multiplied by the per-glyph factor from §4.7 **before** this function and then clamped to `[0,1]`.

### 3.7 Variable-width ribbon outline (filled polygon of cubics)

For each non-dot stroke:

**A. Centerline sampling.** Evaluate every Bezier segment at 32 uniform `t` values, accumulate a cumulative arc-length table, and invert it linearly to obtain points at arc lengths `s_k = k · K.OUTLINE_STEP` (15 em), `k = 0..floor(S/15)`, always appending `s = S` (replace the last if it is within 0.4·15 of `S`). Minimum 3 points; if `S < 30`, use `s ∈ {0, S/2, S}`. For each sample, retain the Bezier `t` and `u = s / S`.

**B. Per-sample geometry.** With analytic derivatives `v = C'(t)`, `a = C''(t)`:

```
T = v / |v|                         (if |v| < 1e-9 use the previous T; the first falls back to the chord direction)
N = ( T.y, -T.x )                   // left normal in y-down space (heading right ⇒ N points up)
p = pressureAt(u)                   // linear interpolation of the PressureKnot[]
half = w(p') / 2                    // p' = clamp(p * pressureMultiplier, 0, 1), w from §3.6
κc = (v.x·a.y - v.y·a.x) / |v|³     // signed curvature
if |κc| > 1e-6:  half = min(half, 0.9 / |κc|)      // prevents ribbon inversion on tight turns
L_k = C_k + N_k · half_k
R_k = C_k - N_k · half_k
```

**C. Path construction (single closed subpath, fill rule: nonzero `f`, never `f*`):**

```
M  L_0
cubics: catmullRomToBeziers([L_0..L_n])                   // left edge, forward
cap_end:   r = half_n, A = C_n + r·T_n
  c(L_n + κ·r·T_n,  A + κ·r·N_n,  A)
  c(A - κ·r·N_n,    R_n + κ·r·T_n, R_n)
cubics: catmullRomToBeziers([R_n..R_0])                   // right edge, reversed list
cap_start: r = half_0, A0 = C_0 - r·T_0
  c(R_0 - κ·r·T_0,  A0 - κ·r·N_0,  A0)
  c(A0 + κ·r·N_0,   L_0 - κ·r·T_0, L_0)
Z
```

with `κ = K.KAPPA = 0.5522847498`. Each `c(c1, c2, end)` is a cubic from the current point. The two caps are half-discs of radius `half` approximated by two quarter-arc cubics each.

**D. Dots (`isDot`):** a full circle of radius `w(p)/2` centered at the dot center, as four quarter-arc cubics with `κ`.

**E. Overlap.** All strokes of a glyph (and any ligature ribbon) are emitted in one path and filled once with the nonzero rule, so intentional overlaps (e.g., the crossbar of `t`) union cleanly.

---

## 4. Procedural Variance Equations

All math in this section is in em units. All randomness is **stateless and counter-based**: a value depends only on `(seed, index, channel)`, never on evaluation order. This makes output deterministic and independent of rendering order (preview, PDF worker).

### 4.1 Hashing, uniform, Gaussian, Perlin (exact reference code)

```ts
const mix32 = (h: number): number => {
  h >>>= 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B);
  h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35);
  h ^= h >>> 16;
  return h >>> 0;
};

export const hash32 = (seed: number, i: number, ch: number): number => {
  let h = mix32((seed ^ 0x9E3779B9) >>> 0);
  h = mix32((h ^ Math.imul((i  >>> 0) + 1, 0x85EBCA6B)) >>> 0);
  h = mix32((h ^ Math.imul((ch >>> 0) + 1, 0xC2B2AE35)) >>> 0);
  return h >>> 0;
};

/** Uniform in [0,1). */
export const u01 = (seed: number, i: number, ch: number): number =>
  hash32(seed, i, ch) / 4294967296;

/** Standard normal via Box-Muller, clamped to ±3. Uses channels 0x1000+2ch and 0x1000+2ch+1. */
export const gauss = (seed: number, i: number, ch: number): number => {
  const u1 = Math.max(u01(seed, i, 0x1000 + 2 * ch), 1e-12);
  const u2 = u01(seed, i, 0x1000 + 2 * ch + 1);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(-3, Math.min(3, z));
};

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** 1-D gradient (Perlin) noise, output in [-1, 1]. Gradients g(i) ∈ [-1,1] from channel 0x2000+ch. */
export const perlin1 = (seed: number, ch: number, x: number): number => {
  const i0 = Math.floor(x), t = x - i0;
  const g = (i: number) => 2 * u01(seed, i >>> 0, 0x2000 + ch) - 1;
  const n0 = g(i0) * t;
  const n1 = g(i0 + 1) * (t - 1);
  return 2 * (n0 + fade(t) * (n1 - n0));   // max |n0 + fade(t)(n1-n0)| = 0.5, so ×2 normalizes to ±1
};

/** FNV-1a 32-bit, used to derive per-glyph instance seeds. */
export const fnv1a32 = (s: string): number => {
  let h = 0x811C9DC5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};

export const CH = {
  SLANT_F: 1, BASE_F: 2, SLANT_M: 3, BASE_M: 4, LINE_WAVE: 5, LINE_TILT: 6,
  WORD: 7, SPACE: 8, VARIANT: 9, PERTURB: 32, PRESSURE: 11, LIG: 12,
} as const;
```

### 4.2 Indices used by the equations

* `k` — 0-based index of the character within the **paragraph**, counting every character including spaces. (A paragraph is text between `\n\n`; `\n` within a paragraph resets nothing.)
* `L` — 0-based line index within the page flow (wrap or explicit newline).
* `w` — 0-based word index within the paragraph.
* `X_k` — glyph origin x on its line (em units from the left margin), defined by §4.4.

Slider values: `sθ = slantJitter`, `sy = baselineDrift`, `ss = spacingVariance`, `sp = inkPressure`, each in `[0,1]`.

### 4.3 Per-character slant `θ` and vertical offset `Δy`

**Fatigue envelope** (amplitudes grow slowly through a paragraph):

```
F(k) = 1 + K.FATIGUE_GAIN * (1 - exp(-k / K.FATIGUE_TAU))        // 0.5, 400
```

**Slant (degrees):**

```
zθ   = gauss(seed, k, CH.SLANT_F)
pθ   = perlin1(seed, CH.SLANT_M, k / K.MEDIUM_PERIOD)            // period 40 glyphs
θdeg = clamp( F(k) * ( K.SIGMA_THETA_F * sθ * zθ + K.AMP_THETA_M * sθ * pθ ), -12, +12 )
θ    = θdeg * π / 180
```

**Glyph baseline offset (em):**

```
zy   = gauss(seed, k, CH.BASE_F)
py   = perlin1(seed, CH.BASE_M, k / K.MEDIUM_PERIOD)
Δy_g = F(k) * ( K.SIGMA_Y_F * sy * zy + K.AMP_Y_M * sy * py )
```

**Line-level terms (the "line wave", §4.3a):**

```
τ_L(deg) = K.SIGMA_LINE_TILT * gauss(seed, L, CH.LINE_TILT)          // per-line tilt, 0.35° σ
wave(X,L) = K.AMP_Y_WAVE * sy * perlin1(seed, CH.LINE_WAVE, X / K.WAVE_WAVELENGTH + 7.31 * L)
Δy_line   = tan(τ_L·π/180) * X_k + wave(X_k, L)                      // m_L · X + wave
```

**Word-level term:**

```
Δy_word = K.SIGMA_Y_WORD * sy * gauss(seed, w, CH.WORD)             // 8 em σ at sy = 1
```

**Total and soft clamp (keeps text "floating" around the ruled line, never wandering off it):**

```
Δy_raw = Δy_g + Δy_line + Δy_word
Δy     = K.Y_SOFT_CLAMP * tanh( Δy_raw / K.Y_SOFT_CLAMP )            // 60 em = 0.2 x-height
```

**Placement transform of a glyph point `(x, y)` (local em → line space):** rotate about the pivot `(pivX, EM.baselineY)` where `pivX = (bbox.minX + bbox.maxX)/2`:

```
c = cos θ,  s = sin θ,  dx = x - pivX,  dy = y - EM.baselineY
ℓx = X_k + pivX + c·dx - s·dy
ℓy = Δy + s·dx + c·dy                      // ℓy = 0 on the ruled line; negative is above the line
```

Check: for positive `θ`, a point above the baseline (`dy < 0`) moves right (`-s·dy > 0`), i.e. the glyph leans right.

### 4.4 Spacing: dynamic kerning, word gaps, ligature blending

**Optical (area-based) kerning for pair `(A, B)` in print mode.** With `adv_A = A.advance`, rows `j = 0..31`, weights

```
w_j = K.ROW_W_CORE (1.0)  if 400 ≤ y_j ≤ 700      // x-height band
      K.ROW_W_OUTER (0.35) otherwise              // ascender/descender zones
```

gap at zero kern:

```
g_j = K.GAP_CAP (160)                                              if A.rightProfile[j] == null or B.leftProfile[j] == null
    = min( adv_A + B.leftProfile[j] - A.rightProfile[j], 160 )     otherwise
ĝ0  = Σ w_j g_j / Σ w_j                                            // mean optical gap
δ_opt = clamp( K.KERN_DAMP * ( K.TARGET_GAP - ĝ0 ), K.KERN_MIN, K.KERN_MAX )   // 0.7·(85 − ĝ0), clamp [−70, +40]
```

**Per-gap random spacing:**

```
zs   = gauss(seed, k, CH.SPACE)                  // k = index of the glyph that is being placed (the right-hand glyph)
δ_var = K.SIGMA_SPACE * ss * zs                  // 14 em σ at ss = 1
```

**Pen advance (print mode)**, for consecutive letters `A` (index `k-1`) and `B` (index `k`) in the same word:

```
X_k = X_{k-1} + adv_A + δ_opt + δ_var
```

**Word gap** (the space character, index `k_sp`):

```
zw = clamp( gauss(seed, k_sp, CH.SPACE), -2, 2 )
X_next = X_prev_glyph_end + K.WORD_SPACE * ( 1 + K.WORD_SPACE_VAR * ss * zw )
```

where `X_prev_glyph_end = X_{k-1} + adv_{k-1}`. No kerning is applied across a space. A line wraps when `X + adv > lineWidth_em`; the break is always at a space and the next line starts at `X = 0`. Punctuation follows the same rules as letters.

**Whitespace & Newlines:** Consecutive spaces each advance by `K.WORD_SPACE * (1 + K.WORD_SPACE_VAR * ss * zw)`. Tabs (`\t`) advance by `4 * K.WORD_SPACE`. A single `\n` sets `X = 0` and increments `L += 1` without resetting `k` or `w`. A paragraph break (`\n\n`) sets `X = 0`, increments `L += 1`, and resets `k = 0, w = 0`.

**Fallback Glyphs:** Normalize smart quotes (`“”` → `"`, `‘’` → `'`) and dashes (`—–` → `-`) before lookup. If a character is still missing from `GlyphPack.glyphs`, advance by `0.6 * K.WORD_SPACE` and record its index in a `missingChars` warning array.

**Semi-cursive mode — ligature connection (letters only, same word).** Let `E` be glyph `A`'s **placed** exit anchor and `S0` glyph `B`'s entry anchor in B's *own transformed local frame* (i.e., after §4.5 perturbation and the §4.3 rotation, relative to B's origin). Choose B's origin so the entry sits `g_lig` to the right of the exit:

```
g_lig = K.LIG_GAP * (1 + 0.25 * ss * clamp(gauss(seed, k, CH.LIG), -2, 2))   // 30 em nominal
X_k   = E.x + g_lig - S0.x                                                   // line-space x of B's origin
S     = placed entry anchor of B = (E.x + g_lig, Y_k(S0.y))
```

*Compatibility test (all must hold; otherwise fall back to the print-mode advance above):*

```
level(y) = 'low'  if |y - EM.baselineY| ≤ LEVEL_TOL (90)             // y measured in em space, i.e. glyph-local y         = 'high' if |y - EM.xHeightY| ≤ 90
         = 'none' otherwise
1. level(E.y) ≠ 'none'  and  level(S.y) ≠ 'none'
2. d = |S - E| ≤ K.LIG_D_MAX (140)
3. |S.y - E.y| ≤ K.LIG_DY_MAX (330)
4. χ = atan2(S.y - E.y, S.x - E.x)
   |wrap(φ_A - χ)| ≤ 70°      φ_A = exit tangent of A
   |wrap(ψ_B - χ)| ≤ 70°      ψ_B = entry tangent of B
```

(Both glyph's tangent angles are rotated by their own `θ` before the test: `φ_A ← φ_A + θ_A`, `ψ_B ← ψ_B + θ_B`.) `level()` is evaluated on the **glyph-local** anchor `y` values (em space), before adding `Δy`.

*Tangent blending and ligature Bezier.* Pull each tangent toward the chord to avoid loops; `β = K.LIG_BETA = 0.4`:

```
φ' = χ + (1 - β) * wrap(φ_A - χ)
ψ' = χ + (1 - β) * wrap(ψ_B - χ)
d  = |S - E|;  h = K.LIG_KAPPA * d                       // 0.38 d
P0 = E
P1 = E + h * (cos φ', sin φ')
P2 = S - h * (cos ψ', sin ψ')
P3 = S
```

The ligature is one extra cubic stroke. Its pressure profile is the linear ramp `p(u) = LIG_PRESSURE_SCALE * ( p_E + (p_S - p_E) * u )` with `p_E` = last pressure knot of A's last stroke, `p_S` = first pressure knot of B's first stroke, `LIG_PRESSURE_SCALE = 0.85`. It is rendered with the §3.7 ribbon and merged into the same fill path.

### 4.5 Control-point perturbation (so single-sample glyphs vary)

Each base variant owns a **pool of `M = poolSize` perturbed instances** (default 4). An instance is deterministic from the seed and glyph, and independent of text position (so it can become a reusable PDF Form XObject, §6.2).

```
glyphHash   = fnv1a32(glyph.id)
instSeed(c) = hash32(seed, glyphHash, 0x3000 + c)         // c = v*M + m  (composite id, see §4.6)
```

Walk all knots of the glyph in writing order with a global knot index `j` (a knot is a segment joint; segment `i` of a stroke has knots `p0` and `p3`, with interior joints shared). For knot `j` at position `Q`, unit tangent `T_j` (direction of travel; at the ends use the adjacent handle direction):

```
n_j = ( σn * gauss(instSeed, j, CH.PERTURB + 0),  σn * gauss(instSeed, j, CH.PERTURB + 1) )     σn = 3.0 em
m_j =   σh * gauss(instSeed, j, CH.PERTURB + 2)                                                  σh = 5.0 em

Q'      = Q + n_j
H_in'   = H_in  + n_j + m_j * T_j        // incoming handle (control point before the knot), if it exists
H_out'  = H_out + n_j - m_j * T_j        // outgoing handle (control point after the knot), if it exists
```

Because both handles move by the same `n_j` and by opposite multiples of the same tangent direction, a G1 joint (collinear handles) stays G1; the shift `±m_j` only changes handle **lengths**. Clamp each resulting handle length `|H' - Q'|` to at least `K.HANDLE_MIN = 2` em (if shorter, rescale along its direction). A dot's single point moves by `n_j` only.

After perturbation recompute `entry`, `exit`, and the optical profiles (§2.6) for the instance.

### 4.6 Multi-variant glyph selection

For character `c` with `nBase` stored base variants (1..3) and pool size `M`:

```
nEff = nBase * M                      // composite id e = v*M + m, v = base variant, m = pool instance
```

If `nEff == 1`, the selection is `0` (no history touched). Otherwise keep, per character, a history `{ last, lastPos, use[0..nEff-1] }` initialized to `{ -1, -99, all -99 }`. For the glyph at paragraph index `k`:

```
weight[e] = 0                                     if e == last and (k - lastPos) ≤ K.RECENT_BLOCK (2)
          = 1 + 0.5 * min(k - use[e], K.AGE_CAP) / K.AGE_CAP    otherwise     // never-used ⇒ age term = 1 ⇒ weight 1.5
u  = u01(seed, k, CH.VARIANT) * Σ weight
pick = first e such that  u < Σ_{i ≤ e} weight[i]     (fall back to nEff - 1)
```

Then set `last = pick, lastPos = k, use[pick] = k`. The composite id decodes as `v = floor(e / M)`, `m = e % M`.

Guarantees: the same composite is never used twice within 3 consecutive occurrences of that character, so `"ee"`, `"eee"`, `"ss"` always differ, even with a single drawn sample (pool gives `nEff ≥ 2` when `M ≥ 2`).

### 4.7 Ink-pressure variation per glyph

```
zp  = gauss(seed, k, CH.PRESSURE)
m_p = exp( K.PRESSURE_JITTER * sp * zp )                 // 0.15 σ in log-space at sp = 1
```

For XObject reuse the factor is **bucketed**:

```
bucket = 0 if m_p < 0.95;  1 if 0.95 ≤ m_p ≤ 1.05;  2 if m_p > 1.05
pressureMultiplier = [0.9, 1.0, 1.1][bucket]
```

The multiplier is applied to every pressure sample of the glyph before §3.6 and clamped to `[0,1]`. The slider `sp` also sets `I` in §3.6, so `sp = 0` yields perfectly uniform ink.

---

## 5. Unit Test Vectors

All inputs are literal; all outputs were produced by running the reference code above. Tolerance `1e-4` unless integer-exact.

### Test Vector 1 — Normalization (§2)

**Shared setup:** guides `{ ascenderY: 100, xHeightY: 220, baselineY: 340, descenderY: 420 }`, `penWidthPx = 16`, so `xhPx = 120`, `s = 2.5`, `W_i = 40`. Pack `W = 40`, `K.LSB = 40`, `K.RSB = 40`.

**1A — Letter `l` (no snapping, no drift).** Raw single stroke centerline points (CSS px): `(130,100), (140,220), (150,340)`.

| Stage | Output |
|---|---|
| N1 (`x1 = 2.5x`, `y1 = 700 + (y-340)*2.5`) | `(325,100), (350,400), (375,700)` |
| N4 (`x4 = x1 - 325 + 40 + 20`) | `(60,100), (85,400), (110,700)` |
| bbox | `minX = 40, maxX = 130, minY = 80, maxY = 720` |
| advance | `40 + 90 + 40 = 170` |
| slant (§2.7: `atan2(110-60, 700-100)`, degrees) | `4.763642` |

**1B — Comma `,` (class snapping).** Raw single stroke: `(100,330), (103,342), (98,360)`.

| Stage | Output |
|---|---|
| N1 | `(250,675), (257.5,705), (245,750)` |
| N3: outline top `= 675 - 20 = 655`, target top `= 700 - 90 = 610`, shift `= -45` | `y = 630, 660, 705` |
| N4 (`minXc = 245`; `x4 = x - 245 + 60`) | `(65,630), (72.5,660), (60,705)` |
| bbox | `minX = 40, maxX = 92.5, minY = 610, maxY = 725` |
| advance | `40 + 52.5 + 40 = 132.5` |

**1C — Session drift (§2.3).** Six X-class samples with `sessionIndex = 0..5` and centerline heights (em, after N1):
`h = [300, 306, 312.12, 318.3624, 324.729648, 331.22424096]`.

| Quantity | Expected |
|---|---|
| `M = median(h)` | `315.2412` |
| `ī` | `2.5` |
| `b` (OLS slope of `ln(h/M)` on index) | `0.01980263` |
| `k_i = exp(-b(i - 2.5))`, `i = 0..5` | `[1.0507525, 1.0301495, 1.0099505, 0.9901475, 0.9707329, 0.9516989]` |
| corrected heights `h_i * k_i` | all `315.22575` (±1e-4) |

### Test Vector 2 — Curves and Ink Geometry (§3)

**2A — Catmull-Rom → Bezier (§3.5).** Points `P = [(0,0), (100,0), (200,100), (300,100)]`.

| Segment | `p0` | `p1` | `p2` | `p3` |
|---|---|---|---|---|
| 0 (`P0→P1`, uses reflected `P_{-1} = (-100, 0)`) | `(0,0)` | `(33.3333, 0)` | `(66.6667, -16.6667)` | `(100,0)` |
| 1 (`P1→P2`) | `(100,0)` | `(133.3333, 16.6667)` | `(166.6667, 83.3333)` | `(200,100)` |
| 2 (`P2→P3`, uses reflected `P_4 = (400, 100)`) | `(200,100)` | `(233.3333, 116.6667)` | `(266.6667, 100)` | `(300,100)` |

*(Segment 2 check: `p1 = P2 + (P3 - P1)/6 = (200 + 200/6, 100 + 100/6)`; `p2 = P3 - (P4 - P2)/6 = (300 - 200/6, 100 - 0)`.)*

**2B — Ribbon left edge and end cap (§3.7).** Centerline samples `C = (0,0), (50,0), (100,0)` with full widths `20, 30, 20` (half = `10, 15, 10`). `T = (1,0)`, `N = (T.y, -T.x) = (0,-1)`.

| Quantity | Expected |
|---|---|
| `L = C + N·half` | `(0,-10), (50,-15), (100,-10)` |
| `R = C - N·half` | `(0,10), (50,15), (100,10)` |
| Left cubic 0: `p0, p1, p2, p3` | `(0,-10), (16.6667,-11.6667), (33.3333,-15), (50,-15)` |
| Left cubic 1: `p0, p1, p2, p3` | `(50,-15), (66.6667,-15), (83.3333,-11.6667), (100,-10)` |
| End cap, `r = 10`, `κr = 5.522847`, apex `A = (110,0)` | arc 1: `c1 = (105.5228,-10)`, `c2 = (110,-5.5228)`, end `(110,0)` |
| | arc 2: `c1 = (110, 5.5228)`, `c2 = (105.5228, 10)`, end `(100,10)` |

**2C — Width and pressure synthesis (§3.2, §3.6).**

| Call | Expected |
|---|---|
| `w(p=0.5)` with `W=40, I=0.6` (`q = 0.6155722`, `shape = 0.9233364`) | `38.157673` |
| `w(p)` with `I = 0`, any `p` | `40` exactly |
| Synthesized pressure at `v = 2400 em/s` (before taper/smoothing) | `0.5075156` |
| Synthesized pressure at `v = 0` | `0.95` |

### Test Vector 3 — Procedural Variance (§4)

Config: `seed = 12345`, all four sliders `= 0.5`, `poolSize = 1`.

**3A — Hash/RNG/noise (exact integers for `hash32`).**

| Call | Expected |
|---|---|
| `hash32(12345, 0, 1)` | `3410609713` (exact) |
| `hash32(12345, 1, 1)` | `838824340` (exact) |
| `hash32(0, 0, 0)` | `1380512277` (exact) |
| `u01(12345, 0, 9)`, `u01(12345, 1, 9)`, `u01(12345, 2, 9)` | `0.9901504, 0.2321985, 0.2047120` |
| `gauss(12345, 0, 1)`, `gauss(12345, 1, 1)`, `gauss(12345, 2, 1)` | `-0.7216972, 0.9982477, 2.3140881` |
| `perlin1(12345, 3, x)` for `x = 0, 0.25, 0.5, 1.5, 2.75` | `0, -0.2451686, -0.3040658, 0.2716124, 0.1050410` |

**3B — Per-glyph variance (§4.3, §4.7).** Line `L = 0`, word `w = 0`, `X = 0, 180, 355.5` for `k = 0, 1, 2`.

| Quantity | `k=0` (X=0) | `k=1` (X=180) | `k=2` (X=355.5) |
|---|---|---|---|
| `F(k)` | 1.000000 | 1.001248 | 1.002494 |
| `zθ` | -0.721697 | 0.998248 | 2.314088 |
| `perlin1(seed, SLANT_M, k/40)` | 0 | -0.025750 | -0.051600 |
| **`θ` (deg)** | **-1.082546** | **1.447676** | **3.376332** |
| `zy` | -0.654753 | 0.594515 | -0.690490 |
| `Δy_g` | -5.238020 | 4.853332 | -5.352345 |
| `τ_L` (deg, same for all) | -0.074925 | -0.074925 | -0.074925 |
| `wave` | 0 | 0.211735 | 0.581524 |
| `Δy_line` | 0 | -0.023650 | 0.116639 |
| `Δy_word` | -3.605098 | -3.605098 | -3.605098 |
| `Δy_raw` | -8.843118 | 1.224585 | -8.840804 |
| **`Δy` (soft-clamped)** | **-8.779638** | **1.224415** | **-8.777374** |
| `zs` | 0.216615 | 0.250062 | 1.226217 |
| `δ_var = 7·zs` | 1.516304 | 1.750433 | 8.583518 |
| `m_p` | 0.954250 | 0.924409 | 0.982140 |

**3C — Placement transform (§4.3).** Glyph `k = 1`, `X_1 = 180`, `pivX = 60`, local point `(60, 400)`. `θ = 1.447676° = 0.0252667 rad`, `Δy = 1.224415`.

```
dx = 0,  dy = 400 - 700 = -300
ℓx = 180 + 60 + cos(θ)·0 - sin(θ)·(-300) = 247.579208
ℓy = 1.224415 + sin(θ)·0 + cos(θ)·(-300) = -298.679829
```

Expected: `(247.579208, -298.679829)`.

**3D — Optical kerning (§4.4).** 4 rows, equal weights `[1,1,1,1]`, `adv_A = 170`, `rightProfile_A = [100,100,100,null]`, `leftProfile_B = [40,40,60,null]`.

```
g = [110, 110, 130, 160(null→cap)]   →   ĝ0 = 127.5
δ_opt = clamp(0.7 · (85 - 127.5), -70, 40) = -29.75
```

Expected: `ĝ0 = 127.5`, `δ_opt = -29.75`.

**3E — Ligature (§4.4).** Placed exit `E = (300,700)`, exit tangent `φ_A = -20°`; placed entry `S = (340,640)`, entry tangent `ψ_B = -50°`; `β = 0.4`, `K.LIG_KAPPA = 0.38`.

| Quantity | Expected |
|---|---|
| Compatibility | **true** (`d = 72.1110 ≤ 140`; both levels `'low'`; `|ΔY| = 60 ≤ 330`; angle deviations `36.31°` and `6.31°` ≤ 70°) |
| `χ` | `-56.309932°` |
| `φ'`, `ψ'` | `-34.523973°`, `-52.523973°` |
| `d`, `h = 0.38 d` | `72.111026`, `27.402190` |
| `P0, P3` | `(300,700)`, `(340,640)` |
| `P1` | `(322.576366, 684.469781)` |
| `P2` | `(323.327701, 661.746596)` |

**3F — Variant selection (§4.6).** `seed = 12345`, `M = 1`, `nBase: { e: 3, a: 3 }`, character stream `"eeeeeeeeaaaa"` (indices `k = 0..11`).

Expected picks (composite id = base variant since `M = 1`):

```
[2, 0, 1, 2, 0, 2, 1, 2, 2, 1, 0, 1]
```

Assertions beyond equality: for every pair of adjacent equal characters in the stream, the picks differ (`e` at `k = 0..7` and `a` at `k = 8..11` never repeat within 3 positions).

### Vitest skeleton

```ts
import { describe, it, expect } from 'vitest';
import { hash32, u01, gauss, perlin1, catmullRomToBeziers } from './mathEngine';

describe('TV3A hash/rng', () => {
  it('hash32 exact', () => {
    expect(hash32(12345, 0, 1)).toBe(3410609713);
    expect(hash32(12345, 1, 1)).toBe(838824340);
    expect(hash32(0, 0, 0)).toBe(1380512277);
  });
  it('gauss/perlin', () => {
    expect(gauss(12345, 0, 1)).toBeCloseTo(-0.7216972, 4);
    expect(perlin1(12345, 3, 0.25)).toBeCloseTo(-0.2451686, 4);
  });
});

describe('TV2A catmull-rom', () => {
  it('segment 1', () => {
    const s = catmullRomToBeziers([{x:0,y:0},{x:100,y:0},{x:200,y:100},{x:300,y:100}])[1];
    expect(s.p1.x).toBeCloseTo(133.3333, 4);
    expect(s.p1.y).toBeCloseTo(16.6667, 4);
    expect(s.p2.x).toBeCloseTo(166.6667, 4);
    expect(s.p2.y).toBeCloseTo(83.3333, 4);
  });
});
```

---

## 6. Output-Size Constraints Implied by the Math

These follow from the 10-page / 2 MB target and justify the pool-and-bucket design of §4.5 and §4.7. They are normative for the PDF stage.

### 6.1 Budget

Assume ≈ 1,300 characters per A4 ruled page (≈ 13,000 over 10 pages). Unique per-instance outlines cannot fit: ~2 strokes × ~350 B = ~700 B per glyph uncompressed ⇒ ~9 MB. Reusable glyph objects can.

### 6.2 Reuse rule

* One PDF **Form XObject** per `(glyphId, compositeId, pressureBucket)` actually used in the document. At most `nBase * M * 3` per glyph (`M = 4`, 3 buckets). Typical document: ≈ 100 glyphs × ≈ 1.4 base variants × 12 ≈ 1,700 XObjects × ≈ 350 B (Flate) ≈ 0.6 MB.
* Each placement emits only a matrix and a `Do`: `q a b c d e f cm /Gn Do Q` (≈ 45 B) ⇒ ≈ 0.6 MB raw for 13,000 glyphs, ≈ 0.2 MB after Flate.
* Ligature ribbons (semi-cursive) are per-placement paths: one cubic per edge plus two caps, ≈ 100 B each.
* Content streams and XObjects must be Flate-compressed (`context.flateStream` in `pdf-lib`).
* Coordinates in XObject streams are written in em units rounded to **1 decimal**; placement matrices use **4 decimals** for `a,b,c,d` and **2 decimals** (points) for `e,f`.

### 6.3 Placement matrix (the only y-flip)

For a glyph at line-space `(X_k, Δy)` with rotation `θ`, pivot `(pivX, 700)`, scale `S = xHeightPt / 300` (points per em unit), page height `H`, rule position `(x0, yRuleFromTop)` in points:

```
// local em (x, y) → PDF (X, Y)
dx = x - pivX;  dy = y - 700
X  = x0 + S * ( X_k + pivX + cosθ·dx - sinθ·dy )
Y  = H - ( yRuleFromTop + S * ( Δy + sinθ·dx + cosθ·dy ) )

a = S·cosθ      b = -S·sinθ
c = -S·sinθ·... (see below)
```

Expanded as the standard `cm` matrix `[a b c d e f]` applied to the **local em coordinates `(x, y)`** of the XObject:

```
a =  S·cosθ
b = -S·sinθ          // PDF y is up, so the screen-space rotation flips sign in b and c
c = -S·sinθ
d = -S·cosθ          // vertical flip
e =  x0 + S·( X_k + pivX - cosθ·pivX + sinθ·700 )
f =  H - yRuleFromTop - S·( Δy - sinθ·pivX - cosθ·700 )
```

Verification against the formula above: with `(x, y) = (pivX, 700)` the matrix gives `X = a·pivX + c·700 + e = x0 + S·(X_k + pivX)` and `Y = b·pivX + d·700 + f = H - yRuleFromTop - S·Δy`, i.e., the baseline pivot lands exactly at `(x0 + S(X_k + pivX), H - yRuleFromTop - SΔy)`, which is what §4.3 specifies for `dx = dy = 0`.

---

*End of specification.*
