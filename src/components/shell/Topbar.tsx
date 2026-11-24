import { useRef, useState } from 'react';
import { LIMITS } from '@engine';
import type { ImportOutcome } from '../../worker/protocol';
import { downloadBlob } from '../../store/download';
import { selectIsDemo, useAppStore } from '../../store/useAppStore';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusPill } from './StatusPill';
import styles from './Topbar.module.css';

function requestDemoLoad(): void {
  const state = useAppStore.getState();
  if (Object.keys(state.rawByKey).length > 0 && !selectIsDemo(state)) {
    state.setDialog('confirm-demo');
  } else {
    void state.loadDemo();
  }
}

function ImportMenu() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingPackOnly, setPendingPackOnly] = useState<ImportOutcome | null>(null);
  const readOnly = useAppStore((state) => state.readOnly);
  const dialog = useAppStore((state) => state.dialog);
  const setDialog = useAppStore((state) => state.setDialog);

  const importFile = async (file: File): Promise<void> => {
    if (file.size > LIMITS.MAX_FILE_BYTES) {
      useAppStore.getState().pushToast({ text: 'This file is too large to import.' });
      return;
    }
    const client = useAppStore.getState().client;
    if (!client) {
      useAppStore.getState().pushToast({ text: 'The app is not ready to import a hand.' });
      return;
    }
    const outcome = await client.importJson(await file.text());
    if (!outcome.ok) {
      useAppStore.getState().pushToast({
        text: `Couldn't import this hand: ${outcome.issues.map((issue) => issue.message).join('; ')}`,
      });
      return;
    }
    if (outcome.rawSamples === null) {
      setPendingPackOnly(outcome);
      setDialog('confirm-import');
      return;
    }
    await useAppStore.getState().applyImported(outcome.pack, outcome.rawSamples);
  };

  const exportFile = async (): Promise<void> => {
    const state = useAppStore.getState();
    if (!state.pack || !state.client) {
      state.pushToast({ text: 'There is no hand pack to export.' });
      return;
    }
    const rawSamples = state.importedNoRaw ? null : Object.values(state.rawByKey);
    const result = await state.client.exportJson(state.pack, rawSamples, new Date().toISOString());
    if (!result.ok) {
      state.pushToast({ text: `Couldn't export this hand: ${result.issues.map((issue) => issue.message).join('; ')}` });
      return;
    }
    downloadBlob(new Blob([result.value], { type: 'application/json' }), 'handwriting-glyphpack.json');
  };

  return (
    <>
      <input
        ref={fileInput}
        className={styles.fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="Choose a handwriting pack to import"
        disabled={readOnly}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void importFile(file).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'unknown failure';
            useAppStore.getState().pushToast({ text: `Couldn't import this hand: ${message}` });
          });
        }}
      />
      <details className={styles.menu} role="menu">
        <summary aria-label="Import, export, and more actions">
          <span className={styles.menuLabel}>Import / Export .json</span>
          <span className={styles.moreLabel} aria-hidden="true">…</span>
        </summary>
        <div className={styles.menuItems}>
          <button
            type="button"
            role="menuitem"
            className={styles.mobileDemo}
            disabled={readOnly}
            onClick={requestDemoLoad}
          >
            Load Demo Hand
          </button>
          <button type="button" role="menuitem" disabled={readOnly} onClick={() => fileInput.current?.click()}>
            Import hand…
          </button>
          <button type="button" role="menuitem" onClick={() => {
            void exportFile().catch((error: unknown) => {
              const message = error instanceof Error ? error.message : 'unknown failure';
              useAppStore.getState().pushToast({ text: `Couldn't export this hand: ${message}` });
            });
          }}>
            Export hand…
          </button>
        </div>
      </details>
      {dialog === 'confirm-import' && pendingPackOnly?.ok && (
        <ConfirmDialog
          open
          title="Import a pack without raw samples?"
          confirmLabel="Import anyway"
          onCancel={() => {
            setPendingPackOnly(null);
            setDialog(null);
          }}
          onConfirm={() => {
            const pending = pendingPackOnly;
            setPendingPackOnly(null);
            setDialog(null);
            if (pending?.ok) void useAppStore.getState().applyImported(pending.pack, null);
          }}
        >
          This file may be corrupted. The imported pack cannot be rebuilt from drawings.
        </ConfirmDialog>
      )}
    </>
  );
}

export function Topbar() {
  const mode = useAppStore((state) => state.mode);
  const readOnly = useAppStore((state) => state.readOnly);
  const setMode = useAppStore((state) => state.setMode);

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <strong>Handwriting</strong>
        <span className={styles.divider} aria-hidden="true" />
      </div>
      <Segmented
        className={styles.mode}
        label="Application mode"
        options={[
          { value: 'calibrate', label: '1. Calibrate Hand' },
          { value: 'write', label: '2. Write & Export' },
        ]}
        value={mode}
        onChange={(value) => setMode(value === 'calibrate' ? 'calibrate' : 'write')}
        ariaKeyShortcuts="Meta+Shift+1 Control+Shift+1 Meta+Shift+2 Control+Shift+2"
      />
      <StatusPill />
      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={readOnly}
          disabledReason="This hand is open in another tab."
          onClick={requestDemoLoad}
        >
          Load Demo Hand
        </Button>
        <ImportMenu />
      </div>
    </header>
  );
}
