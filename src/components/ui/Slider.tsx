import type { CSSProperties, ChangeEvent } from 'react';
import styles from './Slider.module.css';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
  formatValue?(value: number): string;
  disabled?: boolean;
  disabledReason?: string;
  id?: string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue = String,
  disabled = false,
  disabledReason,
  id,
}: SliderProps) {
  const percent = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  const style: CSSProperties & { '--fill': string } = { '--fill': `${percent}%` };
  const onInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(Number(event.currentTarget.value));
  };
  return (
    <label className={styles.row} htmlFor={id}>
      <span className={styles.label}>{label}</span>
      <input
        id={id}
        className={styles.slider}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        title={disabledReason}
        aria-label={label}
        onChange={onInputChange}
        style={style}
      />
      <output className={`${styles.value} num`}>{formatValue(value)}</output>
    </label>
  );
}
