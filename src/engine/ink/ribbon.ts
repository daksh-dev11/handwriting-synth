import { K } from '../constants';
import { catmullRomToBeziers } from './catmullRom';
import { inkWidth } from './width';
import { clamp, cubicDerivative, cubicPoint, cubicSecondDerivative, dist, normalize } from '../mathUtil';
import type { CachedOutline, NormalizedGlyph, NormalizedStroke, PathCmd, PressureKnot, Pt } from '../types';

export interface RibbonSample {
  c: Pt;
  t: Pt;
  n: Pt;
  half: number;
}

interface DenseSample {
  p: Pt;
  s: number;
  seg: number;
  t: number;
}

function pressureAt(knots: readonly PressureKnot[], u: number): number {
  if (knots.length === 0) return 1;
  if (u <= knots[0].u) return knots[0].p;
  for (let i = 1; i < knots.length; i++) {
    if (u <= knots[i].u) {
      const k0 = knots[i - 1];
      const k1 = knots[i];
      if (k1.u - k0.u < 1e-9) return k1.p;
      const a = (u - k0.u) / (k1.u - k0.u);
      return k0.p + (k1.p - k0.p) * a;
    }
  }
  return knots[knots.length - 1].p;
}

function denseSamples(stroke: NormalizedStroke): DenseSample[] {
  const out: DenseSample[] = [];
  let cum = 0;
  for (let si = 0; si < stroke.segments.length; si++) {
    const seg = stroke.segments[si];
    const start = si === 0 ? 0 : 1;
    for (let k = start; k <= 32; k++) {
      const t = k / 32;
      const p = cubicPoint(seg, t);
      if (out.length > 0) cum += dist(p, out[out.length - 1].p);
      out.push({ p, s: cum, seg: si, t });
    }
  }
  return out;
}

function pushCubic(path: PathCmd[], p1: Pt, p2: Pt, p3: Pt): void {
  path.push({ op: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p3.x, y: p3.y });
}

export function ribbonOutlineFromSamples(samples: readonly RibbonSample[]): PathCmd[] {
  const path: PathCmd[] = [];
  if (samples.length === 0) return path;

  const left = samples.map((s) => ({ x: s.c.x + s.n.x * s.half, y: s.c.y + s.n.y * s.half }));
  const right = samples.map((s) => ({ x: s.c.x - s.n.x * s.half, y: s.c.y - s.n.y * s.half }));

  path.push({ op: 'M', x: left[0].x, y: left[0].y });

  for (const seg of catmullRomToBeziers(left)) pushCubic(path, seg.p1, seg.p2, seg.p3);

  const n = samples.length - 1;
  const kappa = K.KAPPA;
  const last = samples[n];
  const lastLeft = left[n];
  const lastRight = right[n];
  const rEnd = last.half;
  const apexEnd = { x: last.c.x + last.t.x * rEnd, y: last.c.y + last.t.y * rEnd };
  pushCubic(
    path,
    { x: lastLeft.x + kappa * rEnd * last.t.x, y: lastLeft.y + kappa * rEnd * last.t.y },
    { x: apexEnd.x + kappa * rEnd * last.n.x, y: apexEnd.y + kappa * rEnd * last.n.y },
    apexEnd,
  );
  pushCubic(
    path,
    { x: apexEnd.x - kappa * rEnd * last.n.x, y: apexEnd.y - kappa * rEnd * last.n.y },
    { x: lastRight.x + kappa * rEnd * last.t.x, y: lastRight.y + kappa * rEnd * last.t.y },
    lastRight,
  );

  const reversedRight = right.slice().reverse();
  for (const seg of catmullRomToBeziers(reversedRight)) pushCubic(path, seg.p1, seg.p2, seg.p3);

  const first = samples[0];
  const firstLeft = left[0];
  const firstRight = right[0];
  const rStart = first.half;
  const apexStart = { x: first.c.x - first.t.x * rStart, y: first.c.y - first.t.y * rStart };
  pushCubic(
    path,
    { x: firstRight.x - kappa * rStart * first.t.x, y: firstRight.y - kappa * rStart * first.t.y },
    { x: apexStart.x - kappa * rStart * first.n.x, y: apexStart.y - kappa * rStart * first.n.y },
    apexStart,
  );
  pushCubic(
    path,
    { x: apexStart.x + kappa * rStart * first.n.x, y: apexStart.y + kappa * rStart * first.n.y },
    { x: firstLeft.x - kappa * rStart * first.t.x, y: firstLeft.y - kappa * rStart * first.t.y },
    firstLeft,
  );

  path.push({ op: 'Z' });
  return path;
}

function ribbonSamples(stroke: NormalizedStroke, W: number, inkI: number, mult: number): RibbonSample[] {
  const dense = denseSamples(stroke);
  if (dense.length < 2) return [];
  const S = dense[dense.length - 1].s;

  const targets: number[] = [];
  if (S < 30) {
    targets.push(0, S / 2, S);
  } else {
    const step = K.OUTLINE_STEP;
    const nFull = Math.floor(S / step);
    for (let m = 0; m <= nFull; m++) targets.push(m * step);
    const lastS = targets[targets.length - 1];
    if (S - lastS >= 0.4 * step) targets.push(S);
    else targets[targets.length - 1] = S;
  }

  const out: RibbonSample[] = [];
  let cursor = 0;
  let prevT: Pt | null = null;

  for (let k = 0; k < targets.length; k++) {
    const s = targets[k];
    while (cursor < dense.length - 2 && dense[cursor + 1].s < s) cursor++;
    const a = dense[cursor];
    const b = dense[cursor + 1];
    const span = b.s - a.s;
    const alpha = span > 1e-12 ? (s - a.s) / span : 0;
    const c = { x: a.p.x + (b.p.x - a.p.x) * alpha, y: a.p.y + (b.p.y - a.p.y) * alpha };

    let segIndex = a.seg;
    let localT = a.t;
    if (b.seg === a.seg) {
      localT = a.t + (b.t - a.t) * alpha;
    } else {
      segIndex = b.seg;
      localT = b.t;
    }
    const seg = stroke.segments[segIndex];
    const v = cubicDerivative(seg, localT);
    const accel = cubicSecondDerivative(seg, localT);
    const speed = Math.hypot(v.x, v.y);

    let tv: Pt;
    if (speed < 1e-9) {
      if (prevT) {
        tv = prevT;
      } else {
        const next = dense[Math.min(cursor + 1, dense.length - 1)].p;
        tv = normalize({ x: next.x - c.x, y: next.y - c.y });
      }
    } else {
      tv = { x: v.x / speed, y: v.y / speed };
    }

    const nv = { x: tv.y, y: -tv.x };
    const u = S > 1e-12 ? s / S : 0;
    const p = clamp(pressureAt(stroke.pressure, u) * mult, 0, 1);
    let half = inkWidth(W, p, inkI) / 2;
    if (speed >= 1e-9) {
      const kappaC = (v.x * accel.y - v.y * accel.x) / (speed * speed * speed);
      if (Math.abs(kappaC) > 1e-6) half = Math.min(half, 0.9 / Math.abs(kappaC));
    }

    out.push({ c, t: tv, n: nv, half });
    prevT = tv;
  }
  return out;
}

function dotPath(center: Pt, half: number): PathCmd[] {
  const r = half;
  const k = K.KAPPA * r;
  const path: PathCmd[] = [];
  path.push({ op: 'M', x: center.x + r, y: center.y });
  pushCubic(path, { x: center.x + r, y: center.y + k }, { x: center.x + k, y: center.y + r }, { x: center.x, y: center.y + r });
  pushCubic(path, { x: center.x - k, y: center.y + r }, { x: center.x - r, y: center.y + k }, { x: center.x - r, y: center.y });
  pushCubic(path, { x: center.x - r, y: center.y - k }, { x: center.x - k, y: center.y - r }, { x: center.x, y: center.y - r });
  pushCubic(path, { x: center.x + k, y: center.y - r }, { x: center.x + r, y: center.y - k }, { x: center.x + r, y: center.y });
  path.push({ op: 'Z' });
  return path;
}

function strokeOutline(
  stroke: NormalizedStroke,
  W: number,
  inkI: number,
  mult: number,
): PathCmd[] {
  const dense = denseSamples(stroke);
  const S = dense.length > 0 ? dense[dense.length - 1].s : 0;

  if (stroke.isDot || S < 1e-6) {
    const center = stroke.segments[0] ? stroke.segments[0].p0 : { x: 0, y: 0 };
    const p = clamp(pressureAt(stroke.pressure, 0) * mult, 0, 1);
    return dotPath(center, inkWidth(W, p, inkI) / 2);
  }

  return ribbonOutlineFromSamples(ribbonSamples(stroke, W, inkI, mult));
}

export function boundsOf(path: readonly PathCmd[]): CachedOutline {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const cmd of path) {
    if (cmd.op === 'M') visit(cmd.x, cmd.y);
    else if (cmd.op === 'C') {
      visit(cmd.x1, cmd.y1);
      visit(cmd.x2, cmd.y2);
      visit(cmd.x, cmd.y);
    }
  }
  if (!Number.isFinite(minX)) {
    return { path: path.slice(), minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return { path: path.slice(), minX, minY, maxX, maxY };
}

export function ribbonPath(
  strokes: readonly NormalizedStroke[],
  W: number,
  inkI: number,
  pressureMultiplier: number,
): CachedOutline {
  const path: PathCmd[] = [];
  for (const stroke of strokes) {
    for (const cmd of strokeOutline(stroke, W, inkI, pressureMultiplier)) path.push(cmd);
  }
  return boundsOf(path);
}

export function glyphOutline(
  glyph: NormalizedGlyph,
  W: number,
  inkI: number,
  mult: number,
): CachedOutline {
  return ribbonPath(glyph.strokes, W, inkI, mult);
}