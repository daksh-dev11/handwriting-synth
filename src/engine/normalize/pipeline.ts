import { EM, K } from '../constants';
import { glyphClassOf, X_CLASS } from '../charset';
import { median } from '../mathUtil';
import type {
  GlyphPack,
  NormalizedGlyph,
  NormalizedStroke,
  RawGlyphSample,
} from '../types';
import { n1MapStrokes } from './n1Guide';
import type { EmPoint } from './n1Guide';
import { applyDrift, fitDrift } from './n2Drift';
import { n3SnapStrokes } from './n3Snap';
import { n4Translate } from './n4Translate';
import type { GlyphBox } from './n4Translate';
import { n5Resample } from './n5Resample';
import type { ResampledStroke } from './n5Resample';
import { needsSynthesis, resolvePressure, synthesizePressureAtVelocity } from './n6Pressure';
import { smoothOneEuro } from './n7OneEuro';
import { fitBezierChain, pressureKnots } from './n8Schneider';
import { entryAnchor, exitAnchor, opticalProfiles } from './n9Anchors';
import {
  aspectRatioOf,
  measureSampleSlant,
  medianSlant,
  SLANT_MEASURE_CHARS,
} from './n9Style';

interface ProcessedSample {
  raw: RawGlyphSample;
  glyph: NormalizedGlyph;
  bbox: GlyphBox;
}

function buildStroke(resampled: ResampledStroke): NormalizedStroke {
  if (resampled.isDot || resampled.points.length === 0) {
    const base = resampled.points[0] ?? { x: 0, y: 0, pressure: K.P_MIN };
    const p = needsSynthesis(resampled.points, resampled.pointerType)
      ? synthesizePressureAtVelocity(0)
      : base.pressure;
    const point = { x: base.x, y: base.y };
    return {
      segments: [{ p0: point, p1: { ...point }, p2: { ...point }, p3: { ...point } }],
      pressure: [
        { u: 0, p },
        { u: 1, p },
      ],
      isDot: true,
    };
  }

  const pressures = resolvePressure(
    resampled.points,
    resampled.arc,
    resampled.length,
    resampled.pointerType,
  );
  const points = resampled.points.map((p) => ({ x: p.x, y: p.y }));
  const times = resampled.points.map((p) => p.t);
  const filtered = smoothOneEuro(points, times);
  const segments = fitBezierChain(filtered);
  const pressure = pressureKnots(filtered, pressures);
  return { segments, pressure, isDot: false };
}

function processSample(
  raw: RawGlyphSample,
  strokes: EmPoint[][],
  W: number,
): ProcessedSample {
  const snapped = n3SnapStrokes(raw.char, strokes, W);
  const translated = n4Translate(snapped, W);
  const measuredSlantDeg = SLANT_MEASURE_CHARS.has(raw.char)
    ? measureSampleSlant(translated.strokes)
    : null;
  const normalized = translated.strokes.map((stroke) => buildStroke(n5Resample(stroke)));
  const entry = entryAnchor(normalized);
  const exit = exitAnchor(normalized);
  const profiles = opticalProfiles(normalized, W);

  const glyph: NormalizedGlyph = {
    id: `${raw.char}#${raw.variantIndex}`,
    char: raw.char,
    variantIndex: raw.variantIndex,
    glyphClass: glyphClassOf(raw.char),
    strokes: normalized,
    bbox: translated.bbox,
    lsb: translated.lsb,
    rsb: translated.rsb,
    advance: translated.advance,
    entry,
    exit,
    leftProfile: profiles.leftProfile,
    rightProfile: profiles.rightProfile,
    measuredSlantDeg,
  };

  return { raw, glyph, bbox: translated.bbox };
}

function compareCodePoint(a: string, b: string): number {
  return (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0);
}

export function* buildGlyphPackSteps(
  samples: RawGlyphSample[],
  nowIso: string,
): Generator<{ done: number; total: number }, GlyphPack, void> {
  const total = samples.length;

  const scaleOf = (sample: RawGlyphSample): number => {
    const xhPx = sample.guides.baselineY - sample.guides.xHeightY;
    return EM.xHeight / xhPx;
  };

  const scale = samples.map(scaleOf);
  const weights = samples.map((sample, i) => sample.penWidthPx * scale[i]);
  const W = weights.length === 0 ? 0 : median(weights);

  const n1 = samples.map((sample, i) =>
    n1MapStrokes(sample.strokes, scale[i], sample.guides.baselineY),
  );

  const fit = fitDrift(
    samples.map((sample, i) => ({
      char: sample.char,
      sessionIndex: sample.sessionIndex,
      strokes: n1[i],
    })),
  );

  const processed: ProcessedSample[] = [];
  for (let i = 0; i < samples.length; i++) {
    const afterDrift = applyDrift(n1[i], samples[i].sessionIndex, fit);
    processed.push(processSample(samples[i], afterDrift, W));
    yield { done: i + 1, total };
  }

  const chars = Array.from(new Set(processed.map((p) => p.raw.char))).sort(compareCodePoint);
  const glyphs: Record<string, NormalizedGlyph[]> = {};
  for (const char of chars) {
    const group = processed
      .filter((p) => p.raw.char === char)
      .slice()
      .sort((a, b) => a.raw.variantIndex - b.raw.variantIndex);
    glyphs[char] = group.map((entry, index) => ({
      ...entry.glyph,
      id: `${char}#${index}`,
      variantIndex: index,
    }));
  }

  const slants = processed
    .map((p) => p.glyph.measuredSlantDeg)
    .filter((v): v is number => v !== null);
  const xBoxes = processed.filter((p) => X_CLASS.has(p.raw.char)).map((p) => p.bbox);

  const pack: GlyphPack = {
    version: 1,
    unitsPerEm: 1000,
    metrics: EM,
    style: {
      slantDeg: medianSlant(slants),
      aspectRatio: aspectRatioOf(xBoxes),
      strokeWeight: W,
      driftSlopePerIndex: fit.b,
      driftMeanIndex: fit.meanIndex,
    },
    glyphs,
    createdAt: nowIso,
  };

  return pack;
}

export function buildGlyphPack(samples: RawGlyphSample[], nowIso: string): GlyphPack {
  const iterator = buildGlyphPackSteps(samples, nowIso);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}