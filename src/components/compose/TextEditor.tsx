import { LIMITS } from '@engine';
import { Button } from '../ui/Button';
import { useAppStore } from '../../store/useAppStore';
import styles from './TextEditor.module.css';

const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog.';

export function TextEditor() {
  const text = useAppStore((state) => state.text);
  const setText = useAppStore((state) => state.setText);
  const readOnly = useAppStore((state) => state.readOnly);
  const warning = text.length >= Math.floor(LIMITS.MAX_TEXT_CHARS * 0.9);

  return (
    <section className={styles.editor} aria-label="Document text">
      <textarea
        value={text}
        maxLength={LIMITS.MAX_TEXT_CHARS}
        spellCheck={false}
        disabled={readOnly}
        title={readOnly ? 'This hand is open in another tab.' : undefined}
        placeholder="Type or paste what you’d like to write by hand…"
        aria-label="Text to write"
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <footer className={styles.footer}>
        <Button
          variant="ghost"
          disabled={readOnly || text.length > 0}
          disabledReason={readOnly ? 'This hand is open in another tab.' : undefined}
          onClick={() => setText(SAMPLE_TEXT)}
        >
          Sample text
        </Button>
        <span className={[styles.counter, warning ? styles.warning : ''].filter(Boolean).join(' ')}>
          <span className="num">{text.length.toLocaleString()} / {LIMITS.MAX_TEXT_CHARS.toLocaleString()}</span>
        </span>
      </footer>
    </section>
  );
}
