import { CH, K } from '../constants';
import { entryAnchor, exitAnchor, opticalProfiles } from '../normalize/n9Anchors';
import { fnv1a32, gauss, hash32 } from '../rng';
import type { CubicBezier, NormalizedGlyph, NormalizedStroke, Pt } from '../types';

function unit(v: Pt): Pt {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-12) return { x: 1, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

interface KnotOut {
  q: Pt;
  hIn: Pt | null;
  hOut: Pt | null;
}

function knotOut(instSeed: number, j: number, point: Pt, tangent: Pt, prev: Pt | null, next: Pt | null): KnotOut {
  const nx = K.PERTURB_SIGMA_KNOT * gauss(instSeed, j, CH.PERTURB);
  const ny = K.PERTURB_SIGMA_KNOT * gauss(instSeed, j, CH.PERTURB + 1);
  const mj = K.PERTURB_SIGMA_HANDLE * gauss(instSeed, j, CH.PERTURB + 2);
  const q: Pt = { x: point.x + nx, y: point.y + ny };
  let hIn: Pt | null = null;
  let hOut: Pt | null = null;
  if (prev) {
    const a = Math.hypot(prev.x - point.x, prev.y - point.y);
    const len = Math.max(K.HANDLE_MIN, a - mj);
    hIn = { x: q.x - len * tangent.x, y: q.y - len * tangent.y };
  }
  if (next) {
    const b = Math.hypot(next.x - point.x, next.y - point.y);
    const len = Math.max(K.HANDLE_MIN, b - mj);
    hOut = { x: q.x + len * tangent.x, y: q.y + len * tangent.y };
  }
  return { q, hIn, hOut };
}

function perturbStroke(stroke: NormalizedStroke, instSeed: number, startJ: number): { segments: CubicBezier[]; nextJ: number } {
  const segs = stroke.segments;
  if (segs.length === 0) return { segments: [], nextJ: startJ };

  if (stroke.isDot) {
    const p = segs[0].p0;
    const nx = K.PERTURB_SIGMA_KNOT * gauss(instSeed, startJ, CH.PERTURB);
    const ny = K.PERTURB_SIGMA_KNOT * gauss(instSeed, startJ, CH.PERTURB + 1);
    const q: Pt = { x: p.x + nx, y: p.y + ny };
    return { segments: [{ p0: { ...q }, p1: { ...q }, p2: { ...q }, p3: { ...q } }], nextJ: startJ + 1 };
  }

  const nSeg = segs.length;
  const points: Pt[] = [];
  for (let i = 0; i < nSeg; i++) points.push(segs[i].p0);
  points.push(segs[nSeg - 1].p3);

  const knots: KnotOut[] = [];
  for (let t = 0; t <= nSeg; t++) {
    const point = points[t];
    let tangent: Pt;
    if (t < nSeg) {
      const v = { x: segs[t].p1.x - point.x, y: segs[t].p1.y - point.y };
      tangent = Math.hypot(v.x, v.y) < 1e-9
        ? unit({ x: points[t + 1].x - point.x, y: points[t + 1].y - point.y })
        : unit(v);
    } else {
      tangent = unit({ x: point.x - segs[nSeg - 1].p2.x, y: point.y - segs[nSeg - 1].p2.y });
    }
    const prevHandle = t > 0 ? segs[t - 1].p2 : null;
    const nextHandle = t < nSeg ? segs[t].p1 : null;
    knots.push(knotOut(instSeed, startJ + t, point, tangent, prevHandle, nextHandle));
  }

  const out: CubicBezier[] = [];
  for (let i = 0; i < nSeg; i++) {
    const a = knots[i];
    const b = knots[i + 1];
    out.push({
      p0: a.q,
      p1: a.hOut ?? a.q,
      p2: b.hIn ?? b.q,
      p3: b.q,
    });
  }
  return { segments: out, nextJ: startJ + nSeg + 1 };
}

export function perturbInstance(base: NormalizedGlyph, seed: number, composite: number, m: number, W: number): NormalizedGlyph {
  if (m <= 0) return base;
  const instSeed = hash32(seed, fnv1a32(base.id), 0x3000 + composite);
  let j = 0;
  const strokes: NormalizedStroke[] = [];
  for (const stroke of base.strokes) {
    const r = perturbStroke(stroke, instSeed, j);
    j = r.nextJ;
    strokes.push({
      segments: r.segments,
      pressure: stroke.pressure.map((knot) => ({ u: knot.u, p: knot.p })),
      isDot: stroke.isDot,
    });
  }
  const entry = entryAnchor(strokes);
  const exit = exitAnchor(strokes);
  const profiles = opticalProfiles(strokes, W);
  return { ...base, strokes, entry, exit, leftProfile: profiles.leftProfile, rightProfile: profiles.rightProfile };
}