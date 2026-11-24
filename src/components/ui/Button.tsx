import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  disabledReason?: string;
}

export function Button({
  variant = 'secondary',
  disabledReason,
  className,
  title,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ');
  return (
    <button {...props} type={type} className={classes} title={title ?? disabledReason}>
      {props.children}
    </button>
  );
}
