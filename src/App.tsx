import { Component, useEffect } from 'react';
import type { ReactNode } from 'react';
import { WorkerClient } from './worker/client';
import { boot, disposeBoot } from './store/boot';
import { useAppStore } from './store/useAppStore';
import { Topbar } from './components/shell/Topbar';
import { Workspace } from './components/shell/Workspace';
import { Banner } from './components/shell/Banner';
import { ToastHost } from './components/shell/ToastHost';
import { ConfirmDialog } from './components/shell/ConfirmDialog';
import styles from './App.module.css';

interface BoundaryState {
  failed: boolean;
}

class AppBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className={styles.errorPage}>
          <section className={styles.errorCard} role="alert">
            <h1>Something went wrong</h1>
            <p>Your drawings are safe in this browser.</p>
            <button type="button" onClick={() => window.location.reload()}>Reload</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.matches('input, textarea, select') || target.isContentEditable);
}

function useKeyboardShortcuts(): void {
  const mode = useAppStore((state) => state.mode);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      const state = useAppStore.getState();
      const modified = event.metaKey || event.ctrlKey || event.altKey;
      const editable = isEditableTarget(event.target);
      if (editable && !modified) return;
      const target = event.target instanceof Element ? event.target : null;
      const inControl = Boolean(target?.closest('[role="grid"], [role="radiogroup"], [role="menu"], [role="dialog"]'));

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'Digit1') {
        event.preventDefault();
        state.setMode('calibrate');
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'Digit2') {
        event.preventDefault();
        state.setMode('write');
        return;
      }
      if (mode === 'write') {
        if ((event.metaKey || event.ctrlKey) && event.code === 'Enter') {
          event.preventDefault();
          void state.startExport();
        } else if ((event.metaKey || event.ctrlKey) && event.code === 'Backslash') {
          event.preventDefault();
          state.toggleInspector();
        } else if (event.altKey && event.code === 'KeyR') {
          event.preventDefault();
          state.rerollSeed();
        }
        return;
      }

      if (!modified && inControl) return;
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) state.redoStroke();
        else state.undoStroke();
      } else if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        void state.commitDraft();
      } else if (event.code === 'Backspace') {
        event.preventDefault();
        state.undoStroke();
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        state.next();
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        state.prev();
      } else if (event.code === 'Escape') {
        event.preventDefault();
        state.clearDraft();
      } else if (event.code === 'KeyG') {
        event.preventDefault();
        state.toggleGallery();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mode]);
}

export default function App() {
  const mode = useAppStore((state) => state.mode);
  const persistenceAvailable = useAppStore((state) => state.persistenceAvailable);
  const readOnly = useAppStore((state) => state.readOnly);
  const toasts = useAppStore((state) => state.toasts);
  const dialog = useAppStore((state) => state.dialog);
  const setDialog = useAppStore((state) => state.setDialog);
  const dismissToast = useAppStore((state) => state.dismissToast);

  useKeyboardShortcuts();

  useEffect(() => {
    const client = new WorkerClient();
    useAppStore.getState().setDemoLoader(() => import('./demo/demoHand'));
    void boot(client).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown failure';
      useAppStore.getState().pushToast({ text: `Couldn't start the app: ${message}` });
    });
    return () => {
      disposeBoot();
      client.dispose();
      useAppStore.getState().setClient(null);
      useAppStore.getState().setCaptureAbort(null);
    };
  }, []);

  return (
    <AppBoundary>
      <div className={styles.app}>
        <Topbar />
        {(!persistenceAvailable || readOnly) && (
          <div className={styles.bannerSlot}>
            {readOnly ? (
              <Banner title="This hand is open in another tab.">
                Capture, demo loading, and importing are disabled here.
              </Banner>
            ) : (
              <Banner title="Changes won't be saved in this browser session.">
                Export a .json to keep your hand.
              </Banner>
            )}
          </div>
        )}
        <Workspace mode={mode} />
        <ToastHost
          toasts={toasts.map((toast) => ({
            id: String(toast.id),
            text: toast.text,
            action: toast.actionLabel && toast.onAction
              ? { label: toast.actionLabel, onClick: toast.onAction }
              : undefined,
          }))}
          onDismiss={(id) => dismissToast(Number(id))}
        />
        <ConfirmDialog
          open={dialog === 'confirm-demo'}
          title="Replace this hand with the demo?"
          confirmLabel="Load demo hand"
          onConfirm={() => {
            setDialog(null);
            void useAppStore.getState().loadDemo();
          }}
          onCancel={() => setDialog(null)}
        >
          Your current drawings will be replaced. You can draw them again later.
        </ConfirmDialog>
      </div>
    </AppBoundary>
  );
}
