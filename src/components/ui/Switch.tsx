import styles from './Switch.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, label, disabled = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={[styles.switch, checked ? styles.on : '', className].filter(Boolean).join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} aria-hidden="true" />
    </button>
  );
}
