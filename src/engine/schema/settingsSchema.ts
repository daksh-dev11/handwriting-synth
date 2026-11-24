import { TEMPLATE_SPECS } from '../layout/templates';
import { LIMITS } from '../limits';
import type { TemplateId } from '../layout/templates';
import { DEFAULT_VARIANCE } from '../types';
import type { VarianceConfig } from '../types';

export interface AppSettings {
  variance: VarianceConfig;
  template: TemplateId;
  xHeightPt: number;
  inkRgb: [number, number, number];
  maxPages: number;
  nextSessionIndex: number;
  guideBaselinePx: number;
  guideXHeightPx: number;
  penWidthPx: number;
  draft: string;
}

const TEMPLATE_IDS: readonly string[] = Object.keys(TEMPLATE_SPECS);

function clampNum(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function finiteOr(x: unknown, d: number): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : d;
}

export function sanitizeVariance(v: unknown): VarianceConfig {
  const o = (typeof v === 'object' && v) ? v as Record<string, unknown> : {};
  const f = (x: unknown, d: number, lo: number, hi: number): number =>
    (typeof x === 'number' && Number.isFinite(x)) ? Math.min(hi, Math.max(lo, x)) : d;
  const seed = (typeof o.seed === 'number' && Number.isInteger(o.seed) && o.seed >= 0 && o.seed <= 4294967295)
    ? o.seed
    : DEFAULT_VARIANCE.seed;
  return {
    seed,
    slantJitter: f(o.slantJitter, 0.5, 0, 1),
    baselineDrift: f(o.baselineDrift, 0.5, 0, 1),
    spacingVariance: f(o.spacingVariance, 0.5, 0, 1),
    inkPressure: f(o.inkPressure, 0.5, 0, 1),
    mode: o.mode === 'semi-cursive' ? 'semi-cursive' : 'print',
    poolSize: Math.round(f(o.poolSize, 4, 1, LIMITS.MAX_POOL_SIZE)),
  };
}

function sanitizeRgb(value: unknown): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return [0, 0, 0];
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const c = value[i];
    out[i] = typeof c === 'number' && Number.isFinite(c) ? clampNum(c, 0, 1) : 0;
  }
  return out;
}

export function sanitizeSettings(input: unknown): AppSettings {
  const o = (typeof input === 'object' && input) ? input as Record<string, unknown> : {};
  const variance = sanitizeVariance(o.variance);
  const template: TemplateId = typeof o.template === 'string' && TEMPLATE_IDS.includes(o.template)
    ? o.template as TemplateId
    : 'ruled';
  const xHeightPt = clampNum(finiteOr(o.xHeightPt, 10), 6, 10.5);
  const inkRgb = sanitizeRgb(o.inkRgb);
  const maxPages = Math.min(LIMITS.MAX_PAGES, Math.max(1, Math.round(finiteOr(o.maxPages, 10))));
  const nextSessionIndex = Number.isInteger(o.nextSessionIndex) && (o.nextSessionIndex as number) >= 0
    ? o.nextSessionIndex as number
    : 0;

  const guideXHeightPx = Math.round(clampNum(finiteOr(o.guideXHeightPx, 120), 60, 160));
  const guideBaselinePx = Math.round(
    clampNum(finiteOr(o.guideBaselinePx, 340), 2 * guideXHeightPx + 10, 470 - (2 / 3) * guideXHeightPx),
  );
  const penWidthPx = Math.round(clampNum(finiteOr(o.penWidthPx, 16), 6, 32));

  const draft = typeof o.draft === 'string' ? o.draft.slice(0, LIMITS.MAX_TEXT_CHARS) : '';

  return {
    variance,
    template,
    xHeightPt,
    inkRgb,
    maxPages,
    nextSessionIndex,
    guideBaselinePx,
    guideXHeightPx,
    penWidthPx,
    draft,
  };
}