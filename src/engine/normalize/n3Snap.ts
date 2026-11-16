import { EM } from '../constants';
import type { EmPoint } from './n1Guide';

type AnchorKind = 'top' | 'bottom' | 'center';

interface SnapRule {
  anchor: AnchorKind;
  targetY: number;
}

const PUNCT_TOP_ASCENDER = new Set(['!', '?', "'", '"', '`', '^', '*']);
const DASH_CENTER = new Set(['-', '\u2013', '\u2014']);
const SYMBOL_CENTER = new Set(['+', '=', '<', '>', '~']);
const BRACKET_CENTER = new Set(['(', ')', '[', ']', '{', '}', '/', '\\', '|']);

export function snapRuleFor(char: string): SnapRule | null {
  if (char === '.') return { anchor: 'bottom', targetY: EM.baselineY };
  if (char === ',') return { anchor: 'top', targetY: EM.baselineY - 90 };
  if (char === ':') return { anchor: 'bottom', targetY: EM.baselineY };
  if (char === ';') return { anchor: 'top', targetY: EM.xHeightY };
  if (PUNCT_TOP_ASCENDER.has(char)) return { anchor: 'top', targetY: EM.ascenderY };
  if (DASH_CENTER.has(char)) return { anchor: 'center', targetY: EM.baselineY - 150 };
  if (char === '_') return { anchor: 'center', targetY: EM.baselineY + 70 };
  if (SYMBOL_CENTER.has(char)) return { anchor: 'center', targetY: EM.baselineY - 150 };
  if (BRACKET_CENTER.has(char)) {
    return { anchor: 'center', targetY: (EM.ascenderY + EM.descenderY) / 2 };
  }
  return null;
}

export function n3SnapStrokes(
  char: string,
  strokes: readonly EmPoint[][],
  W: number,
): EmPoint[][] {
  const rule = snapRuleFor(char);
  if (!rule) return strokes.map((stroke) => stroke.map((p) => ({ ...p })));

  let minY = Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (maxY < minY) return strokes.map((stroke) => stroke.map((p) => ({ ...p })));

  const outlineTop = minY - W / 2;
  const outlineBottom = maxY + W / 2;
  const anchorY =
    rule.anchor === 'top'
      ? outlineTop
      : rule.anchor === 'bottom'
        ? outlineBottom
        : (outlineTop + outlineBottom) / 2;
  const shift = rule.targetY - anchorY;

  return strokes.map((stroke) => stroke.map((p) => ({ ...p, y: p.y + shift })));
}