import { CH, K } from '../constants';
import { LIMITS } from '../limits';
import { clamp } from '../mathUtil';
import { gauss } from '../rng';
import { pressureTerms, deltaVar, deltaYGlyph, deltaYLine, deltaYWord, slantTerms, softClamp } from '../variance/perVariance';
import { opticalKernDelta, profileRowWeights } from '../variance/kerning';
import { createVariantHistory, resetParagraphHistory, selectVariant } from '../variance/variants';
import { ligatureCompatible, ligatureCubic, ligatureGap } from '../variance/ligature';
import { rotatedLocal } from '../variance/placement';
import { InstanceCache } from './instanceCache';
import { tokenizeText } from './text';
import type { WordToken } from './text';
import type {
  GlyphPack,
  LayoutGeometry,
  LayoutResult,
  LigatureCubic,
  NormalizedGlyph,
  Placement,
  Pt,
  VarianceConfig,
} from '../types';

const ROW_WEIGHTS = profileRowWeights();

interface Selected {
  k: number;
  glyphId: string | null;
  composite: number;
  bucket: 0 | 1 | 2;
  thetaRad: number;
  dyG: number;
  dyWord: number;
  letter: boolean;
}

interface PrevGlyph {
  originX: number;
  dy: number;
  thetaRad: number;
  advance: number;
  exit: Pt;
  exitTangent: number;
  rightProfile: (number | null)[];
  lastPressure: number;
  letter: boolean;
}

function isLetter(inst: NormalizedGlyph): boolean {
  return inst.glyphClass === 'x' || inst.glyphClass === 'ascender' || inst.glyphClass === 'descender' || inst.glyphClass === 'cap';
}

function firstPressure(inst: NormalizedGlyph): number {
  const stroke = inst.strokes[0];
  return stroke ? stroke.pressure[0].p : 1;
}

function lastPressure(inst: NormalizedGlyph): number {
  const stroke = inst.strokes[inst.strokes.length - 1];
  return stroke ? stroke.pressure[stroke.pressure.length - 1].p : 1;
}

export function* layoutTextSteps(
  text: string,
  pack: GlyphPack,
  cfg: VarianceConfig,
  geom: LayoutGeometry,
  cache: InstanceCache,
): Generator<{ consumedChars: number }, LayoutResult, void> {
  if (!cache.matches(pack, cfg)) throw new RangeError('CACHE_CFG_MISMATCH');

  const seed = cfg.seed;
  const sTheta = clamp(cfg.slantJitter, 0, 1);
  const sY = clamp(cfg.baselineDrift, 0, 1);
  const sS = clamp(cfg.spacingVariance, 0, 1);
  const sP = clamp(cfg.inkPressure, 0, 1);
  const pool = Math.max(1, Math.min(LIMITS.MAX_POOL_SIZE, Math.floor(cfg.poolSize)));
  const lineWidth = geom.lineWidthEm;
  const linesPerPage = Math.max(1, Math.floor(geom.linesPerPage));
  const maxPages = Math.max(1, Math.floor(geom.maxPages));
  const maxLine = maxPages * linesPerPage;
  const semiCursive = cfg.mode === 'semi-cursive';

  const has = (c: string): boolean => {
    const list = pack.glyphs[c];
    return list !== undefined && list.length > 0;
  };

  const history = createVariantHistory();
  const placements: Placement[] = [];
  const missingChars: number[] = [];

  let x = 0;
  let line = 0;
  let wordIndex = 0;
  let prev: PrevGlyph | null = null;
  let truncated = false;
  let consumedChars = 0;
  let sinceYield = 0;

  const wrap = (): boolean => {
    if (line + 1 >= maxLine) {
      truncated = true;
      return false;
    }
    line += 1;
    x = 0;
    prev = null;
    return true;
  };

  const selectWord = (tok: WordToken): Selected[] =>
    tok.chars.map((ch, j) => {
      const k = tok.ks[j];
      const list = pack.glyphs[ch];
      if (!list || list.length === 0) {
        return { k, glyphId: null, composite: 0, bucket: 1 as 0 | 1 | 2, thetaRad: 0, dyG: 0, dyWord: 0, letter: false };
      }
      const composite = selectVariant(seed, k, ch, list.length, pool, history);
      const variant = Math.floor(composite / pool);
      const inst = cache.instance(`${ch}#${variant}`, composite);
      const { bucket } = pressureTerms(seed, k, sP);
      const { thetaRad } = slantTerms(seed, k, sTheta);
      const dyG = deltaYGlyph(seed, k, sY);
      const dyWord = deltaYWord(seed, wordIndex, sY);
      return { k, glyphId: `${ch}#${variant}`, composite, bucket, thetaRad, dyG, dyWord, letter: isLetter(inst) };
    });

  const wordOverflows = (sel: Selected[]): boolean => {
    let simX = x;
    for (const g of sel) {
      if (g.glyphId === null) {
        simX += 0.6 * K.WORD_SPACE;
        continue;
      }
      const adv = cache.instance(g.glyphId, g.composite).advance;
      if (simX > 0 && simX + adv > lineWidth) return true;
      simX += adv;
    }
    return false;
  };

  const printOrigin = (g: Selected, inst: NormalizedGlyph, prevRef: PrevGlyph | null): number => {
    if (!prevRef) return x;
    const dOpt = opticalKernDelta(prevRef.advance, prevRef.rightProfile, inst.leftProfile, ROW_WEIGHTS);
    const dVar = deltaVar(seed, g.k, sS);
    return prevRef.originX + prevRef.advance + dOpt + dVar;
  };

  const placeGlyph = (g: Selected, glyphId: string, inst: NormalizedGlyph, prevRef: PrevGlyph | null): { placement: Placement; prev: PrevGlyph } => {
    const pivX = (inst.bbox.minX + inst.bbox.maxX) / 2;
    let originX: number;
    let dy: number;
    let lig: LigatureCubic | null = null;

    const canLig = semiCursive && prevRef !== null && prevRef.letter && g.letter;
    if (canLig && prevRef) {
      const gLig = ligatureGap(seed, g.k, sS);
      const entryLocal = rotatedLocal(inst.entry, g.thetaRad, pivX);
      const xLig = prevRef.exit.x + gLig - entryLocal.x;
      const dyLig = softClamp(g.dyG + deltaYLine(seed, xLig, line, sY) + g.dyWord);
      const s: Pt = { x: prevRef.exit.x + gLig, y: dyLig + entryLocal.y };
      const phiA = prevRef.exitTangent;
      const psiB = inst.entry.tangentRad + g.thetaRad;
      if (ligatureCompatible(prevRef.exit, phiA, s, psiB)) {
        originX = xLig;
        dy = dyLig;
        lig = ligatureCubic(prevRef.exit, phiA, s, psiB, prevRef.lastPressure, firstPressure(inst));
      } else {
        originX = printOrigin(g, inst, prevRef);
        dy = softClamp(g.dyG + deltaYLine(seed, originX, line, sY) + g.dyWord);
      }
    } else {
      originX = printOrigin(g, inst, prevRef);
      dy = softClamp(g.dyG + deltaYLine(seed, originX, line, sY) + g.dyWord);
    }

    const placement: Placement = {
      k: g.k,
      line,
      glyphId,
      composite: g.composite,
      bucket: g.bucket,
      originX,
      dy,
      thetaRad: g.thetaRad,
      pivX,
      ligatureFromPrev: lig,
    };

    const exitLocal = rotatedLocal(inst.exit, g.thetaRad, pivX);
    const next: PrevGlyph = {
      originX,
      dy,
      thetaRad: g.thetaRad,
      advance: inst.advance,
      exit: { x: originX + exitLocal.x, y: dy + exitLocal.y },
      exitTangent: inst.exit.tangentRad + g.thetaRad,
      rightProfile: inst.rightProfile,
      lastPressure: lastPressure(inst),
      letter: g.letter,
    };
    return { placement, prev: next };
  };

  const tokens = tokenizeText(text, has);
  let stopped = false;

  for (const tok of tokens) {
    if (tok.kind === 'newline') {
      if (tok.paragraph) {
        resetParagraphHistory(history);
        wordIndex = 0;
      }
      if (!wrap()) {
        consumedChars = tok.end;
        stopped = true;
        break;
      }
      consumedChars = tok.end;
      if (tok.paragraph) yield { consumedChars };
      continue;
    }

    if (tok.kind === 'space') {
      if (tok.tab) {
        x += 4 * K.WORD_SPACE;
      } else {
        x += K.WORD_SPACE * (1 + K.WORD_SPACE_VAR * sS * clamp(gauss(seed, tok.k, CH.SPACE), -2, 2));
      }
      prev = null;
      consumedChars = tok.end;
      continue;
    }

    const sel = selectWord(tok);
    if (x > 0 && wordOverflows(sel)) {
      if (!wrap()) {
        consumedChars = tok.end;
        stopped = true;
        break;
      }
    }

    for (let j = 0; j < sel.length; j++) {
      const g = sel[j];
      if (g.glyphId === null) {
        missingChars.push(g.k);
        x += 0.6 * K.WORD_SPACE;
        prev = null;
        continue;
      }
      const inst = cache.instance(g.glyphId, g.composite);
      if (x > 0 && x + inst.advance > lineWidth) {
        if (!wrap()) {
          consumedChars = tok.end;
          stopped = true;
          break;
        }
      }
      const placed = placeGlyph(g, g.glyphId, inst, prev);
      placements.push(placed.placement);
      x = placed.placement.originX + inst.advance;
      prev = placed.prev;
      sinceYield += 1;
      if (sinceYield >= 64) {
        sinceYield = 0;
        yield { consumedChars: tok.end };
      }
    }
    if (stopped) break;

    wordIndex += 1;
    consumedChars = tok.end;
  }

  let maxUsed = -1;
  for (const p of placements) if (p.line > maxUsed) maxUsed = p.line;
  const lineCount = maxUsed + 1;
  const pageCount = truncated ? maxPages : Math.min(maxPages, Math.ceil(lineCount / linesPerPage));

  return { placements, lineCount, pageCount, truncated, consumedChars, missingChars };
}

export function layoutText(
  text: string,
  pack: GlyphPack,
  cfg: VarianceConfig,
  geom: LayoutGeometry,
  cache: InstanceCache,
): LayoutResult {
  const iterator = layoutTextSteps(text, pack, cfg, geom, cache);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}