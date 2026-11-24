import { Button } from '../ui/Button';
import { useAppStore } from '../../store/useAppStore';
import styles from './CaptureActions.module.css';

export function CaptureActions() {
  const state = useAppStore();
  const disabled = state.readOnly;
  const draftExists = state.draftStrokes.length > 0;
  const canNavigateBackward = state.cursor > 0;
  const canNavigateForward = state.cursor < state.queue.length - 1;

  return (
    <div className={styles.actions}>
      <Button variant="ghost" onClick={state.clearDraft} disabled={disabled || !draftExists} aria-keyshortcuts="Escape">
        Clear
      </Button>
      <Button variant="ghost" onClick={state.undoStroke} disabled={disabled || !draftExists} aria-keyshortcuts="Backspace Meta+Z Control+Z">
        Undo stroke
      </Button>
      <Button variant="ghost" onClick={state.prev} disabled={!canNavigateBackward} aria-keyshortcuts="ArrowLeft">
        Previous
      </Button>
      <Button variant="ghost" onClick={state.next} disabled={!canNavigateForward} aria-keyshortcuts="ArrowRight">
        Skip
      </Button>
      <Button
        variant="primary"
        onClick={() => void state.commitDraft()}
        disabled={disabled || state.draftState !== 'drafted'}
        disabledReason={state.draftState === 'drawing' ? 'Finish the stroke before accepting.' : undefined}
        aria-keyshortcuts="Enter Space"
      >
        Accept ↵
      </Button>
    </div>
  );
}
