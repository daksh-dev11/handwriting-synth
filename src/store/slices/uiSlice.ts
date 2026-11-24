import type { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';

export interface Toast {
  id: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface UiSlice {
  mode: 'calibrate' | 'write';
  inspectorOpen: boolean;
  galleryOpen: boolean;
  toasts: Toast[];
  dismissedMissing: string[];
  dialog: null | 'pack' | 'confirm-demo' | 'confirm-import';
  persistenceAvailable: boolean;
  previewBusy: boolean;
  readOnly: boolean;
  setMode(mode: 'calibrate' | 'write'): void;
  toggleInspector(): void;
  toggleGallery(): void;
  pushToast(toast: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
  dismissMissing(chars: string[]): void;
  setDialog(dialog: UiSlice['dialog']): void;
  setPersistenceAvailable(available: boolean): void;
  setReadOnly(readOnly: boolean): void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => {
  let nextToastId = 0;
  return {
    mode: 'calibrate',
    inspectorOpen: false,
    galleryOpen: false,
    toasts: [],
    dismissedMissing: [],
    dialog: null,
    persistenceAvailable: true,
    previewBusy: false,
    readOnly: false,
    setMode: (mode) => {
      if (get().mode === mode) return;
      get().captureAbort?.();
      set({
        mode,
        draftStrokes: [],
        redoStack: [],
        draftState: 'idle',
        draftGuides: null,
      });
    },
    toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
    toggleGallery: () => set((state) => ({ galleryOpen: !state.galleryOpen })),
    pushToast: (toast) => {
      const id = ++nextToastId;
      set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    },
    dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
    dismissMissing: (chars) => set((state) => ({
      dismissedMissing: [...new Set([...state.dismissedMissing, ...chars])],
    })),
    setDialog: (dialog) => set({ dialog }),
    setPersistenceAvailable: (persistenceAvailable) => set({ persistenceAvailable }),
    setReadOnly: (readOnly) => set({ readOnly }),
  };
};
