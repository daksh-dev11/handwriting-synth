import { EM } from '../constants';
import { median } from '../mathUtil';
import type { GlyphBox } from './n4Translate';
import type { EmPoint } from './n1Guide';

export const SLANT_MEASURE_CHARS: ReadonlySet<string> = new Set([
  'l', 'I', 'i', 't', '1', 'h', 'b', 'd', 'p', 'q',
]);

const MIN_SLANT_CHORD = 0.8 * EM.xHeight;
const MAX_SLANT_DEG = 35;

export function measureSampleSlant(strokes: readonly EmPoint[][]): number | null {
  let bestChord = 0;
  let first: EmPoint | null = null;
  let last: EmPoint | null = null;

  for (const stroke of strokes) {
    if (stroke.length < 2) continue;
    const a = stroke[0];
    const b = stroke[stroke.length - 1];
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    if (chord > bestChord) {
      bestChord = chord;
      first = a;
      last = b;
    }
  }

  if (first === null || last === null || bestChord < MIN_SLANT_CHORD) return null;

  const top = first.y <= last.y ? first : last;
  const bottom = first.y <= last.y ? last : first;
  const theta = (Math.atan2(top.x - bottom.x, bottom.y - top.y) * 180) / Math.PI;
  if (!Number.isFinite(theta) || Math.abs(theta) > MAX_SLANT_DEG) return null;
  return theta;
}

export function medianSlant(values: readonly number[]): number {
  return values.length === 0 ? 0 : median(values);
}

export function aspectRatioOf(boxes: readonly GlyphBox[]): number {
  const ratios: number[] = [];
  for (const b of boxes) {
    const height = b.maxY - b.minY;
    if (height <= 0) continue;
    const ratio = (b.maxX - b.minX) / height;
    if (Number.isFinite(ratio)) ratios.push(ratio);
  }
  return ratios.length === 0 ? 1 : median(ratios);
}