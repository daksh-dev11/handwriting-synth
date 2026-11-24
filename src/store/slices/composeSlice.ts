import {
  DEFAULT_VARIANCE,
  LIMITS,
  TEMPLATE_SPECS,
  sanitizeSettings,
  sanitizeVariance,
} from '@engine';
import type { TemplateId, VarianceConfig } from '@engine';
import type { StateCreator } from 'zustand';
import type { AppState } from '../useAppStore';

export interface ComposeSlice {
  text: string;
  variance: VarianceConfig;
  template: TemplateId;
  xHeightPt: number;
  inkRgb: [number, number, number];
  maxPages: number;
  setText(text: string): void;
  setVariance(patch: Partial<VarianceConfig>): void;
  setTemplate(template: TemplateId): void;
  setXHeightPt(value: number): void;
  setInkRgb(color: [number, number, number]): void;
  setMaxPages(pages: number): void;
  rerollSeed(): void;
  resetVariance(): void;
  hydrateSettings(settings: {
    text: string;
    variance: VarianceConfig;
    template: TemplateId;
    xHeightPt: number;
    inkRgb: [number, number, number];
    maxPages: number;
  }): void;
}

const templateIds: readonly string[] = Object.keys(TEMPLATE_SPECS);

export const createComposeSlice: StateCreator<AppState, [], [], ComposeSlice> = (set, get) => ({
  text: '',
  variance: DEFAULT_VARIANCE,
  template: 'ruled',
  xHeightPt: 10,
  inkRgb: [0, 0, 0],
  maxPages: LIMITS.MAX_PAGES,
  setText: (text) => set({ text: text.slice(0, LIMITS.MAX_TEXT_CHARS) }),
  setVariance: (patch) => set((state) => ({
    variance: sanitizeVariance({ ...state.variance, ...patch }),
  })),
  setTemplate: (template) => {
    if (templateIds.includes(template)) set({ template });
  },
  setXHeightPt: (value) => set((state) => ({
    xHeightPt: sanitizeSettings({
      variance: state.variance,
      template: state.template,
      xHeightPt: value,
      inkRgb: state.inkRgb,
      maxPages: state.maxPages,
    }).xHeightPt,
  })),
  setInkRgb: (color) => set((state) => ({
    inkRgb: sanitizeSettings({
      variance: state.variance,
      template: state.template,
      xHeightPt: state.xHeightPt,
      inkRgb: color,
      maxPages: state.maxPages,
    }).inkRgb,
  })),
  setMaxPages: (pages) => set((state) => ({
    maxPages: sanitizeSettings({
      variance: state.variance,
      template: state.template,
      xHeightPt: state.xHeightPt,
      inkRgb: state.inkRgb,
      maxPages: pages,
    }).maxPages,
  })),
  rerollSeed: () => {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    if (seed === undefined) throw new Error('SEED_UNAVAILABLE');
    set((state) => ({ variance: { ...state.variance, seed } }));
  },
  resetVariance: () => {
    const seed = get().variance.seed;
    set({ variance: { ...DEFAULT_VARIANCE, seed } });
  },
  hydrateSettings: (settings) => set({
    text: settings.text.slice(0, LIMITS.MAX_TEXT_CHARS),
    variance: sanitizeVariance(settings.variance),
    template: settings.template,
    xHeightPt: settings.xHeightPt,
    inkRgb: settings.inkRgb,
    maxPages: settings.maxPages,
  }),
});
