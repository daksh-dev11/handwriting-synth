import { normalizeChar } from '../charset';

export interface WordToken {
  kind: 'word';
  chars: string[];
  ks: number[];
  end: number;
}

export interface SpaceToken {
  kind: 'space';
  k: number;
  tab: boolean;
  end: number;
}

export interface NewlineToken {
  kind: 'newline';
  paragraph: boolean;
  end: number;
}

export type TextToken = WordToken | SpaceToken | NewlineToken;

const CODE_LF = 10;
const CODE_TAB = 9;
const CODE_SPACE = 32;

export function isWordBreak(code: number): boolean {
  return code === CODE_LF || code === CODE_TAB || code === CODE_SPACE;
}

export function tokenizeText(text: string, has: (c: string) => boolean): TextToken[] {
  const tokens: TextToken[] = [];
  let i = 0;
  let k = 0;

  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code === CODE_LF) {
      if (text.charCodeAt(i + 1) === CODE_LF) {
        tokens.push({ kind: 'newline', paragraph: true, end: i + 2 });
        i += 2;
        k = 0;
      } else {
        tokens.push({ kind: 'newline', paragraph: false, end: i + 1 });
        i += 1;
        k += 1;
      }
      continue;
    }
    if (code === CODE_TAB || code === CODE_SPACE) {
      tokens.push({ kind: 'space', k, tab: code === CODE_TAB, end: i + 1 });
      i += 1;
      k += 1;
      continue;
    }

    const chars: string[] = [];
    const ks: number[] = [];
    const start = i;
    while (i < text.length && !isWordBreak(text.charCodeAt(i))) {
      chars.push(normalizeChar(text[i], has));
      ks.push(k + (i - start));
      i += 1;
    }
    tokens.push({ kind: 'word', chars, ks, end: i });
    k += chars.length;
  }

  return tokens;
}