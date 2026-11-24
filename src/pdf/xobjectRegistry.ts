import { PDFDict, PDFName, PDFNumber, type PDFContext, type PDFRef } from 'pdf-lib';
import type { Placement } from '@engine';
import { InstanceCache } from '@engine';
import { pathToOps } from './pathOps';

export interface RegisteredXObject {
  name: string;
  ref: PDFRef;
  bytes: number;
}

export class XObjectRegistry {
  private readonly refs = new Map<string, RegisteredXObject>();
  private totalBytes = 0;

  constructor(
    private readonly context: PDFContext,
    private readonly xobjects: PDFDict,
    private readonly cache: InstanceCache,
  ) {}

  get size(): number {
    return this.refs.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  get(placement: Placement): RegisteredXObject {
    const key = `${placement.glyphId}|${placement.composite}|${placement.bucket}`;
    const existing = this.refs.get(key);
    if (existing) return existing;

    const outline = this.cache.outline(placement.glyphId, placement.composite, placement.bucket);
    const ops = `${pathToOps(outline.path, 1)} f`;
    const bbox = [
      Math.floor(outline.minX) - 1,
      Math.floor(outline.minY) - 1,
      Math.ceil(outline.maxX) + 1,
      Math.ceil(outline.maxY) + 1,
    ];
    const stream = this.context.flateStream(ops, {
      Type: 'XObject',
      Subtype: 'Form',
      FormType: 1,
      BBox: bbox.map((value) => PDFNumber.of(value)),
      Resources: PDFDict.withContext(this.context),
    });
    const ref = this.context.register(stream);
    const name = `G${this.refs.size + 1}`;
    this.xobjects.set(PDFName.of(name), ref);
    const registered = { name, ref, bytes: stream.getContentsSize() };
    this.refs.set(key, registered);
    this.totalBytes += registered.bytes;
    return registered;
  }
}
