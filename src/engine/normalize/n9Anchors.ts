import { EM, K } from '../constants';
import { cubicPoint, dist } from '../mathUtil';
import type { Anchor, NormalizedStroke, Pt } from '../types';

function tangentAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt): number {
  let dx = p1.x - p0.x;
  let dy = p1.y - p0.y;
  if (Math.hypot(dx, dy) < 1e-6) {
    dx = p2.x - p0.x;
    dy = p2.y - p0.y;
  }
  if (Math.hypot(dx, dy) < 1e-6) {
    dx = p3.x - p0.x;
    dy = p3.y - p0.y;
  }
  if (Math.hypot(dx, dy) < 1e-6) return 0;
  return Math.atan2(dy, dx);
}

function exitTangent(p0: Pt, p1: Pt, p2: Pt, p3: Pt): number {
  let dx = p3.x - p2.x;
  let dy = p3.y - p2.y;
  if (Math.hypot(dx, dy) < 1e-6) {
    dx = p3.x - p1.x;
    dy = p3.y - p1.y;
  }
  if (Math.hypot(dx, dy) < 1e-6) {
    dx = p3.x - p0.x;
    dy = p3.y - p0.y;
  }
  if (Math.hypot(dx, dy) < 1e-6) return 0;
  return Math.atan2(dy, dx);
}

export function entryAnchor(strokes: readonly NormalizedStroke[]): Anchor {
  if (strokes.length === 0) return { x: 0, y: EM.baselineY, tangentRad: 0 };
  const seg = strokes[0].segments[0];
  return { x: seg.p0.x, y: seg.p0.y, tangentRad: tangentAt(seg.p0, seg.p1, seg.p2, seg.p3) };
}

export function exitAnchor(strokes: readonly NormalizedStroke[]): Anchor {
  if (strokes.length === 0) return { x: 0, y: EM.baselineY, tangentRad: 0 };
  const stroke = strokes[strokes.length - 1];
  const seg = stroke.segments[stroke.segments.length - 1];
  return { x: seg.p3.x, y: seg.p3.y, tangentRad: exitTangent(seg.p0, seg.p1, seg.p2, seg.p3) };
}

function centerlineSamples(stroke: NormalizedStroke): Pt[] {
  const out: Pt[] = [];
  if (stroke.isDot || stroke.segments.length === 0) {
    const first = stroke.segments[0];
    return first ? [{ x: first.p0.x, y: first.p0.y }] : [];
  }

  const dense: Pt[] = [];
  for (let si = 0; si < stroke.segments.length; si++) {
    const seg = stroke.segments[si];
    const start = si === 0 ? 0 : 1;
    for (let k = start; k <= 16; k++) dense.push(cubicPoint(seg, k / 16));
  }
  if (dense.length === 0) return out;

  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < dense.length; i++) {
    total += dist(dense[i], dense[i - 1]);
    cum.push(total);
  }
  if (total < 1e-6) return [{ x: dense[0].x, y: dense[0].y }];

  const step = 4;
  const targets: number[] = [];
  const nFull = Math.floor(total / step);
  for (let m = 0; m <= nFull; m++) targets.push(m * step);
  if (total - targets[targets.length - 1] > 1e-9) targets.push(total);

  let seg = 0;
  for (const s of targets) {
    while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
    const span = cum[seg + 1] - cum[seg];
    const alpha = span > 1e-12 ? (s - cum[seg]) / span : 0;
    out.push({
      x: dense[seg].x + (dense[seg + 1].x - dense[seg].x) * alpha,
      y: dense[seg].y + (dense[seg + 1].y - dense[seg].y) * alpha,
    });
  }
  return out;
}

export function opticalProfiles(
  strokes: readonly NormalizedStroke[],
  W: number,
): { leftProfile: (number | null)[]; rightProfile: (number | null)[] } {
  const rows = K.PROFILE_ROWS;
  const rowStep = (EM.descenderY - EM.ascenderY) / rows;
  const left: (number | null)[] = new Array<number | null>(rows).fill(null);
  const right: (number | null)[] = new Array<number | null>(rows).fill(null);
  const radius = W / 2;

  for (const stroke of strokes) {
    const samples = centerlineSamples(stroke);
    for (const c of samples) {
      for (let j = 0; j < rows; j++) {
        const yj = EM.ascenderY + (j + 0.5) * rowStep;
        const dy = yj - c.y;
        if (Math.abs(dy) > radius) continue;
        const halfChord = Math.sqrt(Math.max(0, radius * radius - dy * dy));
        const lx = c.x - halfChord;
        const rx = c.x + halfChord;
        const prevL = left[j];
        const prevR = right[j];
        left[j] = prevL === null ? lx : Math.min(prevL, lx);
        right[j] = prevR === null ? rx : Math.max(prevR, rx);
      }
    }
  }
  return { leftProfile: left, rightProfile: right };
}