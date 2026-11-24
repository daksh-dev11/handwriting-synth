import type { CSSProperties } from 'react';
import { useAppStore } from '../../store/useAppStore';
import styles from './Controls.module.css';

const inks: readonly { label: string; hex: string; rgb: [number, number, number] }[] = [
  { label: 'Fountain Blue', hex: '#1B56DB', rgb: [0.106, 0.337, 0.859] },
  { label: 'Carbon Black', hex: '#000000', rgb: [0, 0, 0] },
  { label: 'Graphite', hex: '#4A4744', rgb: [0.29, 0.278, 0.267] },
];

export function InkPicker() {
  const inkRgb = useAppStore((state) => state.inkRgb);
  const setInkRgb = useAppStore((state) => state.setInkRgb);
  const readOnly = useAppStore((state) => state.readOnly);
  const selected = (rgb: [number, number, number]): boolean =>
    rgb.every((component, index) => component === inkRgb[index]);

  return (
    <section className={styles.group} aria-labelledby="ink-heading">
      <h2 id="ink-heading">Ink</h2>
      <div className={styles.inks}>
        {inks.map((ink) => (
          <button
            key={ink.label}
            type="button"
            className={[styles.inkChoice, selected(ink.rgb) ? styles.inkSelected : ''].filter(Boolean).join(' ')}
            style={{ '--swatch': ink.hex } as CSSProperties & { '--swatch': string }}
            aria-label={ink.label}
            aria-pressed={selected(ink.rgb)}
            title={ink.label}
            disabled={readOnly}
            onClick={() => setInkRgb(ink.rgb)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
