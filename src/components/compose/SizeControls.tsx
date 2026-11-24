import { LIMITS } from '@engine';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Slider';
import { useAppStore } from '../../store/useAppStore';
import styles from './Controls.module.css';

export function SizeControls() {
  const xHeightPt = useAppStore((state) => state.xHeightPt);
  const maxPages = useAppStore((state) => state.maxPages);
  const setXHeightPt = useAppStore((state) => state.setXHeightPt);
  const setMaxPages = useAppStore((state) => state.setMaxPages);
  const readOnly = useAppStore((state) => state.readOnly);
  return (
    <section className={styles.group} aria-labelledby="size-heading">
      <h2 id="size-heading">Writing size</h2>
      <Slider
        label="Size"
        value={xHeightPt}
        min={6}
        max={10.5}
        step={0.5}
        formatValue={(value) => `${value.toFixed(1)} pt`}
        disabled={readOnly}
        onChange={setXHeightPt}
      />
      <div className={styles.pageLimit}>
        <span>Page limit</span>
        <Button
          variant="secondary"
          disabled={readOnly || maxPages <= 1}
          aria-label="Reduce page limit"
          onClick={() => setMaxPages(maxPages - 1)}
        >
          −
        </Button>
        <span className="num" aria-live="polite">{maxPages}</span>
        <Button
          variant="secondary"
          disabled={readOnly || maxPages >= LIMITS.MAX_PAGES}
          aria-label="Increase page limit"
          onClick={() => setMaxPages(maxPages + 1)}
        >
          +
        </Button>
      </div>
    </section>
  );
}
