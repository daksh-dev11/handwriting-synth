import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './Popover.module.css';

export interface PopoverProps {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Popover({ label, trigger, children, className }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const triggerButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerButton.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')} ref={root}>
      <button
        ref={triggerButton}
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}
