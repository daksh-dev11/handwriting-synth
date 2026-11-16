import { LIMITS } from '../limits';

export type IssueCode =
  | 'FILE_TOO_LARGE'
  | 'JSON_SYNTAX'
  | 'NOT_OBJECT'
  | 'BAD_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'ENGINE_SPEC_MISMATCH'
  | 'BAD_DATE'
  | 'BAD_TYPE'
  | 'OUT_OF_RANGE'
  | 'NOT_FINITE'
  | 'BAD_KEY'
  | 'UNKNOWN_KEY'
  | 'MISSING_KEY'
  | 'INVARIANT_FAILED'
  | 'CAP_EXCEEDED'
  | 'CHECKSUM_MISMATCH';

export interface ValidationIssue {
  path: string;
  code: IssueCode;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export const SINGLE_CHAR_RE = /^[^\p{Cc}\p{Cs}\p{Cn}]$/u;

export function isSingleCodePoint(value: string): boolean {
  return [...value].length === 1 && SINGLE_CHAR_RE.test(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNumberInRange(value: unknown, lo: number, hi: number): value is number {
  return isFiniteNumber(value) && value >= lo && value <= hi;
}

export function isIntegerInRange(value: unknown, lo: number, hi: number): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= lo && value <= hi;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

export function isStringOfMaxLength(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_RE.test(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isArrayWithMaxLength(value: unknown, max: number): value is unknown[] {
  return Array.isArray(value) && value.length <= max;
}

export function checkKeyWhitelist(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): { ok: true } | { ok: false; key: string } {
  let n = 0;
  for (const k in value) {
    if (++n > allowed.size) return { ok: false, key: k };
    if (!Object.prototype.hasOwnProperty.call(value, k)) return { ok: false, key: k };
    if (!allowed.has(k)) return { ok: false, key: k };
  }
  return { ok: true };
}

export class IssueCollector {
  readonly issues: ValidationIssue[] = [];

  add(path: string, code: IssueCode, message: string): void {
    if (this.issues.length < LIMITS.MAX_ISSUES) {
      this.issues.push({ path, code, message });
    }
  }

  get full(): boolean {
    return this.issues.length >= LIMITS.MAX_ISSUES;
  }

  get ok(): boolean {
    return this.issues.length === 0;
  }
}