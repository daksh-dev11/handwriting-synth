import { useAppStore } from '../../store/useAppStore';
import { ControlRail } from './ControlRail';
import { PagePreview } from './PagePreview';
import { TextEditor } from './TextEditor';
import styles from './ComposeScreen.module.css';

export function ComposeScreen() {
  const inspectorOpen = useAppStore((state) => state.inspectorOpen);
  return (
    <section className={[styles.screen, inspectorOpen ? styles.withRail : ''].filter(Boolean).join(' ')} aria-label="Writing and export workspace">
      <TextEditor />
      <PagePreview />
      <ControlRail open={inspectorOpen} />
    </section>
  );
}
