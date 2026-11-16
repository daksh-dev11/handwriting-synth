export type PointerKind = 'mouse' | 'pen' | 'touch';

export interface RawStrokePoint {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  t: number;
  pointerType: PointerKind;
  dpr: number;
}

export interface CaptureGuides {
  ascenderY: number;
  xHeightY: number;
  baselineY: number;
  descenderY: number;
}

export interface RawGlyphSample {
  char: string;
  variantIndex: number;
  sessionIndex: number;
  guides: CaptureGuides;
  penWidthPx: number;
  strokes: RawStrokePoint[][];
  capturedAt: string;
}

export interface Pt {
  x: number;
  y: number;
}

export interface CubicBezier {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
}

export interface PressureKnot {
  u: number;
  p: number;
}

export interface NormalizedStroke {
  segments: CubicBezier[];
  pressure: PressureKnot[];
  isDot: boolean;
}

export type GlyphClass =
  | 'x'
  | 'ascender'
  | 'descender'
  | 'cap'
  | 'digit'
  | 'punct'
  | 'symbol';

export interface Anchor {
  x: number;
  y: number;
  tangentRad: number;
}

export interface NormalizedGlyph {
  id: string;
  char: string;
  variantIndex: number;
  glyphClass: GlyphClass;
  strokes: NormalizedStroke[];
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  lsb: number;
  rsb: number;
  advance: number;
  entry: Anchor;
  exit: Anchor;
  leftProfile: (number | null)[];
  rightProfile: (number | null)[];
  measuredSlantDeg: number | null;
}

export interface StyleProfile {
  slantDeg: number;
  aspectRatio: number;
  strokeWeight: number;
  driftSlopePerIndex: number;
  driftMeanIndex: number;
}

export interface GlyphPack {
  version: 1;
  unitsPerEm: 1000;
  metrics: typeof import('./constants').EM;
  style: StyleProfile;
  glyphs: Record<string, NormalizedGlyph[]>;
  createdAt: string;
}

export interface VarianceConfig {
  seed: number;
  slantJitter: number;
  baselineDrift: number;
  spacingVariance: number;
  inkPressure: number;
  mode: 'print' | 'semi-cursive';
  poolSize: number;
}

export const DEFAULT_VARIANCE: VarianceConfig = {
  seed: 12345,
  slantJitter: 0.5,
  baselineDrift: 0.5,
  spacingVariance: 0.5,
  inkPressure: 0.5,
  mode: 'print',
  poolSize: 4,
};

export type PathCmd =
  | { op: 'M'; x: number; y: number }
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'Z' };

export interface CachedOutline {
  path: PathCmd[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LayoutGeometry {
  lineWidthEm: number;
  linesPerPage: number;
  maxPages: number;
}

export interface LigatureCubic {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
  pressureStart: number;
  pressureEnd: number;
}

export interface Placement {
  k: number;
  line: number;
  glyphId: string;
  composite: number;
  bucket: 0 | 1 | 2;
  originX: number;
  dy: number;
  thetaRad: number;
  pivX: number;
  ligatureFromPrev: LigatureCubic | null;
}

export interface LayoutResult {
  placements: Placement[];
  lineCount: number;
  pageCount: number;
  truncated: boolean;
  consumedChars: number;
  missingChars: number[];
}