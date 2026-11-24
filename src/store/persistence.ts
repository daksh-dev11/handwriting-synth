import { ENGINE_SPEC_REV, fnv1a32 } from '@engine';
import type { GlyphPack, RawGlyphSample, TemplateId, VarianceConfig } from '@engine';
import { get, getAll, put, tx } from './db';
import type { Db } from './db';

export interface PackCacheRecord {
  engineSpec: string;
  sourceFingerprint: string;
  pack: GlyphPack;
  savedAt: string;
}

export interface SessionMeta {
  nextSessionIndex: number;
  guideBaselinePx: number;
  guideXHeightPx: number;
  penWidthPx: number;
}

export interface SettingsMeta {
  variance: VarianceConfig;
  template: TemplateId;
  xHeightPt: number;
  inkRgb: [number, number, number];
  maxPages: number;
}

export interface ReplaceAllData {
  raw: RawGlyphSample[];
  pack: PackCacheRecord | null;
  session: SessionMeta;
}

function sampleKey(sample: RawGlyphSample): string {
  return `${sample.char}#${sample.variantIndex}`;
}

function pointCount(sample: RawGlyphSample): number {
  return sample.strokes.reduce((total, stroke) => total + stroke.length, 0);
}

export function computeFingerprint(raw: readonly RawGlyphSample[]): string {
  const manifest = raw
    .map((sample) => ({
      key: sampleKey(sample),
      sample,
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ key, sample }) => `${key}|${sample.sessionIndex}|${sample.capturedAt}|${pointCount(sample)}`)
    .join('\n');
  return fnv1a32(manifest).toString(16).padStart(8, '0');
}

export async function saveRawSample(db: Db, sample: RawGlyphSample, session: SessionMeta): Promise<void> {
  const key = sampleKey(sample);
  if (!db.idb) {
    db.mem.raw.set(key, sample);
    db.mem.meta.set('session', session);
    return;
  }
  await tx(db, ['raw', 'meta'], 'readwrite', (stores) => {
    stores.raw.put(sample, key);
    stores.meta.put(session, 'session');
  });
}

export async function loadAllRaw(db: Db): Promise<Array<[string, unknown]>> {
  return getAll<unknown>(db, 'raw');
}

export async function savePackCache(db: Db, record: PackCacheRecord): Promise<void> {
  await put(db, 'pack', 'current', record);
}

export async function loadPackCache(db: Db): Promise<unknown> {
  return get<unknown>(db, 'pack', 'current');
}

export async function replaceAll(db: Db, data: ReplaceAllData): Promise<void> {
  if (!db.idb) {
    const raw = new Map<string, unknown>();
    for (const sample of data.raw) raw.set(sampleKey(sample), sample);
    const pack = new Map<string, unknown>();
    if (data.pack) pack.set('current', data.pack);
    const meta = new Map(db.mem.meta);
    meta.set('session', data.session);
    db.mem.raw = raw;
    db.mem.pack = pack;
    db.mem.meta = meta;
    return;
  }

  await tx(db, ['raw', 'pack', 'meta'], 'readwrite', (stores) => {
    stores.raw.clear();
    stores.pack.clear();
    for (const sample of data.raw) stores.raw.put(sample, sampleKey(sample));
    if (data.pack) stores.pack.put(data.pack, 'current');
    stores.meta.put(data.session, 'session');
  });
}

export function createPackCacheRecord(
  sourceFingerprint: string,
  pack: GlyphPack,
  savedAt: string,
): PackCacheRecord {
  return { engineSpec: ENGINE_SPEC_REV, sourceFingerprint, pack, savedAt };
}
