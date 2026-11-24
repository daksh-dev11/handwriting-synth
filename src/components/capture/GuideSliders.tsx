import { computeGuides } from '@engine';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Popover } from '../ui/Popover';
import { Slider } from '../ui/Slider';
import { useAppStore } from '../../store/useAppStore';
import styles from './GuideSliders.module.css';

export function GuideSliders() {
  const baseline = useAppStore((state) => state.guideBaselinePx);
  const xHeight = useAppStore((state) => state.guideXHeightPx);
  const penWidth = useAppStore((state) => state.penWidthPx);
  const hasDraft = useAppStore((state) => state.draftStrokes.length > 0 || state.draftState === 'drawing');
  const readOnly = useAppStore((state) => state.readOnly);
  const setGuides = useAppStore((state) => state.setGuides);
  const setPenWidth = useAppStore((state) => state.setPenWidth);
  const disabled = hasDraft || readOnly;
  const baselineMin = Math.ceil(2 * xHeight + 10);
  const baselineMax = Math.floor(470 - (2 / 3) * xHeight);

  return (
    <Popover
      label="Guide calibration"
      className={styles.popover}
      trigger={<><Icon name="ruler" /> Guides</>}
    >
      <div className={styles.panel}>
        <h2>Guide calibration</h2>
        <Slider
          label="Size"
          value={xHeight}
          min={60}
          max={160}
          step={2}
          formatValue={(value) => `${value} px`}
          disabled={disabled}
          disabledReason={hasDraft ? 'Accept or clear this glyph first.' : undefined}
          onChange={(value) => setGuides(baseline, value)}
        />
        <Slider
          label="Baseline"
          value={baseline}
          min={baselineMin}
          max={baselineMax}
          formatValue={(value) => `${value} px`}
          disabled={disabled}
          disabledReason={hasDraft ? 'Accept or clear this glyph first.' : undefined}
          onChange={(value) => setGuides(value, xHeight)}
        />
        <Slider
          label="Pen"
          value={penWidth}
          min={6}
          max={32}
          formatValue={(value) => `${value} px`}
          disabled={disabled}
          disabledReason={hasDraft ? 'Accept or clear this glyph first.' : undefined}
          onChange={setPenWidth}
        />
        <div className={styles.footer}>
          <span>Changes apply to glyphs you draw next.</span>
          <Button
            variant="ghost"
            disabled={disabled}
            disabledReason={hasDraft ? 'Accept or clear this glyph first.' : undefined}
            onClick={() => {
              const defaults = computeGuides(340, 120);
              setGuides(defaults.baselineY, defaults.baselineY - defaults.xHeightY);
              setPenWidth(16);
            }}
          >
            Reset
          </Button>
        </div>
      </div>
    </Popover>
  );
}
