import {
  EM,
  InstanceCache,
  PAGE,
  TEMPLATE_SPECS,
  layoutTextSteps,
  ligatureOutline,
  pageMetrics,
  placementToLine,
  sanitizeSettings,
  sanitizeVariance,
} from '@engine';
import type { GlyphPack, LayoutResult, PathCmd, Placement, TemplateId, VarianceConfig } from '@engine';
import { drawBackdrop } from './backdrop';
import { Path2DMemo, toPath2D } from './inkRenderer';
import { browserCanvasRuntime, fitCanvas } from './viewport';
import type { CanvasRuntime } from './viewport';

export interface PreviewInput {
  pack: GlyphPack | null;
  text: string;
  cfg: VarianceConfig;
  template: TemplateId;
  xHeightPt: number;
  inkRgb: [number, number, number];
  onResult(result: LayoutResult): void;
}

interface PreparedInput extends PreviewInput {
  cfg: VarianceConfig;
}

export interface PlacementTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export function placementTransform(
  placement: Placement,
  scale: number,
  sheetRatio: number,
  baselineFromTopPt: number,
  textLeftPt: number,
): PlacementTransform {
  const origin = placementToLine(placement, placement.pivX, EM.baselineY);
  const xBasis = placementToLine(placement, placement.pivX + 1, EM.baselineY);
  const yBasis = placementToLine(placement, placement.pivX, EM.baselineY + 1);
  const factor = scale * sheetRatio;
  const a = factor * (xBasis.x - origin.x);
  const b = factor * (xBasis.y - origin.y);
  const c = factor * (yBasis.x - origin.x);
  const d = factor * (yBasis.y - origin.y);
  const x = sheetRatio * (textLeftPt + scale * origin.x);
  const y = sheetRatio * (baselineFromTopPt + scale * origin.y);
  return {
    a,
    b,
    c,
    d,
    e: x - (a * placement.pivX + c * EM.baselineY),
    f: y - (b * placement.pivX + d * EM.baselineY),
  };
}

interface PaintState {
  cache: InstanceCache;
  layout: LayoutResult;
  memo: Path2DMemo;
  gen: number;
  cfg: VarianceConfig;
  pack: GlyphPack;
  template: TemplateId;
  xHeightPt: number;
  inkRgb: [number, number, number];
  sheetCssW: number;
}

function rgbCss(rgb: [number, number, number]): string {
  return `rgb(${rgb.map((component) => Math.round(component * 255)).join(' ')})`;
}

function pathFor(commands: readonly PathCmd[]): Path2D {
  return toPath2D(commands);
}

export class PreviewController {
  private readonly backdrop: HTMLCanvasElement;
  private readonly ink: HTMLCanvasElement;
  private readonly back: HTMLCanvasElement;
  private readonly onBusy: (busy: boolean) => void;
  private readonly runtime: CanvasRuntime;
  private readonly memo = new Path2DMemo();
  private sheetCssW = 0;
  private input: PreparedInput | null = null;
  private cache: InstanceCache | null = null;
  private cachePack: GlyphPack | null = null;
  private cfg: VarianceConfig | null = null;
  private timer = 0;
  private raf = 0;
  private paintRaf = 0;
  private dirty = false;
  private deferNext = false;
  private gen = 0;
  private destroyed = false;

  constructor(
    backdrop: HTMLCanvasElement,
    ink: HTMLCanvasElement,
    onBusy: (busy: boolean) => void,
    runtime: CanvasRuntime = browserCanvasRuntime,
  ) {
    this.backdrop = backdrop;
    this.ink = ink;
    this.onBusy = onBusy;
    this.runtime = runtime;
    this.back = runtime.createCanvas();
  }

  setSheetWidth(cssW: number): void {
    if (this.destroyed) return;
    this.sheetCssW = cssW;
    const cssH = cssW * PAGE.heightPt / PAGE.widthPt;
    fitCanvas(this.backdrop, cssW, cssH, 2, this.runtime.devicePixelRatio());
    fitCanvas(this.ink, cssW, cssH, 2, this.runtime.devicePixelRatio());
    fitCanvas(this.back, cssW, cssH, 2, this.runtime.devicePixelRatio());
    const context = this.backdrop.getContext('2d');
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
    drawBackdrop(context, this.input?.template ?? 'ruled', cssW);
    if (this.input) {
      this.gen += 1;
      this.mark();
    }
  }

  update(input: PreviewInput, kind: 'text' | 'immediate'): void {
    if (this.destroyed) return;
    const sanitized = sanitizeSettings({
      variance: sanitizeVariance(input.cfg),
      template: input.template,
      xHeightPt: input.xHeightPt,
      inkRgb: input.inkRgb,
      maxPages: 1,
    });
    this.input = {
      ...input,
      cfg: sanitized.variance,
      template: sanitized.template,
      xHeightPt: pageMetrics(sanitized.template, sanitized.xHeightPt).xHeightPt,
      inkRgb: sanitized.inkRgb,
    };
    this.gen += 1;
    if (kind === 'text') {
      if (this.timer) this.runtime.clearTimer(this.timer);
      this.timer = this.runtime.setTimer(() => {
        this.timer = 0;
        this.mark();
      }, 120);
      return;
    }
    if (this.timer) {
      this.runtime.clearTimer(this.timer);
      this.timer = 0;
    }
    this.mark();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.timer) this.runtime.clearTimer(this.timer);
    if (this.raf) this.runtime.cancelFrame(this.raf);
    if (this.paintRaf) this.runtime.cancelFrame(this.paintRaf);
    this.timer = 0;
    this.raf = 0;
    this.paintRaf = 0;
    this.gen += 1;
    this.dirty = false;
    this.back.width = 0;
    this.back.height = 0;
  }

  private mark(): void {
    if (this.destroyed) return;
    this.dirty = true;
    if (!this.raf) this.raf = this.runtime.requestFrame(this.run);
  }

  private readonly run = (): void => {
    this.raf = 0;
    if (!this.dirty) return;
    this.dirty = false;
    if (this.deferNext) {
      this.deferNext = false;
      this.mark();
      return;
    }

    const input = this.input;
    if (!input) return;
    const gen = this.gen;
    const metrics = pageMetrics(input.template, input.xHeightPt);
    const spec = TEMPLATE_SPECS[input.template];
    const pack = input.pack;
    if (!pack) {
      this.cache = null;
      this.cachePack = null;
      this.cfg = null;
      this.memo.clear();
      this.clearInk();
      input.onResult({
        placements: [],
        lineCount: 0,
        pageCount: 0,
        truncated: false,
        consumedChars: 0,
        missingChars: [],
      });
      this.onBusy(false);
      return;
    }

    const previousCfg = this.cfg;
    const recreated = this.cache === null || this.cachePack !== pack;
    if (recreated) {
      this.cache = new InstanceCache(pack, input.cfg);
      this.cachePack = pack;
      this.cfg = { ...input.cfg };
    } else if (this.cache && !this.cache.matches(pack, input.cfg)) {
      this.cache.reconfigure(input.cfg);
      this.cfg = { ...input.cfg };
    }
    const cache = this.cache;
    if (!cache) throw new Error('PREVIEW_CACHE_UNAVAILABLE');
    if (
      recreated ||
      previousCfg?.seed !== input.cfg.seed ||
      previousCfg?.poolSize !== input.cfg.poolSize
    ) {
      this.memo.clear();
    } else {
      this.memo.retainInk(Math.round(input.cfg.inkPressure * 10000));
    }

    const iterator = layoutTextSteps(
      input.text,
      pack,
      input.cfg,
      { lineWidthEm: metrics.lineWidthEm, linesPerPage: spec.linesPerPage, maxPages: 1 },
      cache,
    );
    this.onBusy(true);
    this.advanceLayout(iterator, {
      cache,
      gen,
      input,
      pack,
    });
  };

  private advanceLayout(
    iterator: Generator<{ consumedChars: number }, LayoutResult, void>,
    context: {
      cache: InstanceCache;
      gen: number;
      input: PreparedInput;
      pack: GlyphPack;
    },
  ): void {
    if (this.destroyed) return;
    if (context.gen !== this.gen) {
      if (this.dirty) this.mark();
      return;
    }

    const sliceStart = this.runtime.now();
    let result = iterator.next();
    while (!result.done && this.runtime.now() - sliceStart < 6) {
      result = iterator.next();
    }
    if (!result.done) {
      this.raf = this.runtime.requestFrame(() => {
        this.raf = 0;
        this.advanceLayout(iterator, context);
      });
      return;
    }

    const elapsed = this.runtime.now() - sliceStart;
    if (elapsed > 8) this.deferNext = true;
    context.input.onResult(result.value);
    this.paint({
      cache: context.cache,
      layout: result.value,
      memo: this.memo,
      gen: context.gen,
      cfg: context.input.cfg,
      pack: context.pack,
      template: context.input.template,
      xHeightPt: context.input.xHeightPt,
      inkRgb: context.input.inkRgb,
      sheetCssW: this.sheetCssW,
    });
  }

  private paint(state: PaintState): void {
    if (this.destroyed || state.gen !== this.gen) {
      if (this.dirty) this.mark();
      return;
    }
    const context = this.back.getContext('2d');
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.back.width, this.back.height);

    let index = 0;
    const paintNext = (): void => {
      this.paintRaf = 0;
      if (this.destroyed || state.gen !== this.gen) {
        if (this.dirty) this.mark();
        return;
      }

      const ratio = state.sheetCssW / PAGE.widthPt;
      const metrics = pageMetrics(state.template, state.xHeightPt);
      const spec = TEMPLATE_SPECS[state.template];
      const sliceStart = this.runtime.now();
      let painted = 0;
      while (index < state.layout.placements.length) {
        const placement = state.layout.placements[index];
        if (!placement) {
          index += 1;
          continue;
        }
        this.paintPlacement(context, placement, state, metrics.S, ratio, spec);
        index += 1;
        painted += 1;
        if (painted >= 64 && this.runtime.now() - sliceStart >= 8) {
          this.paintRaf = this.runtime.requestFrame(paintNext);
          return;
        }
      }

      if (state.gen !== this.gen || this.destroyed) return;
      const visible = this.ink.getContext('2d');
      if (!visible) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
      visible.setTransform(1, 0, 0, 1, 0, 0);
      visible.clearRect(0, 0, this.ink.width, this.ink.height);
      visible.drawImage(this.back, 0, 0);
      this.onBusy(false);
    };

    paintNext();
  }

  private paintPlacement(
    context: CanvasRenderingContext2D,
    placement: Placement,
    state: PaintState,
    scale: number,
    ratio: number,
    spec: (typeof TEMPLATE_SPECS)[TemplateId],
  ): void {
    const row = placement.line % spec.linesPerPage;
    const baseline = spec.firstBaselineFromTopPt + row * spec.linePitchPt;
    const transform = placementTransform(
      placement,
      scale,
      ratio,
      baseline,
      spec.textLeftPt,
    );
    const dpr = Math.min(this.runtime.devicePixelRatio(), 2);
    context.setTransform(
      dpr * transform.a,
      dpr * transform.b,
      dpr * transform.c,
      dpr * transform.d,
      dpr * transform.e,
      dpr * transform.f,
    );
    context.fillStyle = rgbCss(state.inkRgb);
    const outline = state.cache.outline(placement.glyphId, placement.composite, placement.bucket);
    context.fill(
      state.memo.get(
        `${placement.glyphId}|${placement.composite}|${placement.bucket}|${Math.round(state.cfg.inkPressure * 10000)}`,
        () => outline.path,
      ),
      'nonzero',
    );

    if (placement.ligatureFromPrev) {
      const commands = ligatureOutline(
        placement.ligatureFromPrev,
        state.pack.style.strokeWeight,
        state.cfg.inkPressure,
      );
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mapped = this.mapLigature(commands, spec.textLeftPt, baseline, scale, ratio);
      context.fill(pathFor(mapped), 'nonzero');
    }
  }

  private mapLigature(
    commands: readonly PathCmd[],
    textLeftPt: number,
    baseline: number,
    scale: number,
    ratio: number,
  ): PathCmd[] {
    return commands.map((command): PathCmd => {
      if (command.op === 'Z') return command;
      if (command.op === 'M') {
        return {
          op: 'M',
          x: ratio * (textLeftPt + scale * command.x),
          y: ratio * (baseline + scale * command.y),
        };
      }
      return {
        op: 'C',
        x1: ratio * (textLeftPt + scale * command.x1),
        y1: ratio * (baseline + scale * command.y1),
        x2: ratio * (textLeftPt + scale * command.x2),
        y2: ratio * (baseline + scale * command.y2),
        x: ratio * (textLeftPt + scale * command.x),
        y: ratio * (baseline + scale * command.y),
      };
    });
  }

  private clearInk(): void {
    const context = this.ink.getContext('2d');
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.ink.width, this.ink.height);
  }
}
