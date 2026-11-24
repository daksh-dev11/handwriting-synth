import { MULTI_VARIANT_CHARS } from '../charset';
import { LIMITS } from '../limits';
import { IssueCollector, SINGLE_CHAR_RE, checkKeyWhitelist, isIsoDate, isPlainObject } from './validate';
import type { ValidationIssue, ValidationResult } from './validate';
import type { CaptureGuides, PointerKind, RawGlyphSample, RawStrokePoint } from '../types';

const SAMPLE_KEYS = new Set(['char', 'variantIndex', 'sessionIndex', 'guides', 'penWidthPx', 'strokes', 'capturedAt']);
const GUIDE_KEYS = new Set(['ascenderY', 'xHeightY', 'baselineY', 'descenderY']);
const POINT_KEYS = new Set(['x', 'y', 'pressure', 'tiltX', 'tiltY', 't', 'pointerType', 'dpr']);
const POINTER_TYPES = new Set<string>(['mouse', 'pen', 'touch']);
const MULTI = new Set<string>(MULTI_VARIANT_CHARS);

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

function validatePoint(value: unknown, path: string, c: IssueCollector): RawStrokePoint | null {
  if (!isPlainObject(value)) {
    c.add(path, 'BAD_TYPE', 'point must be an object');
    return null;
  }
  const kw = checkKeyWhitelist(value, POINT_KEYS);
  if (!kw.ok) {
    c.add(`${path}/${kw.key}`, 'UNKNOWN_KEY', 'unknown key');
    return null;
  }
  const x = readFinite(value, 'x', `${path}/x`, c, LIMITS.RAW_PX_MIN, LIMITS.RAW_PX_MAX);
  const y = readFinite(value, 'y', `${path}/y`, c, LIMITS.RAW_PX_MIN, LIMITS.RAW_PX_MAX);
  const pressure = readFinite(value, 'pressure', `${path}/pressure`, c, 0, 1);
  const tiltX = readFinite(value, 'tiltX', `${path}/tiltX`, c, -90, 90);
  const tiltY = readFinite(value, 'tiltY', `${path}/tiltY`, c, -90, 90);
  const t = readFinite(value, 't', `${path}/t`, c, 0, Number.MAX_SAFE_INTEGER);
  const dpr = readFinite(value, 'dpr', `${path}/dpr`, c, Number.MIN_VALUE, 16);
  const pointerType = value.pointerType;
  if (typeof pointerType !== 'string' || !POINTER_TYPES.has(pointerType)) {
    c.add(`${path}/pointerType`, 'BAD_TYPE', 'pointerType must be mouse|pen|touch');
    return null;
  }
  if (x === null || y === null || pressure === null || tiltX === null || tiltY === null || t === null || dpr === null) return null;
  if (dpr <= 0) {
    c.add(`${path}/dpr`, 'OUT_OF_RANGE', 'dpr must be > 0');
    return null;
  }
  return { x, y, pressure, tiltX, tiltY, t, pointerType: pointerType as PointerKind, dpr };
}

function validateStroke(value: unknown, path: string, c: IssueCollector): { points: RawStrokePoint[]; count: number } | null {
  if (!Array.isArray(value)) {
    c.add(path, 'BAD_TYPE', 'stroke must be an array');
    return null;
  }
  if (value.length < 1) {
    c.add(path, 'CAP_EXCEEDED', 'stroke must have at least one point');
    return null;
  }
  if (value.length > LIMITS.MAX_RAW_POINTS_PER_STROKE) {
    c.add(path, 'CAP_EXCEEDED', 'too many points in stroke');
    return null;
  }
  const points: RawStrokePoint[] = [];
  let prevT = -Infinity;
  for (let i = 0; i < value.length; i++) {
    const p = validatePoint(value[i], `${path}/${i}`, c);
    if (!p) return null;
    if (p.t < prevT) {
      c.add(`${path}/${i}/t`, 'OUT_OF_RANGE', 't must be non-decreasing within a stroke');
      return null;
    }
    prevT = p.t;
    points.push(p);
  }
  return { points, count: points.length };
}

export function validateRawSample(input: unknown, path = ''): ValidationResult<RawGlyphSample> {
  const c = new IssueCollector();
  if (!isPlainObject(input)) {
    c.add(path || '/', 'BAD_TYPE', 'sample must be an object');
    return fail(c);
  }
  const kw = checkKeyWhitelist(input, SAMPLE_KEYS);
  if (!kw.ok) {
    c.add(`${path}/${kw.key}`, 'UNKNOWN_KEY', 'unknown key');
    return fail(c);
  }

  const char = input.char;
  if (typeof char !== 'string' || [...char].length !== 1 || !SINGLE_CHAR_RE.test(char)) {
    c.add(`${path}/char`, 'BAD_KEY', 'char must be exactly one code point');
    return fail(c);
  }

  const variantIndex = input.variantIndex;
  if (typeof variantIndex !== 'number' || !Number.isInteger(variantIndex) || variantIndex < 0 || variantIndex > 2) {
    c.add(`${path}/variantIndex`, 'OUT_OF_RANGE', 'variantIndex must be 0, 1 or 2');
    return fail(c);
  }
  if (variantIndex !== 0 && !MULTI.has(char)) {
    c.add(`${path}/variantIndex`, 'OUT_OF_RANGE', 'only multi-variant characters may use variantIndex > 0');
    return fail(c);
  }

  const sessionIndex = input.sessionIndex;
  if (typeof sessionIndex !== 'number' || !Number.isInteger(sessionIndex) || sessionIndex < 0) {
    c.add(`${path}/sessionIndex`, 'OUT_OF_RANGE', 'sessionIndex must be a non-negative integer');
    return fail(c);
  }

  if (!isPlainObject(input.guides)) {
    c.add(`${path}/guides`, 'BAD_TYPE', 'guides must be an object');
    return fail(c);
  }
  const gkw = checkKeyWhitelist(input.guides, GUIDE_KEYS);
  if (!gkw.ok) {
    c.add(`${path}/guides/${gkw.key}`, 'UNKNOWN_KEY', 'unknown key');
    return fail(c);
  }
  const ascenderY = readFinite(input.guides, 'ascenderY', `${path}/guides/ascenderY`, c, LIMITS.RAW_PX_MIN, LIMITS.RAW_PX_MAX);
  const xHeightY = readFinite(input.guides, 'xHeightY', `${path}/guides/xHeightY`, c, LIMITS.RAW_PX_MIN, LIMITS.RAW_PX_MAX);
  const baselineY = readFinite(input.guides, 'baselineY', `${path}/guides/baselineY`, c, LIMITS.RAW_PX_MIN, LIMITS.RAW_PX_MAX);
  const descenderY = readFinite(input.guides, 'descenderY', `${path}/guides/descenderY`, c, LIMITS.RAW_PX_MIN, LIMITS.RAW_PX_MAX);
  if (ascenderY === null || xHeightY === null || baselineY === null || descenderY === null) return fail(c);
  if (!(ascenderY < xHeightY && xHeightY < baselineY && baselineY < descenderY)) {
    c.add(`${path}/guides`, 'INVARIANT_FAILED', 'guides must be strictly ordered top to bottom');
    return fail(c);
  }
  const xhPx = baselineY - xHeightY;
  if (xhPx < LIMITS.RAW_XHEIGHT_PX_MIN || xhPx > LIMITS.RAW_XHEIGHT_PX_MAX) {
    c.add(`${path}/guides`, 'OUT_OF_RANGE', 'x-height span out of range');
    return fail(c);
  }

  const penWidthPx = readFinite(input, 'penWidthPx', `${path}/penWidthPx`, c, LIMITS.RAW_PEN_WIDTH_MIN, LIMITS.RAW_PEN_WIDTH_MAX);
  if (penWidthPx === null) return fail(c);

  if (!Array.isArray(input.strokes)) {
    c.add(`${path}/strokes`, 'BAD_TYPE', 'strokes must be an array');
    return fail(c);
  }
  if (input.strokes.length < 1 || input.strokes.length > LIMITS.MAX_RAW_STROKES_PER_SAMPLE) {
    c.add(`${path}/strokes`, 'CAP_EXCEEDED', 'stroke count out of range');
    return fail(c);
  }

  const strokes: RawStrokePoint[][] = [];
  let totalPoints = 0;
  for (let i = 0; i < input.strokes.length; i++) {
    const stroke = validateStroke(input.strokes[i], `${path}/strokes/${i}`, c);
    if (!stroke) return fail(c);
    totalPoints += stroke.count;
    if (totalPoints > LIMITS.MAX_RAW_POINTS_PER_SAMPLE) {
      c.add(`${path}/strokes`, 'CAP_EXCEEDED', 'too many points in sample');
      return fail(c);
    }
    strokes.push(stroke.points);
  }

  if (!isIsoDate(input.capturedAt)) {
    c.add(`${path}/capturedAt`, 'BAD_DATE', 'capturedAt must be ISO-8601');
    return fail(c);
  }

  const guides: CaptureGuides = { ascenderY, xHeightY, baselineY, descenderY };
  return {
    ok: true,
    value: { char, variantIndex, sessionIndex, guides, penWidthPx, strokes, capturedAt: input.capturedAt },
  };
}