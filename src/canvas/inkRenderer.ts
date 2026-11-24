import { DEFAULT_VARIANCE, glyphOutline } from '@engine';
import type { NormalizedGlyph, PathCmd, Pt } from '@engine';

export interface ThumbBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function toPath2D(commands: readonly PathCmd[]): Path2D {
  const path = new Path2D();
  for (const command of commands) {
    if (command.op === 'M') path.moveTo(command.x, command.y);
    else if (command.op === 'C') {
      path.bezierCurveTo(command.x1, command.y1, command.x2, command.y2, command.x, command.y);
    } else {
      path.closePath();
    }
  }
  return path;
}

export class Path2DMemo {
  private readonly paths = new Map<string, Path2D>();

  get(key: string, make: () => PathCmd[]): Path2D {
    const cached = this.paths.get(key);
    if (cached) return cached;
    const path = toPath2D(make());
    this.paths.set(key, path);
    return path;
  }

  clear(): void {
    this.paths.clear();
  }

  retainInk(inkQ: number): void {
    for (const key of this.paths.keys()) {
      const separator = key.lastIndexOf('|');
      if (separator < 0) continue;
      const suffix = key.slice(separator + 1);
      if (/^-?\d+$/.test(suffix) && Number(suffix) !== inkQ) this.paths.delete(key);
    }
  }
}

export function drawGlyphThumb(
  context: CanvasRenderingContext2D,
  glyph: NormalizedGlyph,
  W: number,
  inkRgb: [number, number, number],
  box: ThumbBox,
): void {
  const outline = glyphOutline(glyph, W, DEFAULT_VARIANCE.inkPressure, 1);
  const glyphWidth = Math.max(glyph.bbox.maxX - glyph.bbox.minX, 1);
  const glyphHeight = Math.max(glyph.bbox.maxY - glyph.bbox.minY, 1);
  const scale = Math.min(box.width / glyphWidth, box.height / glyphHeight);
  const offset: Pt = {
    x: box.x + (box.width - glyphWidth * scale) / 2 - glyph.bbox.minX * scale,
    y: box.y + (box.height - glyphHeight * scale) / 2 - glyph.bbox.minY * scale,
  };

  context.save();
  context.setTransform(scale, 0, 0, scale, offset.x, offset.y);
  context.fillStyle = `rgb(${inkRgb.map((component) => Math.round(component * 255)).join(' ')})`;
  context.fill(toPath2D(outline.path), 'nonzero');
  context.restore();
}
