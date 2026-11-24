import { describe, expect, it } from 'vitest';
import * as Engine from '../../src/engine';
import type {
  Anchor,
  CachedOutline,
  CaptureGuides,
  CaptureKey,
  CubicBezier,
  GlyphClass,
  GlyphPack,
  IssueCode,
  LayoutGeometry,
  LayoutResult,
  LigatureCubic,
  NormalizedGlyph,
  NormalizedStroke,
  PackFileContents,
  PageMetrics,
  PathCmd,
  Placement,
  PointerKind,
  PressureKnot,
  Pt,
  RawGlyphSample,
  RawStrokePoint,
  StyleProfile,
  TemplateId,
  TemplateSpec,
  ValidationIssue,
  ValidationResult,
  VarianceConfig,
} from '../../src/engine';

const RUNTIME_EXPORTS = [
  'buildGlyphPack',
  'buildGlyphPackSteps',
  'InstanceCache',
  'layoutText',
  'layoutTextSteps',
  'glyphOutline',
  'ribbonPath',
  'ligatureOutline',
  'placementToLine',
  'computeGuides',
  'normalizeChar',
  'glyphClassOf',
  'CAPTURE_CHARSET',
  'REQUIRED_KEYS',
  'OPTIONAL_KEYS',
  'MULTI_VARIANT_CHARS',
  'X_CLASS',
  'captureKeyOf',
  'validateGlyphPack',
  'sanitizeGlyphPack',
  'validateRawSample',
  'parsePackFile',
  'serializePackFile',
  'sanitizeSettings',
  'sanitizeVariance',
  'TEMPLATE_SPECS',
  'PAGE',
  'BACKDROP',
  'pageMetrics',
  'hash32',
  'u01',
  'gauss',
  'perlin1',
  'fnv1a32',
  'EM',
  'K',
  'CH',
  'ENGINE_SPEC_REV',
  'LIMITS',
  'DEFAULT_VARIANCE',
] as const;

export type BarrelTypeSurface = [
  Pt,
  CubicBezier,
  PressureKnot,
  NormalizedStroke,
  GlyphClass,
  Anchor,
  NormalizedGlyph,
  StyleProfile,
  GlyphPack,
  RawStrokePoint,
  RawGlyphSample,
  CaptureGuides,
  PointerKind,
  VarianceConfig,
  PathCmd,
  CachedOutline,
  LayoutGeometry,
  LigatureCubic,
  Placement,
  LayoutResult,
  TemplateId,
  TemplateSpec,
  PageMetrics,
  ValidationIssue,
  ValidationResult<unknown>,
  IssueCode,
  PackFileContents,
  CaptureKey,
];

describe('engine barrel', () => {
  it('exposes exactly the documented runtime surface', () => {
    for (const name of RUNTIME_EXPORTS) {
      expect((Engine as Record<string, unknown>)[name], name).toBeDefined();
    }
  });

  it('exports layoutTextSteps, the generator the live preview calls (audit #3)', () => {
    expect(typeof Engine.layoutTextSteps).toBe('function');
    expect(typeof Engine.layoutText).toBe('function');
  });

  it('exports buildGlyphPackSteps for cooperative checkpoints (audit #4)', () => {
    expect(typeof Engine.buildGlyphPackSteps).toBe('function');
  });

  it('exports the audit #20 settings sanitizers', () => {
    expect(typeof Engine.sanitizeSettings).toBe('function');
    expect(typeof Engine.sanitizeVariance).toBe('function');
  });

  it('exposes InstanceCache.matches as a method (audit #15)', () => {
    expect(typeof Engine.InstanceCache.prototype.matches).toBe('function');
  });
});