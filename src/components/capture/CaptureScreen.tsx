import { REQUIRED_KEYS } from '@engine';
import { useAppStore, selectRequiredDone } from '../../store/useAppStore';
import { CaptureActions } from './CaptureActions';
import { CapturePad } from './CapturePad';
import { GlyphRail } from './GlyphRail';
import { GuideSliders } from './GuideSliders';
import styles from './CaptureScreen.module.css';

export function CaptureScreen() {
  const key = useAppStore((state) => state.currentKey());
  const cursor = useAppStore((state) => state.cursor);
  const queue = useAppStore((state) => state.queue);
  const optionalOpen = useAppStore((state) => state.optionalOpen);
  const galleryOpen = useAppStore((state) => state.galleryOpen);
  const done = useAppStore(selectRequiredDone);
  const setMode = useAppStore((state) => state.setMode);
  const setOptionalOpen = useAppStore((state) => state.setOptionalOpen);
  const toggleGallery = useAppStore((state) => state.toggleGallery);
  const variantCount = queue.filter((item) => item.char === key.char).length;
  const variantPosition = queue.filter((item, index) => index <= cursor && item.char === key.char).length;

  return (
    <section className={styles.screen} aria-label="Guided glyph calibration studio">
      <header className={styles.prompt}>
        <div className={styles.glyph} aria-hidden="true">{key.char}</div>
        <div className={styles.promptText}>
          <h1>Draw “{key.char}”</h1>
          <p className="num">
            {variantCount > 1 ? `Variant ${variantPosition} of ${variantCount} · ` : ''}
            {Math.min(done + 1, REQUIRED_KEYS.length)} of {REQUIRED_KEYS.length}
          </p>
        </div>
        <GuideSliders />
      </header>
      <div className={styles.galleryHeader}>
        <button
          type="button"
          aria-expanded={galleryOpen}
          aria-keyshortcuts="G"
          onClick={toggleGallery}
        >
          Glyphs · {done} / {REQUIRED_KEYS.length}
          <span aria-hidden="true">{galleryOpen ? '⌄' : '›'}</span>
        </button>
      </div>
      <GlyphRail expanded={galleryOpen} />
      <div className={styles.paperArea}>
        <CapturePad />
      </div>
      <CaptureActions />
      <footer className={styles.footer}>
        <span>Changes apply to glyphs you draw next.</span>
        <div className={styles.footerActions}>
          {!optionalOpen ? (
            <button type="button" onClick={() => setOptionalOpen(true)}>Draw optional symbols</button>
          ) : (
            <button type="button" onClick={() => setOptionalOpen(false)}>Finish optional symbols</button>
          )}
          {done === REQUIRED_KEYS.length && (
            <button type="button" onClick={() => setMode('write')}>Write &amp; Export</button>
          )}
        </div>
      </footer>
    </section>
  );
}
