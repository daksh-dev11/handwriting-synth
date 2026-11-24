import { selectCanExport, useAppStore } from '../../store/useAppStore';
import { Button } from '../ui/Button';
import styles from './ExportBar.module.css';

const activePhases = new Set(['validate', 'layout', 'emit', 'finalize']);

export function ExportBar() {
  const canExport = useAppStore(selectCanExport);
  const phase = useAppStore((state) => state.phase);
  const progress = useAppStore((state) => state.progress);
  const error = useAppStore((state) => state.error);
  const warnings = useAppStore((state) => state.warnings);
  const startExport = useAppStore((state) => state.startExport);
  const cancelExport = useAppStore((state) => state.cancelExport);
  const dismissJob = useAppStore((state) => state.dismissJob);
  const running = activePhases.has(phase);

  return (
    <div className={styles.export}>
      <Button
        variant="primary"
        disabled={!canExport}
        disabledReason={!canExport ? 'Add text and capture or load at least one glyph first.' : undefined}
        aria-keyshortcuts="Meta+Enter Control+Enter"
        onClick={() => void startExport()}
      >
        Export PDF
      </Button>
      {running && (
        <div className={styles.job} role="status">
          <span>{progress?.phase ?? phase} · {Math.round((progress?.fraction ?? 0) * 100)}%</span>
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="PDF export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((progress?.fraction ?? 0) * 100)}
          >
            <span style={{ width: `${Math.min(100, Math.max(0, (progress?.fraction ?? 0) * 100))}%` }} />
          </div>
          <Button variant="ghost" onClick={cancelExport}>Cancel</Button>
        </div>
      )}
      {!running && (phase === 'done' || phase === 'cancelled' || phase === 'failed') && (
        <div className={styles.job} role={phase === 'failed' ? 'alert' : 'status'}>
          <span>{phase === 'done' ? 'PDF ready.' : phase === 'cancelled' ? 'Export cancelled.' : 'Export failed.'}</span>
          {phase !== 'done' && error && <span className={styles.error}>{error.message}</span>}
          {warnings.map((warning) => <span key={warning.code}>{warning.message}</span>)}
          <Button variant="ghost" onClick={dismissJob}>Dismiss</Button>
        </div>
      )}
      {phase === 'idle' && warnings.map((warning) => (
        <span key={warning.code} className={styles.warning}>{warning.message}</span>
      ))}
    </div>
  );
}
