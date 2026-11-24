import type { ReactNode } from 'react';
import styles from './Banner.module.css';

export interface BannerProps {
  title: string;
  children: ReactNode;
  tone?: 'warning' | 'danger';
  className?: string;
}

export function Banner({ title, children, tone = 'warning', className }: BannerProps) {
  const isDanger = tone === 'danger';
  return (
    <aside
      className={[styles.banner, isDanger ? styles.danger : styles.warning, className].filter(Boolean).join(' ')}
      role={isDanger ? 'alert' : 'status'}
    >
      <span className={styles.mark} aria-hidden="true">{isDanger ? '!' : 'i'}</span>
      <div className={styles.content}>
        <strong className={styles.title}>{title}</strong>
        <div className={styles.body}>{children}</div>
      </div>
    </aside>
  );
}
