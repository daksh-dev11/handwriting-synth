import { REQUIRED_KEYS } from '@engine';
import { selectRequiredDone, useAppStore } from '../../store/useAppStore';
import styles from './StatusPill.module.css';

export function StatusPill() {
  const done = useAppStore(selectRequiredDone);
  const packStatus = useAppStore((state) => state.packStatus);
  const importedNoRaw = useAppStore((state) => state.importedNoRaw);
  const setMode = useAppStore((state) => state.setMode);
  const toggleGallery = useAppStore((state) => state.toggleGallery);
  const ratio = REQUIRED_KEYS.length > 0 ? done / REQUIRED_KEYS.length : 0;
  const complete = done === REQUIRED_KEYS.length;

  return (
    <button
      type="button"
      className={styles.pill}
      onClick={() => {
        setMode('calibrate');
        toggleGallery();
      }}
      title={`${REQUIRED_KEYS.length - done} required glyphs remain${importedNoRaw ? '. Imported pack has no raw samples.' : ''}`}
      aria-label={`${done} of ${REQUIRED_KEYS.length} required glyphs captured. Open calibration gallery.`}
    >
      <span>{complete ? '✓ Hand complete' : `${done} / ${REQUIRED_KEYS.length} glyphs`}</span>
      {packStatus === 'building' || packStatus === 'stale' ? (
        <span className={styles.updating}> · Updating…</span>
      ) : null}
      {importedNoRaw ? <span className={styles.imported}> · Imported pack</span> : null}
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${ratio * 100}%` }} />
      </span>
    </button>
  );
}
