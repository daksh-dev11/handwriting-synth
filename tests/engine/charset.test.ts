import { describe, expect, it } from 'vitest';
import {
  CAPTURE_CHARSET,
  glyphClassOf,
  MULTI_VARIANT_CHARS,
  normalizeChar,
  OPTIONAL_KEYS,
  REQUIRED_KEYS,
  X_CLASS,
} from '../../src/engine/charset';
import type { GlyphClass } from '../../src/engine/types';

const CLASSES: readonly GlyphClass[] = ['x', 'ascender', 'descender', 'cap', 'digit', 'punct', 'symbol'];

describe('charset', () => {
  it('has the required and optional key counts', () => {
    expect(REQUIRED_KEYS).toHaveLength(88);
    expect(OPTIONAL_KEYS).toHaveLength(15);
    expect(MULTI_VARIANT_CHARS).toHaveLength(7);
    expect(X_CLASS.size).toBe(13);
    expect(CAPTURE_CHARSET.punctuation).toHaveLength(12);
  });

  it('has unique keys and single-code-point chars', () => {
    const all = [...REQUIRED_KEYS, ...OPTIONAL_KEYS];
    expect(new Set(all.map((k) => k.key)).size).toBe(all.length);
    for (const k of all) {
      expect([...k.char]).toHaveLength(1);
      expect(k.key).toBe(`${k.char}#${k.variantIndex}`);
    }
  });

  it('maps every required and optional char into the GlyphClass enum', () => {
    for (const key of [...REQUIRED_KEYS, ...OPTIONAL_KEYS]) {
      expect(CLASSES).toContain(glyphClassOf(key.char));
    }
  });

  it('classifies per the audit-patched sets', () => {
    expect(glyphClassOf('a')).toBe('x');
    expect(glyphClassOf('i')).toBe('ascender');
    expect(glyphClassOf('b')).toBe('ascender');
    expect(glyphClassOf('t')).toBe('ascender');
    expect(glyphClassOf('g')).toBe('descender');
    expect(glyphClassOf('y')).toBe('descender');
    expect(glyphClassOf('A')).toBe('cap');
    expect(glyphClassOf('I')).toBe('cap');
    expect(glyphClassOf('0')).toBe('digit');
    expect(glyphClassOf('.')).toBe('punct');
    expect(glyphClassOf('/')).toBe('punct');
    expect(glyphClassOf('+')).toBe('symbol');
    expect(glyphClassOf('^')).toBe('symbol');
    expect(glyphClassOf('\\')).toBe('symbol');
  });

  it('normalizes smart quotes unconditionally and dashes only as a fallback', () => {
    const hasNone = (): boolean => false;
    const hasEnDash = (c: string): boolean => c === '\u2013';
    const hasHyphen = (c: string): boolean => c === '-';

    expect(normalizeChar('\u201C', hasNone)).toBe('"');
    expect(normalizeChar('\u201D', hasNone)).toBe('"');
    expect(normalizeChar('\u2018', hasNone)).toBe("'");
    expect(normalizeChar('\u2019', hasNone)).toBe("'");
    expect(normalizeChar('\u2013', hasNone)).toBe('-');
    expect(normalizeChar('\u2014', hasNone)).toBe('-');
    expect(normalizeChar('\u2013', hasEnDash)).toBe('\u2013');
    expect(normalizeChar('\u2014', hasHyphen)).toBe('-');
    expect(normalizeChar('a', hasHyphen)).toBe('a');
  });
});