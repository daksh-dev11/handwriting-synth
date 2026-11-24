import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    confirmButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className={styles.overlay}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <h2 className={styles.title} id={titleId}>{title}</h2>
        <div className={styles.message} id={messageId}>{children}</div>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button ref={confirmButton} type="button" className={styles.confirm} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
