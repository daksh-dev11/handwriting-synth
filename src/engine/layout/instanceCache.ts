import { glyphOutline } from '../ink/ribbon';
import { LIMITS } from '../limits';
import { perturbInstance } from '../variance/perturb';
import type { CachedOutline, GlyphPack, NormalizedGlyph, VarianceConfig } from '../types';

interface OutlineMemo {
  inkQ: number;
  outline: CachedOutline;
}

function sameConfig(a: VarianceConfig, b: VarianceConfig): boolean {
  return (
    a.seed === b.seed &&
    a.slantJitter === b.slantJitter &&
    a.baselineDrift === b.baselineDrift &&
    a.spacingVariance === b.spacingVariance &&
    a.inkPressure === b.inkPressure &&
    a.mode === b.mode &&
    a.poolSize === b.poolSize
  );
}

function clampPool(poolSize: number): number {
  const m = Math.floor(poolSize);
  if (!Number.isFinite(m)) return LIMITS.MAX_POOL_SIZE;
  return Math.max(1, Math.min(LIMITS.MAX_POOL_SIZE, m));
}

export class InstanceCache {
  private pack: GlyphPack;
  private cfg: VarianceConfig;
  private readonly instances = new Map<string, NormalizedGlyph>();
  private readonly outlines = new Map<string, OutlineMemo>();

  constructor(pack: GlyphPack, cfg: VarianceConfig) {
    this.pack = pack;
    this.cfg = { ...cfg };
  }

  private get pool(): number {
    return clampPool(this.cfg.poolSize);
  }

  reconfigure(cfg: VarianceConfig): void {
    const seedChanged = cfg.seed !== this.cfg.seed;
    const poolChanged = clampPool(cfg.poolSize) !== this.pool;
    this.cfg = { ...cfg };
    if (seedChanged || poolChanged) {
      this.instances.clear();
      this.outlines.clear();
      return;
    }
    const inkQ = Math.round(cfg.inkPressure * 10000);
    for (const [key, memo] of this.outlines) {
      if (memo.inkQ !== inkQ) this.outlines.delete(key);
    }
  }

  matches(pack: GlyphPack, cfg: VarianceConfig): boolean {
    return pack === this.pack && sameConfig(this.cfg, cfg);
  }

  instance(glyphId: string, composite: number): NormalizedGlyph {
    const key = `${glyphId}|${composite}`;
    const memo = this.instances.get(key);
    if (memo) return memo;

    const hash = glyphId.lastIndexOf('#');
    const char = hash >= 0 ? glyphId.slice(0, hash) : glyphId;
    const pool = this.pool;
    const variant = Math.floor(composite / pool);
    const instanceIndex = composite % pool;
    const list = this.pack.glyphs[char];
    const base = list ? list[variant] ?? list[0] : undefined;
    if (!base) throw new RangeError('UNKNOWN_GLYPH');

    const glyph = instanceIndex === 0
      ? base
      : perturbInstance(base, this.cfg.seed, composite, instanceIndex, this.pack.style.strokeWeight);
    this.instances.set(key, glyph);
    return glyph;
  }

  outline(glyphId: string, composite: number, bucket: 0 | 1 | 2): CachedOutline {
    const inkI = this.cfg.inkPressure;
    const inkQ = Math.round(inkI * 10000);
    const key = `${glyphId}|${composite}|${bucket}|${inkQ}`;
    const memo = this.outlines.get(key);
    if (memo) return memo.outline;

    const glyph = this.instance(glyphId, composite);
    const multiplier = bucket === 0 ? 0.9 : bucket === 2 ? 1.1 : 1.0;
    const outline = glyphOutline(glyph, this.pack.style.strokeWeight, inkI, multiplier);
    this.outlines.set(key, { inkQ, outline });
    return outline;
  }
}