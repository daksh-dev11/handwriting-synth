import { useEffect, useMemo, useRef } from 'react';
import {
  buildGlyphPack,
  computeGuides,
  glyphOutline,
} from '@engine';
import type { PathCmd, RawGlyphSample, RawStrokePoint } from '@engine';
import { CaptureController } from '../../canvas/CaptureController';
import { fitCanvas } from '../../canvas/viewport';
import { useAppStore } from '../../store/useAppStore';
import styles from './CapturePad.module.css';

function pointsIn(strokes: readonly RawStrokePoint[][]): number {
  return strokes.reduce((count, stroke) => count + stroke.length, 0);
}

export function CapturePad() {
  const wrapper = useRef<HTMLDivElement>(null);
  const rawCanvas = useRef<HTMLCanvasElement>(null);
  const ribbonCanvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<CaptureController | null>(null);
  const key = useAppStore((state) => state.currentKey());
  const nextSessionIndex = useAppStore((state) => state.nextSessionIndex);
  const guideBaselinePx = useAppStore((state) => state.guideBaselinePx);
  const guideXHeightPx = useAppStore((state) => state.guideXHeightPx);
  const penWidthPx = useAppStore((state) => state.penWidthPx);
  const draftGuides = useAppStore((state) => state.draftGuides);
  const draftStrokes = useAppStore((state) => state.draftStrokes);
  const inkRgb = useAppStore((state) => state.inkRgb);
  const inkPressure = useAppStore((state) => state.variance.inkPressure);
  const readOnly = useAppStore((state) => state.readOnly);

  const preview = useMemo((): { path: PathCmd[] | null; paused: boolean } => {
    if (draftStrokes.length === 0) return { path: null, paused: false };
    const nowIso = new Date().toISOString();
    const sample: RawGlyphSample = {
      char: key.char,
      variantIndex: key.variantIndex,
      sessionIndex: nextSessionIndex,
      guides: draftGuides ?? computeGuides(guideBaselinePx, guideXHeightPx),
      penWidthPx,
      strokes: draftStrokes,
      capturedAt: nowIso,
    };
    const started = performance.now();
    const pack = buildGlyphPack([sample], nowIso);
    const glyph = pack.glyphs[key.char]?.[0];
    return {
      path: glyph ? glyphOutline(glyph, pack.style.strokeWeight, inkPressure, 1).path : null,
      paused: performance.now() - started > 8,
    };
  }, [
    draftGuides,
    draftStrokes,
    guideBaselinePx,
    guideXHeightPx,
    inkPressure,
    key.char,
    key.variantIndex,
    nextSessionIndex,
    penWidthPx,
  ]);
  const previewPath = useRef<PathCmd[] | null>(preview.path);
  previewPath.current = preview.path;

  useEffect(() => {
    const raw = rawCanvas.current;
    const ribbon = ribbonCanvas.current;
    const parent = wrapper.current;
    if (!raw || !ribbon || !parent || readOnly) return undefined;
    const fit = (): void => {
      const width = Math.min(640, parent.clientWidth || 640);
      fitCanvas(raw, width, 480);
      fitCanvas(ribbon, width, 480);
      const state = useAppStore.getState();
      controller.current?.setGuides(
        state.draftGuides ?? computeGuides(state.guideBaselinePx, state.guideXHeightPx),
        state.penWidthPx,
      );
      controller.current?.setDraft(state.draftStrokes, previewPath.current, state.inkRgb);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(parent);
    const instance = new CaptureController(raw, ribbon, {
      onStrokeEnd: (points) => useAppStore.getState().pushStroke(points),
      onDrawingChange: (drawing) => useAppStore.getState().onDrawingChange(drawing),
      onLimit: () => useAppStore.getState().pushToast({ text: 'Stroke limit reached — accept or clear.' }),
    });
    controller.current = instance;
    const state = useAppStore.getState();
    state.setCaptureAbort(() => instance.abortActive());
    instance.setGuides(
      state.draftGuides ?? computeGuides(state.guideBaselinePx, state.guideXHeightPx),
      state.penWidthPx,
    );
    instance.setDraft(state.draftStrokes, previewPath.current, state.inkRgb);
    return () => {
      observer.disconnect();
      instance.destroy();
      if (controller.current === instance) controller.current = null;
      useAppStore.getState().setCaptureAbort(null);
    };
  }, [readOnly]);

  useEffect(() => {
    controller.current?.setGuides(
      draftGuides ?? computeGuides(guideBaselinePx, guideXHeightPx),
      penWidthPx,
    );
  }, [draftGuides, guideBaselinePx, guideXHeightPx, penWidthPx]);

  useEffect(() => {
    controller.current?.setDraft(draftStrokes, preview.path, inkRgb);
    if (rawCanvas.current) rawCanvas.current.title = preview.paused ? 'Preview paused' : '';
  }, [draftStrokes, inkRgb, preview]);

  const guides = draftGuides ?? computeGuides(guideBaselinePx, guideXHeightPx);
  return (
    <div className={styles.card}>
      <div ref={wrapper} className={styles.canvasWrap}>
        <canvas ref={rawCanvas} className={styles.raw} aria-label="Draw the prompted glyph" />
        <canvas ref={ribbonCanvas} className={styles.ribbon} aria-hidden="true" />
        <span className={styles.guideLabel} style={{ top: guides.ascenderY }}>asc</span>
        <span className={styles.guideLabel} style={{ top: guides.xHeightY }}>x</span>
        <span className={styles.guideLabel} style={{ top: guides.baselineY }}>base</span>
        <span className={styles.guideLabel} style={{ top: guides.descenderY }}>desc</span>
        {preview.paused && <span className={styles.previewPaused}>Preview paused</span>}
        <span className={styles.pointCount} aria-live="polite">
          {pointsIn(draftStrokes)} points
        </span>
      </div>
    </div>
  );
}
