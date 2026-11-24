import { InkPicker } from './InkPicker';
import { SizeControls } from './SizeControls';
import { StyleControls } from './StyleControls';
import { TemplateControls } from './TemplateControls';
import styles from './ControlRail.module.css';

export function ControlRail({ open }: { open: boolean }) {
  return (
    <aside className={[styles.rail, open ? styles.open : ''].filter(Boolean).join(' ')} aria-label="Writing controls">
      <StyleControls />
      <TemplateControls />
      <InkPicker />
      <SizeControls />
    </aside>
  );
}
