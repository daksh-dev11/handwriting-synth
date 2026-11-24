import { EM, K } from '../constants';
import { LIMITS } from '../limits';
import { IssueCollector, SINGLE_CHAR_RE, checkKeyWhitelist, isIsoDate, isPlainObject } from './validate';
import type { ValidationIssue, ValidationResult } from './validate';
import type { CubicBezier, GlyphClass, GlyphPack, NormalizedGlyph, NormalizedStroke, PressureKnot, Pt, StyleProfile } from '../types';

const METRIC_KEYS = new Set(['unitsPerEm', 'ascenderY', 'xHeightY', 'baselineY', 'descenderY', 'xHeight']);
const STYLE_KEYS = new Set(['slantDeg', 'aspectRatio', 'strokeWeight', 'driftSlopePerIndex', 'driftMeanIndex']);
const GLYPH_KEYS = new Set([
  'id', 'char', 'variantIndex', 'glyphClass', 'strokes', 'bbox', 'lsb', 'rsb', 'advance',
  'entry', 'exit', 'leftProfile', 'rightProfile', 'measuredSlantDeg',
]);
const BBOX_KEYS = new Set(['minX', 'minY', 'maxX', 'maxY']);
const STROKE_KEYS = new Set(['segments', 'pressure', 'isDot']);
const SEGMENT_KEYS = new Set(['p0', 'p1', 'p2', 'p3']);
const POINT_KEYS = new Set(['x', 'y']);
const ANCHOR_KEYS = new Set(['x', 'y', 'tangentRad']);
const GLYPH_CLASSES = new Set<string>(['x', 'ascender', 'descender', 'cap', 'digit', 'punct', 'symbol']);
const GLYPH_PACK_KEYS = new Set(['version', 'unitsPerEm', 'metrics', 'style', 'glyphs', 'createdAt']);
const PRESSURE_KEYS = new Set(['u', 'p']);

interface Counters {
  segments: number;
}

function fail(c: IssueCollector): { ok: false; issues: ValidationIssue[] } {
  return { ok: false, issues: c.issues };
}

function readFinite(o: Record<string, unknown>, key: string, path: string, c: IssueCollector, lo: number, hi: number): number | null {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    c.add(path, 'NOT_FINITE', `${key} must be a finite number`);
    return null;
  }
  if (v < lo || v > hi) {
    c.add(path, 'OUT_OF_RANGE', `${key} out of range`);
    return null;
  }
  return v;
}

function readPoint(value: unknown, path: string, c: IssueCollector): Pt | null {
  if (!isPlainObject(value)) {
    c.add(path, 'BAD_TYPE', 'point must be an object');
    return null;
  }
  const kw = checkKeyWhitelist(value, POINT_KEYS);
  if (!kw.ok) {
    c.add(`${path}/${kw.key}`, 'UNKNOWN_KEY', 'unknown key');
    return null;
  }
  const x = readFinite(value, 'x', `${path}/x`, c, LIMITS.EM_X_MIN, LIMITS.EM_X_MAX);
  const y = readFinite(value, 'y', `${path}/y`, c, LIMITS.EM_Y_MIN, LIMITS.EM_Y_MAX);
  if (x === null || y === null) return null;
  return { x, y };
}

function readAnchor(value: unknown, path: string, c: IssueCollector): { x: number; y: number; tangentRad: number } | null {
  if (!isPlainObject(value)) {
    c.add(path, 'BAD_TYPE', 'anchor must be an object');
    return null;
  }
  const kw = checkKeyWhitelist(value, ANCHOR_KEYS);
  if (!kw.ok) {
    c.add(`${path}/${kw.key}`, 'UNKNOWN_KEY', 'unknown key');
    return null;
  }
  const x = readFinite(value, 'x', `${path}/x`, c, LIMITS.EM_X_MIN, LIMITS.EM_X_MAX);
  const y = readFinite(value, 'y', `${path}/y`, c, LIMITS.EM_Y_MIN, LIMITS.EM_Y_MAX);
  const tangentRad = readFinite(value, 'tangentRad', `${path}/tangentRad`, c, -Math.PI * 2, Math.PI * 2);
  if (x === null || y === null || tangentRad === null) return null;
  return { x, y, tangentRad };
}

function withinTolerance(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}


function sanitizeSegment(value: unknown, path: string, c: IssueCollector): CubicBezier | null {
  if (!isPlainObject(value)) {
    c.add(path, 'BAD_TYPE', 'segment must be an object');
    return null;
  }
  const kw = checkKeyWhitelist(value, SEGMENT_KEYS);
  if (!kw.ok) {
    c.add(`${path}/${kw.key}`, 'UNKNOWN_KEY', 'unknown key');
    return null;
  }
  const p0 = readPoint(value.p0, `${path}/p0`, c);
  const p1 = readPoint(value.p1, `${path}/p1`, c);
  const p2 = readPoint(value.p2, `${path}/p2`, c);
  const p3 = readPoint(value.p3, `${path}/p3`, c);
  if (!p0 || !p1 || !p2 || !p3) return null;
  return { p0, p1, p2, p3 };
}

function sanitizePressure(value: unknown, path: string, c: IssueCollector): PressureKnot[] | null {
  if (!Array.isArray(value)) {
    c.add(path, 'BAD_TYPE', 'pressure must be an array');
    return null;
  }
  if (value.length < 2 || value.length > LIMITS.MAX_PRESSURE_KNOTS_PER_STROKE) {
    c.add(path, 'CAP_EXCEEDED', 'pressure knot count out of range');
    return null;
  }
  const knots: PressureKnot[] = [];
  let prevU = -1;
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!isPlainObject(item)) {
      c.add(`${path}/${i}`, 'BAD_TYPE', 'knot must be an object');
      return null;
    }
    const kw = checkKeyWhitelist(item, PRESSURE_KEYS);
    if (!kw.ok) {
      c.add(`${path}/${i}/${kw.key}`, 'UNKNOWN_KEY', 'unknown key');
      return null;
    }
    const u = readFinite(item, 'u', `${path}/${i}/u`, c, 0, 1);
    const p = readFinite(item, 'p', `${path}/${i}/p`, c, 0, 1);
    if (u === null || p === null) return null;
    if (i > 0 && u - prevU < 1e-9) {
      c.add(`${path}/${i}/u`, 'INVARIANT_FAILED', 'pressure u must be strictly increasing');
      return null;
    }
    prevU = u;
    knots.push({ u, p });
  }
  if (knots[0].u !== 0 || knots[knots.length - 1].u !== 1) {
    c.add(path, 'INVARIANT_FAILED', 'pressure must start at u=0 and end at u=1');
    return null;
  }
  return knots;
}

function totalChord(segments: readonly CubicBezier[]): number {
  let sum = 0;
  for (const seg of segments) {
    sum += Math.hypot(seg.p3.x - seg.p0.x, seg.p3.y - seg.p0.y);
  }
  return sum;
}

function sanitizeStroke(value: unknown, path: string, c: IssueCollector, counters: Counters): NormalizedStroke | null {
  if (!isPlainObject(value)) {
    c.add(path, 'BAD_TYPE', 'stroke must be an object');
    return null;
  }
  const kw = checkKeyWhitelist(value, STROKE_KEYS);
  if (!kw.ok) {
    c.add(`${path}/${kw.key}`, 'UNKNOWN_KEY', 'unknown key');
    return null;
  }
  if (typeof value.isDot !== 'boolean') {
    c.add(`${path}/isDot`, 'BAD_TYPE', 'isDot must be a boolean');
    return null;
  }
  if (!Array.isArray(value.segments)) {
    c.add(`${path}/segments`, 'BAD_TYPE', 'segments must be an array');
    return null;
  }
  if (value.segments.length < 1 || value.segments.length > LIMITS.MAX_SEGMENTS_PER_STROKE) {
    c.add(`${path}/segments`, 'CAP_EXCEEDED', 'segment count out of range');
    return null;
  }
  counters.segments += value.segments.length;
  if (counters.segments > LIMITS.MAX_SEGMENTS_PER_PACK) {
    c.add(`${path}/segments`, 'CAP_EXCEEDED', 'too many segments across the pack');
    return null;
  }

  const segments: CubicBezier[] = [];
  for (let i = 0; i < value.segments.length; i++) {
    const seg = sanitizeSegment(value.segments[i], `${path}/segments/${i}`, c);
    if (!seg) return null;
    if (i > 0) {
      const prev = segments[i - 1];
      if (Math.hypot(seg.p0.x - prev.p3.x, seg.p0.y - prev.p3.y) > 1e-3) {
        c.add(`${path}/segments/${i}/p0`, 'INVARIANT_FAILED', 'segments must be continuous');
        return null;
      }
    }
    segments.push(seg);
  }

  if (value.isDot) {
    if (segments.length !== 1) {
      c.add(`${path}/segments`, 'INVARIANT_FAILED', 'a dot must have exactly one segment');
      return null;
    }
    const s = segments[0];
    if (s.p0.x !== s.p1.x || s.p1.x !== s.p2.x || s.p2.x !== s.p3.x || s.p0.y !== s.p1.y || s.p1.y !== s.p2.y || s.p2.y !== s.p3.y) {
      c.add(`${path}/segments/0`, 'INVARIANT_FAILED', 'a dot segment must be degenerate');
      return null;
    }
  } else if (totalChord(segments) < K.DOT_MAX_LEN) {
    c.add(`${path}/segments`, 'INVARIANT_FAILED', 'non-dot stroke is too short');
    return null;
  }

  const pressure = sanitizePressure(value.pressure, `${path}/pressure`, c);
  if (!pressure) return null;

  return { segments, pressure, isDot: value.isDot };
}

function sanitizeProfile(value: unknown, path: string, c: IssueCollector): (number | null)[] | null {
  if (!Array.isArray(value)) {
    c.add(path, 'BAD_TYPE', 'profile must be an array');
    return null;
  }
  if (value.length !== K.PROFILE_ROWS) {
    c.add(path, 'INVARIANT_FAILED', `profile must have ${K.PROFILE_ROWS} rows`);
    return null;
  }
  const rows: (number | null)[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (item === null) {
      rows.push(null);
      continue;
    }
    if (typeof item !== 'number' || !Number.isFinite(item) || item < LIMITS.EM_X_MIN || item > LIMITS.EM_X_MAX) {
      c.add(`${path}/${i}`, 'OUT_OF_RANGE', 'profile entry out of range');
      return null;
    }
    rows.push(item);
  }
  return rows;
}

function sanitizeGlyph(value: unknown, key: string, index: number, path: string, c: IssueCollector, counters: Counters): NormalizedGlyph | null {
  if (!isPlainObject(value)) {
    c.add(path, 'BAD_TYPE', 'glyph must be an object');
    return null;
  }
  const kw = checkKeyWhitelist(value, GLYPH_KEYS);
  if (!kw.ok) {
    c.add(`${path}/${kw.key}`, 'UNKNOWN_KEY', 'unknown key');
    return null;
  }
  if (value.char !== key) {
    c.add(`${path}/char`, 'INVARIANT_FAILED', 'char must equal the glyphs key');
    return null;
  }
  if (value.variantIndex !== index) {
    c.add(`${path}/variantIndex`, 'INVARIANT_FAILED', 'variantIndex must equal the array index');
    return null;
  }
  if (value.id !== `${key}#${index}`) {
    c.add(`${path}/id`, 'INVARIANT_FAILED', 'id must be char#variantIndex');
    return null;
  }
  if (typeof value.glyphClass !== 'string' || !GLYPH_CLASSES.has(value.glyphClass)) {
    c.add(`${path}/glyphClass`, 'BAD_TYPE', 'glyphClass unknown');
    return null;
  }

  if (!Array.isArray(value.strokes) || value.strokes.length < 1 || value.strokes.length > LIMITS.MAX_STROKES_PER_GLYPH) {
    c.add(`${path}/strokes`, 'CAP_EXCEEDED', 'stroke count out of range');
    return null;
  }
  const strokes: NormalizedStroke[] = [];
  for (let i = 0; i < value.strokes.length; i++) {
    const stroke = sanitizeStroke(value.strokes[i], `${path}/strokes/${i}`, c, counters);
    if (!stroke) return null;
    strokes.push(stroke);
  }

  if (!isPlainObject(value.bbox)) {
    c.add(`${path}/bbox`, 'BAD_TYPE', 'bbox must be an object');
    return null;
  }
  const bkw = checkKeyWhitelist(value.bbox, BBOX_KEYS);
  if (!bkw.ok) {
    c.add(`${path}/bbox/${bkw.key}`, 'UNKNOWN_KEY', 'unknown key');
    return null;
  }
  const minX = readFinite(value.bbox, 'minX', `${path}/bbox/minX`, c, LIMITS.EM_X_MIN, LIMITS.EM_X_MAX);
  const minY = readFinite(value.bbox, 'minY', `${path}/bbox/minY`, c, LIMITS.EM_Y_MIN, LIMITS.EM_Y_MAX);
  const maxX = readFinite(value.bbox, 'maxX', `${path}/bbox/maxX`, c, LIMITS.EM_X_MIN, LIMITS.EM_X_MAX);
  const maxY = readFinite(value.bbox, 'maxY', `${path}/bbox/maxY`, c, LIMITS.EM_Y_MIN, LIMITS.EM_Y_MAX);
  if (minX === null || minY === null || maxX === null || maxY === null) return null;
  if (!withinTolerance(minX, K.LSB, 1e-6) || maxX <= minX || maxY < minY) {
    c.add(`${path}/bbox`, 'INVARIANT_FAILED', 'bbox violates LSB/extent rules');
    return null;
  }

  const lsb = readFinite(value, 'lsb', `${path}/lsb`, c, K.LSB - 1e-6, K.LSB + 1e-6);
  const rsb = readFinite(value, 'rsb', `${path}/rsb`, c, K.RSB - 1e-6, K.RSB + 1e-6);
  const advance = readFinite(value, 'advance', `${path}/advance`, c, LIMITS.EM_X_MIN, LIMITS.EM_X_MAX);
  if (lsb === null || rsb === null || advance === null) return null;
  if (!withinTolerance(advance, lsb + (maxX - minX) + rsb, 1e-3)) {
    c.add(`${path}/advance`, 'INVARIANT_FAILED', 'advance does not match lsb + width + rsb');
    return null;
  }

  const entry = readAnchor(value.entry, `${path}/entry`, c);
  const exit = readAnchor(value.exit, `${path}/exit`, c);
  if (!entry || !exit) return null;

  const leftProfile = sanitizeProfile(value.leftProfile, `${path}/leftProfile`, c);
  const rightProfile = sanitizeProfile(value.rightProfile, `${path}/rightProfile`, c);
  if (!leftProfile || !rightProfile) return null;

  let measuredSlantDeg: number | null = null;
  if (value.measuredSlantDeg !== null) {
    measuredSlantDeg = readFinite(value, 'measuredSlantDeg', `${path}/measuredSlantDeg`, c, -35, 35);
    if (measuredSlantDeg === null) return null;
  }

  const firstKnot = strokes[0].segments[0].p0;
  const lastStroke = strokes[strokes.length - 1];
  const lastSeg = lastStroke.segments[lastStroke.segments.length - 1];
  if (!withinTolerance(entry.x, firstKnot.x, 1e-3) || !withinTolerance(entry.y, firstKnot.y, 1e-3)) {
    c.add(`${path}/entry`, 'INVARIANT_FAILED', 'entry must equal the first knot');
    return null;
  }
  if (!withinTolerance(exit.x, lastSeg.p3.x, 1e-3) || !withinTolerance(exit.y, lastSeg.p3.y, 1e-3)) {
    c.add(`${path}/exit`, 'INVARIANT_FAILED', 'exit must equal the last knot');
    return null;
  }

  return {
    id: `${key}#${index}`,
    char: key,
    variantIndex: index,
    glyphClass: value.glyphClass as GlyphClass,
    strokes,
    bbox: { minX, minY, maxX, maxY },
    lsb,
    rsb,
    advance,
    entry,
    exit,
    leftProfile,
    rightProfile,
    measuredSlantDeg,
  };
}

function sanitizeGlyphs(value: unknown, c: IssueCollector, counters: Counters): Record<string, NormalizedGlyph[]> | null {
  if (!isPlainObject(value)) {
    c.add('/glyphs', 'BAD_TYPE', 'glyphs must be an object');
    return null;
  }
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (++count > LIMITS.MAX_GLYPH_CHARS) {
      c.add('/glyphs', 'CAP_EXCEEDED', 'too many glyph keys');
      return null;
    }
    if ([...key].length !== 1 || !SINGLE_CHAR_RE.test(key)) {
      c.add(`/glyphs/${key}`, 'BAD_KEY', 'glyph key must be exactly one code point');
      return null;
    }
  }

  const glyphs: Record<string, NormalizedGlyph[]> = {};
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const list = value[key];
    if (!Array.isArray(list) || list.length < 1 || list.length > LIMITS.MAX_VARIANTS_PER_CHAR) {
      c.add(`/glyphs/${key}`, 'CAP_EXCEEDED', 'variant count out of range');
      return null;
    }
    const variants: NormalizedGlyph[] = [];
    for (let i = 0; i < list.length; i++) {
      const glyph = sanitizeGlyph(list[i], key, i, `/glyphs/${key}/${i}`, c, counters);
      if (!glyph) return null;
      variants.push(glyph);
    }
    glyphs[key] = variants;
  }
  return glyphs;
}

function metricsEqual(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  if (!checkKeyWhitelist(value, METRIC_KEYS).ok) return false;
  return (
    value.unitsPerEm === EM.unitsPerEm &&
    value.ascenderY === EM.ascenderY &&
    value.xHeightY === EM.xHeightY &&
    value.baselineY === EM.baselineY &&
    value.descenderY === EM.descenderY &&
    value.xHeight === EM.xHeight
  );
}

function sanitizeStyle(value: unknown, c: IssueCollector): StyleProfile | null {
  if (!isPlainObject(value)) {
    c.add('/style', 'BAD_TYPE', 'style must be an object');
    return null;
  }
  const kw = checkKeyWhitelist(value, STYLE_KEYS);
  if (!kw.ok) {
    c.add(`/style/${kw.key}`, 'UNKNOWN_KEY', 'unknown key');
    return null;
  }
  const slantDeg = readFinite(value, 'slantDeg', '/style/slantDeg', c, -90, 90);
  const aspectRatio = readFinite(value, 'aspectRatio', '/style/aspectRatio', c, Number.MIN_VALUE, 20);
  const strokeWeight = readFinite(value, 'strokeWeight', '/style/strokeWeight', c, Number.MIN_VALUE, 400);
  const driftSlopePerIndex = readFinite(value, 'driftSlopePerIndex', '/style/driftSlopePerIndex', c, -1, 1);
  const driftMeanIndex = readFinite(value, 'driftMeanIndex', '/style/driftMeanIndex', c, 0, LIMITS.MAX_RAW_SAMPLES);
  if (slantDeg === null || aspectRatio === null || strokeWeight === null || driftSlopePerIndex === null || driftMeanIndex === null) return null;
  if (aspectRatio <= 0 || strokeWeight <= 0) {
    c.add('/style', 'OUT_OF_RANGE', 'aspectRatio and strokeWeight must be positive');
    return null;
  }
  return { slantDeg, aspectRatio, strokeWeight, driftSlopePerIndex, driftMeanIndex };
}

export function validateGlyphPack(input: unknown): ValidationResult<GlyphPack> {
  const c = new IssueCollector();
  if (!isPlainObject(input)) {
    c.add('/', 'BAD_TYPE', 'pack must be an object');
    return fail(c);
  }
  const kw = checkKeyWhitelist(input, GLYPH_PACK_KEYS);
  if (!kw.ok) {
    c.add(`/${kw.key}`, 'UNKNOWN_KEY', 'unknown key');
    return fail(c);
  }
  if (input.version !== 1) {
    c.add(`/version`, 'UNSUPPORTED_VERSION', 'version must be 1');
    return fail(c);
  }
  if (input.unitsPerEm !== 1000) {
    c.add(`/unitsPerEm`, 'INVARIANT_FAILED', 'unitsPerEm must be 1000');
    return fail(c);
  }
  if (!metricsEqual(input.metrics)) {
    c.add(`/metrics`, 'INVARIANT_FAILED', 'metrics must equal EM');
    return fail(c);
  }
  if (!isIsoDate(input.createdAt)) {
    c.add(`/createdAt`, 'BAD_DATE', 'createdAt must be ISO-8601');
    return fail(c);
  }
  const style = sanitizeStyle(input.style, c);
  if (!style) return fail(c);
  const counters: Counters = { segments: 0 };
  const glyphs = sanitizeGlyphs(input.glyphs, c, counters);
  if (!glyphs) return fail(c);

  return {
    ok: true,
    value: { version: 1, unitsPerEm: 1000, metrics: EM, style, glyphs, createdAt: input.createdAt },
  };
}

export function sanitizeGlyphPack(input: unknown): GlyphPack | null {
  const result = validateGlyphPack(input);
  return result.ok ? result.value : null;
}