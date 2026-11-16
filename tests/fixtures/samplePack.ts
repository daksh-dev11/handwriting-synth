import type { GlyphPack, RawGlyphSample, RawStrokePoint } from '../../src/engine/types';
import { buildGlyphPack } from '../../src/engine/normalize/pipeline';

export const SAMPLE_GUIDES = { ascenderY: 100, xHeightY: 220, baselineY: 340, descenderY: 420 };
export const SAMPLE_NOW_ISO = '2026-01-01T00:00:00.000Z';

export function makePoint(x: number, y: number, t: number): RawStrokePoint {
  return { x, y, pressure: 0.5, tiltX: 0, tiltY: 0, t, pointerType: 'mouse', dpr: 1 };
}

export function makeStroke(coords: readonly (readonly [number, number])[], t0 = 1000): RawStrokePoint[] {
  return coords.map(([x, y], i) => makePoint(x, y, t0 + 8 * i));
}

export function makeSample(
  char: string,
  variantIndex: number,
  sessionIndex: number,
  strokes: readonly (readonly (readonly [number, number])[])[],
): RawGlyphSample {
  return {
    char,
    variantIndex,
    sessionIndex,
    guides: SAMPLE_GUIDES,
    penWidthPx: 16,
    strokes: strokes.map((s, i) => makeStroke(s, 1000 + 100 * i)),
    capturedAt: SAMPLE_NOW_ISO,
  };
}

export const SAMPLE_RAW_SAMPLES: RawGlyphSample[] = [
  makeSample('l', 0, 0, [[[130, 100], [140, 220], [150, 340]]]),
  makeSample(',', 0, 1, [[[100, 330], [103, 342], [98, 360]]]),
  makeSample('e', 0, 2, [[[150, 230], [190, 235], [195, 285], [165, 305], [150, 270], [185, 260]]]),
  makeSample('e', 2, 3, [[[148, 232], [188, 238], [193, 288], [163, 307], [148, 272], [183, 262]]]),
  makeSample('a', 0, 4, [[[155, 340], [140, 280], [160, 225], [200, 235], [210, 300], [190, 340]]]),
  makeSample('c', 0, 5, [[[200, 230], [160, 220], [140, 260], [150, 320], [190, 340]]]),
  makeSample('m', 0, 6, [
    [[100, 340], [100, 220], [130, 260], [150, 220], [180, 260], [210, 220], [240, 260], [260, 220], [260, 340]],
  ]),
  makeSample('n', 0, 7, [[[100, 340], [100, 220], [140, 250], [180, 220], [210, 250], [240, 220], [240, 340]]]),
  makeSample('o', 0, 8, [[[200, 300]]]),
  makeSample('w', 0, 9, [
    [[100, 340], [120, 250], [140, 300], [160, 230], [180, 310], [200, 230], [220, 300], [240, 250], [260, 340]],
  ]),
];

export const SAMPLE_PACK: GlyphPack = buildGlyphPack(SAMPLE_RAW_SAMPLES, SAMPLE_NOW_ISO);