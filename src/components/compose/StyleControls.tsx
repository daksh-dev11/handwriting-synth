import { LIMITS } from '@engine';
import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { Slider } from '../ui/Slider';
import { useAppStore } from '../../store/useAppStore';
import styles from './Controls.module.css';

export function StyleControls() {
  const variance = useAppStore((state) => state.variance);
  const setVariance = useAppStore((state) => state.setVariance);
  const resetVariance = useAppStore((state) => state.resetVariance);
  const rerollSeed = useAppStore((state) => state.rerollSeed);
  const readOnly = useAppStore((state) => state.readOnly);
  const [seedDraft, setSeedDraft] = useState(String(variance.seed));

  useEffect(() => setSeedDraft(String(variance.seed)), [variance.seed]);

  const setUnit = (key: 'slantJitter' | 'baselineDrift' | 'spacingVariance' | 'inkPressure', value: number): void => {
    setVariance({ [key]: value });
  };

  return (
    <section className={styles.group} aria-labelledby="style-controls-heading">
      <h2 id="style-controls-heading">Writing style</h2>
      <Slider label="Slant jitter" value={variance.slantJitter} min={0} max={1} step={0.01} formatValue={(value) => value.toFixed(2)} disabled={readOnly} onChange={(value) => setUnit('slantJitter', value)} />
      <Slider label="Baseline drift" value={variance.baselineDrift} min={0} max={1} step={0.01} formatValue={(value) => value.toFixed(2)} disabled={readOnly} onChange={(value) => setUnit('baselineDrift', value)} />
      <Slider label="Spacing" value={variance.spacingVariance} min={0} max={1} step={0.01} formatValue={(value) => value.toFixed(2)} disabled={readOnly} onChange={(value) => setUnit('spacingVariance', value)} />
      <Slider label="Ink pressure" value={variance.inkPressure} min={0} max={1} step={0.01} formatValue={(value) => value.toFixed(2)} disabled={readOnly} onChange={(value) => setUnit('inkPressure', value)} />
      <Slider label="Variants per glyph" value={variance.poolSize} min={1} max={LIMITS.MAX_POOL_SIZE} step={1} disabled={readOnly} onChange={(value) => setVariance({ poolSize: value })} />
      <p className={styles.helper}>Lower values make smaller PDFs.</p>
      <div className={readOnly ? styles.locked : ''} aria-disabled={readOnly}>
        <Segmented
          label="Style"
          options={[
            { value: 'print', label: 'Print' },
            { value: 'semi-cursive', label: 'Semi-cursive' },
          ]}
          value={variance.mode}
          onChange={(value) => {
            if (!readOnly) setVariance({ mode: value === 'semi-cursive' ? 'semi-cursive' : 'print' });
          }}
        />
      </div>
      <div className={styles.seedRow}>
        <label htmlFor="variance-seed">Seed</label>
        <input
          id="variance-seed"
          type="number"
          inputMode="numeric"
          min={0}
          max={4294967295}
          value={seedDraft}
          disabled={readOnly}
          onChange={(event) => {
            const draft = event.currentTarget.value;
            setSeedDraft(draft);
            const value = Number(draft);
            if (Number.isInteger(value) && value >= 0 && value <= 4294967295) setVariance({ seed: value });
          }}
          onBlur={(event) => {
            const value = Number(event.currentTarget.value);
            if (!Number.isInteger(value) || value < 0 || value > 4294967295) {
              setSeedDraft(String(variance.seed));
            }
          }}
        />
        <Button variant="secondary" disabled={readOnly} onClick={rerollSeed} aria-keyshortcuts="Alt+R">
          Re-roll
        </Button>
      </div>
      <Button variant="ghost" disabled={readOnly} onClick={resetVariance}>Reset to defaults</Button>
    </section>
  );
}
