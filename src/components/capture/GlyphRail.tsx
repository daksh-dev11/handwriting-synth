import type { KeyboardEvent } from 'react';
import { REQUIRED_KEYS } from '@engine';
import { useAppStore, selectRequiredDone } from '../../store/useAppStore';
import styles from './GlyphRail.module.css';

export function GlyphRail({ expanded = false }: { expanded?: boolean }) {
  const queue = useAppStore((state) => state.queue);
  const cursor = useAppStore((state) => state.cursor);
  const rawByKey = useAppStore((state) => state.rawByKey);
  const goTo = useAppStore((state) => state.goTo);
  const done = useAppStore(selectRequiredDone);

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    let next: number | null = null;
    if (event.code === 'ArrowRight') next = Math.min(queue.length - 1, cursor + 1);
    if (event.code === 'ArrowLeft') next = Math.max(0, cursor - 1);
    if (event.code === 'Home') next = 0;
    if (event.code === 'End') next = queue.length - 1;
    if (next === null) return;
    event.preventDefault();
    goTo(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
  };

  return (
    <div className={[styles.rail, expanded ? styles.expanded : ''].filter(Boolean).join(' ')}>
      <div className={styles.count}>{done} / {REQUIRED_KEYS.length}</div>
      <div className={styles.grid} role="grid" aria-label="Glyph capture queue" onKeyDown={onGridKeyDown}>
        {queue.map((item, index) => {
          const captured = Boolean(rawByKey[item.key]);
          return (
            <button
              key={item.key}
              type="button"
              role="gridcell"
              data-index={index}
              aria-label={`${item.char}, variant ${item.variantIndex + 1}${captured ? ', captured' : ', not captured'}`}
              aria-current={index === cursor ? 'step' : undefined}
              tabIndex={index === cursor ? 0 : -1}
              className={[
                styles.tick,
                captured ? styles.captured : '',
                index === cursor ? styles.current : '',
              ].filter(Boolean).join(' ')}
              onClick={() => goTo(index)}
            >
              <span aria-hidden="true">{item.char}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
