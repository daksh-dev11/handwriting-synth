import { ENGINE_SPEC_REV } from '../constants';
import { LIMITS } from '../limits';
import { fnv1a32 } from '../rng';
import { IssueCollector, checkKeyWhitelist, isIsoDate, isPlainObject } from './validate';
import type { ValidationIssue, ValidationResult } from './validate';
import { validateGlyphPack } from './glyphPackSchema';
import { validateRawSample } from './rawSampleSchema';
import type { GlyphPack, RawGlyphSample } from '../types';

export interface PackFileContents {
  pack: GlyphPack;
  rawSamples: RawGlyphSample[] | null;
}

export interface PackFile {
  format: 'handwriting-glyphpack';
  formatVersion: 1;
  engineSpec: string;
  exportedAt: string;
  checksum: string;
  pack: GlyphPack;
  rawSamples?: RawGlyphSample[];
}

const ENVELOPE_KEYS = new Set(['format', 'formatVersion', 'engineSpec', 'exportedAt', 'checksum', 'pack', 'rawSamples']);
const CHECKSUM_RE = /^[0-9a-f]{8}$/;

function fail(c: IssueCollector): { ok: false; issues: ValidationIssue[] } {
  return { ok: false, issues: c.issues };
}

function nestingOk(s: string, max = 12): boolean {
  let d = 0;
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (inStr) {
      if (c === 92) i++;
      else if (c === 34) inStr = false;
      continue;
    }
    if (c === 34) inStr = true;
    else if (c === 123 || c === 91) {
      if (++d > max) return false;
    } else if (c === 125 || c === 93) d--;
  }
  return true;
}

function checksumOf(pack: GlyphPack, rawSamples: RawGlyphSample[] | null): string {
  return fnv1a32(JSON.stringify({ pack, rawSamples })).toString(16).padStart(8, '0');
}

function prefixIssues(issues: readonly ValidationIssue[], prefix: string): ValidationIssue[] {
  return issues.map((issue) => ({ path: `${prefix}${issue.path}`, code: issue.code, message: issue.message }));
}

function sanitizeRawList(
  value: unknown,
  c: IssueCollector,
): RawGlyphSample[] | null | undefined {
  if (!Array.isArray(value)) {
    c.add('/rawSamples', 'BAD_TYPE', 'rawSamples must be an array');
    return undefined;
  }
  if (value.length > LIMITS.MAX_RAW_SAMPLES) {
    c.add('/rawSamples', 'CAP_EXCEEDED', 'too many raw samples');
    return undefined;
  }
  const keys = new Set<string>();
  const sessions = new Set<number>();
  const samples: RawGlyphSample[] = [];
  let totalPoints = 0;
  for (let i = 0; i < value.length; i++) {
    const result = validateRawSample(value[i], `/rawSamples/${i}`);
    if (!result.ok) {
      for (const issue of result.issues) c.add(issue.path, issue.code, issue.message);
      return undefined;
    }
    const sample = result.value;
    const key = `${sample.char}#${sample.variantIndex}`;
    if (keys.has(key)) {
      c.add(`/rawSamples/${i}`, 'INVARIANT_FAILED', 'duplicate char/variantIndex');
      return undefined;
    }
    keys.add(key);
    if (sessions.has(sample.sessionIndex)) {
      c.add(`/rawSamples/${i}/sessionIndex`, 'INVARIANT_FAILED', 'duplicate sessionIndex');
      return undefined;
    }
    sessions.add(sample.sessionIndex);
    for (const stroke of sample.strokes) totalPoints += stroke.length;
    if (totalPoints > LIMITS.MAX_RAW_POINTS_TOTAL) {
      c.add(`/rawSamples/${i}`, 'CAP_EXCEEDED', 'too many raw points');
      return undefined;
    }
    samples.push(sample);
  }
  return samples;
}

export function parsePackFile(text: string): ValidationResult<PackFileContents> {
  const c = new IssueCollector();

  if (text.length > LIMITS.MAX_FILE_BYTES) {
    c.add('/', 'FILE_TOO_LARGE', 'file exceeds the size cap');
    return fail(c);
  }
  if (!nestingOk(text, 12)) {
    c.add('/', 'CAP_EXCEEDED', 'JSON nesting too deep');
    return fail(c);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    c.add('/', 'JSON_SYNTAX', 'invalid JSON');
    return fail(c);
  }
  if (Array.isArray(parsed) || !isPlainObject(parsed)) {
    c.add('/', 'NOT_OBJECT', 'top level must be an object');
    return fail(c);
  }

  const env = parsed;
  const kw = checkKeyWhitelist(env, ENVELOPE_KEYS);
  if (!kw.ok) {
    c.add(`/${kw.key}`, 'UNKNOWN_KEY', 'unknown envelope key');
    return fail(c);
  }
  if (env.format !== 'handwriting-glyphpack') {
    c.add('/format', 'BAD_FORMAT', 'unexpected format');
    return fail(c);
  }
  if (env.formatVersion !== 1) {
    c.add('/formatVersion', 'UNSUPPORTED_VERSION', 'unsupported formatVersion');
    return fail(c);
  }
  if (env.engineSpec !== ENGINE_SPEC_REV) {
    c.add('/engineSpec', 'ENGINE_SPEC_MISMATCH', 'engine spec mismatch');
    return fail(c);
  }
  if (!isIsoDate(env.exportedAt)) {
    c.add('/exportedAt', 'BAD_DATE', 'exportedAt must be ISO-8601');
    return fail(c);
  }
  if (typeof env.checksum !== 'string' || !CHECKSUM_RE.test(env.checksum)) {
    c.add('/checksum', 'BAD_TYPE', 'checksum must be 8 lowercase hex characters');
    return fail(c);
  }
  if (!Object.prototype.hasOwnProperty.call(env, 'pack')) {
    c.add('/pack', 'MISSING_KEY', 'pack is required');
    return fail(c);
  }

  const packResult = validateGlyphPack(env.pack);
  if (!packResult.ok) {
    return { ok: false, issues: prefixIssues(packResult.issues, '/pack') };
  }

  let rawSamples: RawGlyphSample[] | null = null;
  if (Object.prototype.hasOwnProperty.call(env, 'rawSamples') && env.rawSamples !== undefined) {
    const list = sanitizeRawList(env.rawSamples, c);
    if (list === undefined) return fail(c);
    rawSamples = list;
  }

  const expected = checksumOf(packResult.value, rawSamples);
  if (env.checksum !== expected) {
    c.add('/checksum', 'CHECKSUM_MISMATCH', 'checksum does not match the content');
    return fail(c);
  }

  return { ok: true, value: { pack: packResult.value, rawSamples } };
}

export function serializePackFile(contents: PackFileContents, exportedAtIso: string): ValidationResult<string> {
  const c = new IssueCollector();

  if (!isIsoDate(exportedAtIso)) {
    c.add('/exportedAt', 'BAD_DATE', 'exportedAt must be ISO-8601');
    return fail(c);
  }

  const packResult = validateGlyphPack(contents.pack);
  if (!packResult.ok) {
    return { ok: false, issues: prefixIssues(packResult.issues, '/pack') };
  }

  let rawSamples: RawGlyphSample[] | null = null;
  if (contents.rawSamples !== null) {
    const list = sanitizeRawList(contents.rawSamples, c);
    if (list === undefined) return fail(c);
    rawSamples = list;
  }

  const checksum = checksumOf(packResult.value, rawSamples);
  const file: Record<string, unknown> = {};
  file.format = 'handwriting-glyphpack';
  file.formatVersion = 1;
  file.engineSpec = ENGINE_SPEC_REV;
  file.exportedAt = exportedAtIso;
  file.checksum = checksum;
  file.pack = packResult.value;
  if (rawSamples !== null) file.rawSamples = rawSamples;

  const json = JSON.stringify(file);
  if (json.length > LIMITS.MAX_FILE_BYTES) {
    c.add('/', 'FILE_TOO_LARGE', 'serialized file exceeds the size cap');
    return fail(c);
  }
  return { ok: true, value: json };
}