import type { CSSProperties, KeyboardEvent } from 'react';
import styles from './Segmented.module.css';

export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedProps {
  label: string;
  options: readonly SegmentedOption[];
  value: string;
  onChange(value: string): void;
  className?: string;
}

export function Segmented({ label, options, value, onChange, className }: SegmentedProps) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const thumbStyle: CSSProperties = {
    width: `calc((100% - 4px) / ${Math.max(options.length, 1)})`,
    transform: `translateX(${selectedIndex * 100}%)`,
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (options.length === 0) return;
    let index = selectedIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') index = (index + 1) % options.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') index = (index + options.length - 1) % options.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = options.length - 1;
    else return;
    event.preventDefault();
    const option = options[index];
    if (option) {
      onChange(option.value);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
    }
  };

  return (
    <div
      className={[styles.track, className].filter(Boolean).join(' ')}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <span className={styles.thumb} style={thumbStyle} aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          className={styles.option}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
