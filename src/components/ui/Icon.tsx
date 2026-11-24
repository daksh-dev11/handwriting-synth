import type { SVGProps } from 'react';
import styles from './Icon.module.css';

export type IconName = 'check' | 'close' | 'info' | 'warning' | 'ruler' | 'undo' | 'redo' | 'chevronDown';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
}

export function Icon({ name, className, ...props }: IconProps) {
  const content = (() => {
    if (name === 'check') return <path d="m5 12 4 4L19 6" />;
    if (name === 'close') return <path d="m6 6 12 12M18 6 6 18" />;
    if (name === 'info') return <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>;
    if (name === 'warning') return <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></>;
    if (name === 'ruler') return <><path d="m4 16 12-12 4 4L8 20l-4-4Z" /><path d="m12 8 2 2m-5 1 2 2m-5 1 2 2" /></>;
    if (name === 'undo') return <><path d="M9 14 4 9l5-5" /><path d="M4 9h9a7 7 0 0 1 0 14h-2" /></>;
    if (name === 'redo') return <><path d="m15 14 5-5-5-5" /><path d="M20 9h-9a7 7 0 0 0 0 14h2" /></>;
    return <path d="m6 9 6 6 6-6" />;
  })();

  return (
    <svg
      className={[styles.icon, className].filter(Boolean).join(' ')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props['aria-label'] ? undefined : true}
      role={props['aria-label'] ? 'img' : undefined}
      {...props}
    >
      {content}
    </svg>
  );
}
