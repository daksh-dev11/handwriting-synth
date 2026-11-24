import { useEffect, useRef, useState } from 'react';
import type { LayoutResult } from '@engine';
import { LIMITS } from '@engine';
import { PreviewController } from '../../canvas/PreviewController';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../ui/Button';
import { ExportBar } from './ExportBar';
import styles from './PagePreview.module.css';

export function PagePreview() {
  const sheet = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLCanvasElement>(null);
  const ink = useRef<HTMLCanvasElement>(null);
  const controller = useRef<PreviewController | null>(null);
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const pack = useAppStore((state) => state.pack);
  const text = useAppStore((state) => state.text);
  const cfg = useAppStore((state) => state.variance);
  const template = useAppStore((state) => state.template);
  const xHeightPt = useAppStore((state) => state.xHeightPt);
  const inkRgb = useAppStore((state) => state.inkRgb);
  const maxPages = useAppStore((state) => state.maxPages);
  const previewBusy = useAppStore((state) => state.previewBusy);
  const toggleInspector = useAppStore((state) => state.toggleInspector);

  useEffect(() => {
    const back = backdrop.current;
    const foreground = ink.current;
    const element = sheet.current;
    if (!back || !foreground || !element) return undefined;
    const instance = new PreviewController(back, foreground, (busy) => {
      useAppStore.setState({ previewBusy: busy });
    });
    controller.current = instance;
    const resize = (): void => {
      const width = Math.min(720, element.clientWidth || 720);
      instance.setSheetWidth(width);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => {
      observer.disconnect();
      instance.destroy();
      if (controller.current === instance) controller.current = null;
      useAppStore.setState({ previewBusy: false });
    };
  }, []);

  useEffect(() => {
    controller.current?.update({
      pack,
      text,
      cfg,
      template,
      xHeightPt,
      inkRgb,
      onResult: setLayout,
    }, 'text');
  }, [cfg, inkRgb, pack, template, text, xHeightPt]);

  const charactersPerPage = layout?.truncated && layout.consumedChars > 0
    ? layout.consumedChars
    : 1500;
  const estimatedPages = text.length === 0
    ? 0
    : Math.min(maxPages, Math.max(1, Math.ceil(text.length / charactersPerPage)));
  const missingIndex = layout?.missingChars[0];
  const missingChar = missingIndex === undefined ? undefined : text[missingIndex];

  return (
    <section className={styles.preview} aria-label="Live document preview">
      <div className={styles.toolbar}>
        <div className={styles.pageChip} title={`Approximate page count, capped at ${maxPages} pages`}>
          {previewBusy && <span className={styles.spinner} aria-label="Preview updating" />}
          <span>Page 1{estimatedPages > 0 ? ` · ≈ ${estimatedPages} ${estimatedPages === 1 ? 'page' : 'pages'}` : ''}</span>
        </div>
        <Button
          variant="ghost"
          aria-label="Toggle writing controls"
          aria-keyshortcuts="Meta+Backslash Control+Backslash"
          onClick={toggleInspector}
        >
          Controls
        </Button>
        <ExportBar />
      </div>
      {layout?.truncated && (
        <p className={styles.caption}>Preview shows the first page. Export includes up to {maxPages} pages.</p>
      )}
      {missingChar && (
        <div className={styles.missing}>
          <span>Missing glyph: “{missingChar}”</span>
          <Button variant="ghost" onClick={() => useAppStore.getState().goToChar(missingChar)}>
            Calibrate
          </Button>
        </div>
      )}
      <div className={styles.scroll}>
        <div ref={sheet} className={styles.sheet}>
          <canvas ref={backdrop} className={styles.backdrop} aria-hidden="true" />
          <canvas ref={ink} className={styles.ink} aria-label="Handwriting preview" />
          {!pack && (
            <div className={styles.empty}>
              <p>Capture a few glyphs or load the demo hand to preview your writing.</p>
              <span>Text and layout stay on this device.</span>
            </div>
          )}
          {text.length > LIMITS.MAX_TEXT_CHARS && <span className={styles.caption}>Text is limited to {LIMITS.MAX_TEXT_CHARS} characters.</span>}
        </div>
      </div>
    </section>
  );
}
