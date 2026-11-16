import { K } from '../constants';
import type { EmPoint } from './n1Guide';

export interface GlyphBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TranslatedGlyph {
  strokes: EmPoint[][];
  bbox: GlyphBox;
  lsb: number;
  rsb: number;
  advance: number;
}

export function n4Translate(strokes: readonly EmPoint[][], W: number): TranslatedGlyph {
  let minXc = Infinity;
  let maxY4 = -Infinity;
  let minY4 = Infinity;
  let maxX4 = -Infinity;

  if (strokes.length === 0 || strokes.every((s) => s.length === 0)) {
    return {
      strokes: [],
      bbox: { minX: K.LSB, minY: 0, maxX: K.LSB, maxY: 0 },
      lsb: K.LSB,
      rsb: K.RSB,
      advance: K.LSB + K.RSB,
    };
  }

  for (const stroke of strokes) {
    for (const p of stroke) if (p.x < minXc) minXc = p.x;
  }
  const shift = -minXc + K.LSB + W / 2;
  const out = strokes.map((stroke) =>
    stroke.map((p) => {
      const x = p.x + shift;
      if (x > maxX4) maxX4 = x;
      if (p.y > maxY4) maxY4 = p.y;
      if (p.y < minY4) minY4 = p.y;
      return { ...p, x };
    }),
  );

  const bbox: GlyphBox = {
    minX: K.LSB,
    minY: minY4 - W / 2,
    maxX: maxX4 + W / 2,
    maxY: maxY4 + W / 2,
  };
  const advance = K.LSB + (bbox.maxX - bbox.minX) + K.RSB;
  return { strokes: out, bbox, lsb: K.LSB, rsb: K.RSB, advance };
}