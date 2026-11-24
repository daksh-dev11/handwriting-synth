import type { ReactNode } from 'react';
import type { AppState } from '../../store/useAppStore';
import { CaptureScreen } from '../capture/CaptureScreen';
import { ComposeScreen } from '../compose/ComposeScreen';
import styles from './Workspace.module.css';

interface WorkspaceProps {
  mode: AppState['mode'];
}

export function Workspace({ mode }: WorkspaceProps) {
  const content: ReactNode = mode === 'calibrate' ? <CaptureScreen /> : <ComposeScreen />;
  return (
    <main className={styles.workspace}>
      <div key={mode} className={styles.view}>{content}</div>
    </main>
  );
}
