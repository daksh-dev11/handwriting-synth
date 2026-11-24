import type { RawGlyphSample, RawStrokePoint } from '@engine';
import { DEMO_CAPTURED_AT } from './constants';

type Point = readonly [number, number];
type Stroke = readonly (readonly [string, ...number[]])[];

const LOWER: Record<string, readonly Stroke[]> = {
  a: [[['O', 2.5, 3, 2.5, 3, 40, 400], ['M', 5, 6], ['L', 5, 0]]],
  b: [[['M', 0, 12], ['L', 0, 0], ['O', 2.5, 3, 2.5, 3, 160, -200]]],
  c: [[['O', 2.5, 3, 2.5, 3, 45, 315]]],
  d: [[['O', 2.5, 3, 2.5, 3, 20, 380], ['M', 5, 12], ['L', 5, 0]]],
  e: [[['M', 0.2, 3], ['L', 4.9, 3.2], ['O', 2.5, 3, 2.5, 3, 15, 315]]],
  f: [[['M', 5, 11], ['C', 3, 12.5, 1.5, 11, 1.5, 9], ['L', 1.5, 0]], [['M', 0, 6], ['L', 4, 6]]],
  g: [[['O', 2.5, 3, 2.5, 3, 40, 400], ['M', 5, 6], ['L', 5, -2], ['C', 5, -4, 1, -4.5, 0.5, -2.5]]],
  h: [[['M', 0, 12], ['L', 0, 0]], [['M', 0, 4], ['C', 0.5, 6.5, 5, 7, 5, 3], ['L', 5, 0]]],
  i: [[['M', 2, 6], ['L', 2, 0]], [['M', 2, 8.5]]],
  j: [[['M', 2, 6], ['L', 2, -2], ['C', 2, -4, 0.5, -4, 0, -3]], [['M', 2, 8.5]]],
  k: [[['M', 0, 12], ['L', 0, 0]], [['M', 4.5, 6], ['L', 0, 2.5], ['L', 1.5, 3.6], ['L', 5, 0]]],
  l: [[['M', 2, 12], ['L', 2, 0]]],
  m: [[['M', 0, 6], ['L', 0, 0]], [['M', 0, 4], ['C', 0.5, 6.5, 3.5, 6.5, 3.5, 3], ['L', 3.5, 0], ['C', 4, 6.5, 7, 6.5, 7, 3], ['L', 7, 0]]],
  n: [[['M', 0, 6], ['L', 0, 0]], [['M', 0, 4], ['C', 0.5, 6.5, 5, 7, 5, 3], ['L', 5, 0]]],
  o: [[['O', 2.5, 3, 2.5, 3, 80, 440]]],
  p: [[['M', 0, 6], ['L', 0, -4], ['O', 2.5, 3, 2.5, 3, 160, -200]]],
  q: [[['O', 2.5, 3, 2.5, 3, 40, 400], ['M', 5, 6], ['L', 5, -4]]],
  r: [[['M', 0, 6], ['L', 0, 0]], [['M', 0, 3.5], ['C', 0.5, 6, 3, 6.5, 4.5, 5.5]]],
  s: [[['M', 4.5, 5], ['C', 3.5, 6.5, 0.5, 6, 0.5, 4.5], ['C', 0.5, 3, 4.5, 3, 4.5, 1.5], ['C', 4.5, 0, 1, -0.3, 0, 1]]],
  t: [[['M', 2, 10], ['L', 2, 1], ['C', 2, 0, 3.5, 0, 4, 0.8]], [['M', 0, 6], ['L', 4.2, 6]]],
  u: [[['M', 0, 6], ['L', 0, 2], ['C', 0, -0.5, 5, -0.5, 5, 2], ['L', 5, 6]]],
  v: [[['M', 0, 6], ['L', 2.5, 0], ['L', 5, 6]]],
  w: [[['M', 0, 6], ['L', 1.5, 0], ['L', 3.5, 5], ['L', 5.5, 0], ['L', 7, 6]]],
  x: [[['M', 0, 6], ['L', 5, 0]], [['M', 5, 6], ['L', 0, 0]]],
  y: [[['M', 0, 6], ['L', 2.5, 0]], [['M', 5, 6], ['L', 1.5, -4]]],
  z: [[['M', 0, 6], ['L', 5, 6], ['L', 0, 0], ['L', 5, 0]]],
};

const PUNCTUATION: Record<string, readonly Stroke[]> = {
  '.': [[['M', 1, 0]]],
  ',': [[['M', 1, 0.5], ['L', 0.2, -1.8]]],
  ';': [[['M', 1, 5]], [['M', 1, 1], ['L', 0.2, -1.5]]],
  ':': [[['M', 1, 5]], [['M', 1, 0]]],
  '!': [[['M', 1, 12], ['L', 1, 3.5]], [['M', 1, 0]]],
  '?': [[['M', 0, 10], ['C', 0.5, 13, 5, 13, 5, 9.5], ['C', 5, 7, 2.5, 6.5, 2.5, 4]], [['M', 2.5, 0]]],
  "'": [[['M', 1, 12], ['L', 0.5, 9]]],
  '"': [[['M', 1, 12], ['L', 0.5, 9]], [['M', 3, 12], ['L', 2.5, 9]]],
  '-': [[['M', 0, 3], ['L', 4, 3]]],
  '(': [[['M', 3, 12], ['C', 0, 8, 0, 2, 3, -2]]],
  ')': [[['M', 0, 12], ['C', 3, 8, 3, 2, 0, -2]]],
  '/': [[['M', 0, -1], ['L', 4, 12]]],
};

const DIGIT_SOURCE: Record<string, string> = {
  '0': 'o', '1': 'l', '2': 'z', '3': 's', '4': 'k',
  '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'a',
};

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function cubicPoint(points: readonly [Point, Point, Point, Point], t: number): Point {
  const u = 1 - t;
  return [
    u * u * u * points[0][0] + 3 * u * u * t * points[1][0] + 3 * u * t * t * points[2][0] + t * t * t * points[3][0],
    u * u * u * points[0][1] + 3 * u * u * t * points[1][1] + 3 * u * t * t * points[2][1] + t * t * t * points[3][1],
  ];
}

function flattenStroke(commands: Stroke): Point[] {
  const output: Point[] = [];
  let current: Point | null = null;
  for (const [command, ...values] of commands) {
    if (command === 'M') {
      current = [values[0] ?? 0, values[1] ?? 0];
      output.push(current);
    } else if (command === 'L' && current) {
      current = [values[0] ?? 0, values[1] ?? 0];
      output.push(current);
    } else if (command === 'C' && current) {
      const end: Point = [values[4] ?? 0, values[5] ?? 0];
      const controls: [Point, Point, Point, Point] = [
        current,
        [values[0] ?? 0, values[1] ?? 0],
        [values[2] ?? 0, values[3] ?? 0],
        end,
      ];
      const length = distance(controls[0], controls[1]) + distance(controls[1], controls[2]) + distance(controls[2], controls[3]);
      const steps = Math.max(8, Math.ceil(length / 0.3));
      for (let index = 1; index <= steps; index++) output.push(cubicPoint(controls, index / steps));
      current = end;
    } else if (command === 'O') {
      const [cx, cy, rx, ry, start, end] = values;
      if (cx === undefined || cy === undefined || rx === undefined || ry === undefined || start === undefined || end === undefined) continue;
      const circumference = 2 * Math.PI * Math.max(Math.abs(rx), Math.abs(ry));
      const steps = Math.max(8, Math.ceil(circumference * Math.abs(end - start) / 360 / 0.3));
      const startRadians = start * Math.PI / 180;
      if (!current) {
        current = [cx + rx * Math.cos(startRadians), cy + ry * Math.sin(startRadians)];
        output.push(current);
      }
      for (let index = 1; index <= steps; index++) {
        const angle = (start + (end - start) * index / steps) * Math.PI / 180;
        current = [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
        output.push(current);
      }
    }
  }
  return output;
}

function strokesFor(char: string): readonly Stroke[] {
  const lower = char.toLowerCase();
  if (LOWER[lower]) return LOWER[lower];
  if (PUNCTUATION[char]) return PUNCTUATION[char];
  if (char >= 'A' && char <= 'Z') return LOWER[lower] ?? LOWER.o ?? [];
  if (DIGIT_SOURCE[char]) return LOWER[DIGIT_SOURCE[char] ?? 'o'] ?? [];
  return [[['M', 0, 0], ['L', 4, 6], ['L', 0, 6], ['L', 4, 0]]];
}

function expandSample(
  char: string,
  variantIndex: number,
  sessionIndex: number,
): RawGlyphSample {
  const random = variantIndex === 0
    ? null
    : mulberry32(0x00DE0000 + char.charCodeAt(0) * 4 + variantIndex);
  const xScale = variantIndex === 1 ? 1.06 : variantIndex === 2 ? 0.95 : 1;
  let pointIndex = 0;
  const strokes: RawStrokePoint[][] = strokesFor(char).map((commands) => {
    const flattened = flattenStroke(commands);
    const points: RawStrokePoint[] = [];
    for (const [x, y] of flattened) {
      const dx = random ? (random() - 0.5) * 0.24 : 0;
      const dy = random ? (random() - 0.5) * 0.24 : 0;
      const projectedX = Math.round(100 + 20 * (x * xScale + Math.tan(10 * Math.PI / 180) * y + dx));
      const projectedY = Math.round(340 - 20 * (y + dy));
      const previous = points[points.length - 1];
      if (previous && previous.x === projectedX && previous.y === projectedY) continue;
      points.push({
        x: projectedX,
        y: projectedY,
        pressure: 0.5,
        tiltX: 0,
        tiltY: 0,
        t: 1000 + 8 * pointIndex++,
        pointerType: 'mouse',
        dpr: 1,
      });
    }
    return points.length > 0 ? points : [{
      x: 100,
      y: 340,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      t: 1000 + 8 * pointIndex++,
      pointerType: 'mouse',
      dpr: 1,
    }];
  });
  return {
    char,
    variantIndex,
    sessionIndex,
    guides: { ascenderY: 100, xHeightY: 220, baselineY: 340, descenderY: 420 },
    penWidthPx: 16,
    strokes,
    capturedAt: DEMO_CAPTURED_AT,
  };
}

export function buildDemoSamples(): RawGlyphSample[] {
  const keys: Array<{ char: string; variantIndex: number }> = [
    ...'abcdefghijklmnopqrstuvwxyz'.split('').map((char) => ({ char, variantIndex: 0 })),
    ...'eta oins'.replaceAll(' ', '').split('').flatMap((char) => [
      { char, variantIndex: 1 },
      { char, variantIndex: 2 },
    ]),
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').map((char) => ({ char, variantIndex: 0 })),
    ...['.', ',', ';', ':', '!', '?', "'", '"', '-', '(', ')', '/']
      .map((char) => ({ char, variantIndex: 0 })),
  ];
  const samples: RawGlyphSample[] = [];
  keys.forEach(({ char, variantIndex }, sessionIndex) => {
    samples.push(expandSample(char, variantIndex, sessionIndex));
  });
  return samples;
}
