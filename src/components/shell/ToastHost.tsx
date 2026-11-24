import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import styles from './ToastHost.module.css';

export interface ToastAction {
  label: string;
  onClick(): void;
}

export interface ToastMessage {
  id: string;
  text: ReactNode;
  action?: ToastAction;
}

export interface ToastHostProps {
  toasts: readonly ToastMessage[];
  onDismiss(id: string): void;
}

interface ToastProps {
  toast: ToastMessage;
  onDismiss(id: string): void;
}

function Toast({ toast, onDismiss }: ToastProps) {
  const duration = toast.action ? 8000 : 4000;
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  const pause = (): void => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt.current));
  };

  const resume = (): void => {
    if (timer.current !== null) return;
    startedAt.current = performance.now();
    timer.current = setTimeout(() => {
      timer.current = null;
      dismiss.current(toast.id);
    }, remaining.current);
  };

  useEffect(() => {
    remaining.current = duration;
    resume();
    return pause;
  }, [duration, toast.id]);

  const onAction = (): void => {
    toast.action?.onClick();
    onDismiss(toast.id);
  };

  return (
    <div
      className={styles.toast}
      role="status"
      onPointerEnter={pause}
      onPointerLeave={resume}
    >
      <span className={styles.message}>{toast.text}</span>
      {toast.action && (
        <button type="button" className={styles.action} onClick={onAction}>
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  );
}

export function ToastHost({ toasts, onDismiss }: ToastHostProps) {
  return (
    <div className={styles.host} aria-live="polite" aria-relevant="additions">
      {toasts.slice(-3).map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
