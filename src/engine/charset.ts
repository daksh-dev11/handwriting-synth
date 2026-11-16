import type { GlyphClass } from './types';

export interface CaptureKey {
  char: string;
  variantIndex: number;
  key: string;
}

export const captureKeyOf = (char: string, variantIndex: number): CaptureKey => ({
  char,
  variantIndex,
  key: `${char}#${variantIndex}`,
});

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'.split('');
export const MULTI_VARIANT_CHARS = ['e', 't', 'a', 'o', 'i', 'n', 's'] as const;
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '0123456789'.split('');
const PUNCTUATION = ['.', ',', ';', ':', '!', '?', "'", '"', '-', '(', ')', '/'];
const OPTIONAL = ['`', '_', '[', ']', '{', '}', '+', '=', '<', '>', '~', '*', '^', '\\', '|'];

export const CAPTURE_CHARSET = {
  lowercase: LOWERCASE,
  multiVariant: MULTI_VARIANT_CHARS,
  uppercase: UPPERCASE,
  digits: DIGITS,
  punctuation: PUNCTUATION,
  optional: OPTIONAL,
} as const;

export const REQUIRED_KEYS: readonly CaptureKey[] = [
  ...LOWERCASE.map((c) => captureKeyOf(c, 0)),
  ...MULTI_VARIANT_CHARS.flatMap((c) => [captureKeyOf(c, 1), captureKeyOf(c, 2)]),
  ...UPPERCASE.map((c) => captureKeyOf(c, 0)),
  ...DIGITS.map((c) => captureKeyOf(c, 0)),
  ...PUNCTUATION.map((c) => captureKeyOf(c, 0)),
];

export const OPTIONAL_KEYS: readonly CaptureKey[] = OPTIONAL.map((c) => captureKeyOf(c, 0));

export const X_CLASS: ReadonlySet<string> = new Set('acemnorsuvwxz'.split(''));

const ASC = new Set('bdfhiklt');
const DESC = new Set('gjpqy');
const PUNCT = new Set([
  '.', ',', ';', ':', '!', '?', "'", '"', '`', '-', '_', '(', ')', '[', ']', '{', '}', '/',
]);

export function glyphClassOf(c: string): GlyphClass {
  if (X_CLASS.has(c)) return 'x';
  if (ASC.has(c)) return 'ascender';
  if (DESC.has(c)) return 'descender';
  if (c >= 'A' && c <= 'Z') return 'cap';
  if (c >= '0' && c <= '9') return 'digit';
  return PUNCT.has(c) ? 'punct' : 'symbol';
}

export function normalizeChar(ch: string, has: (c: string) => boolean): string {
  if (ch === '\u201C' || ch === '\u201D') return '"';
  if (ch === '\u2018' || ch === '\u2019') return "'";
  if (has(ch)) return ch;
  if (ch === '\u2013' || ch === '\u2014') return '-';
  return ch;
}