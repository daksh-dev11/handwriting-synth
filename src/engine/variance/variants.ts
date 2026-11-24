import { CH, K } from '../constants';
import { clamp } from '../mathUtil';
import { u01 } from '../rng';

export interface CharacterHistory {
  last: number;
  lastPos: number;
  use: number[];
}

export interface VariantHistory {
  readonly characters: Map<string, CharacterHistory>;
}

export function createVariantHistory(): VariantHistory {
  return { characters: new Map<string, CharacterHistory>() };
}

export function resetParagraphHistory(history: VariantHistory): void {
  history.characters.clear();
}

export function selectVariant(
  seed: number,
  k: number,
  char: string,
  nBase: number,
  poolSize: number,
  history: VariantHistory,
): number {
  const nEff = nBase * poolSize;
  if (nEff <= 1) return 0;

  let h = history.characters.get(char);
  if (!h || h.use.length !== nEff) {
    h = { last: -1, lastPos: -99, use: new Array<number>(nEff).fill(-99) };
    history.characters.set(char, h);
  }

  const weights = new Array<number>(nEff);
  let sum = 0;
  for (let e = 0; e < nEff; e++) {
    if (e === h.last && k - h.lastPos <= K.RECENT_BLOCK) {
      weights[e] = 0;
    } else {
      weights[e] = 1 + 0.5 * (clamp(k - h.use[e], 0, K.AGE_CAP) / K.AGE_CAP);
    }
    sum += weights[e];
  }

  const u = u01(seed, k, CH.VARIANT) * sum;
  let acc = 0;
  let pick = nEff - 1;
  for (let e = 0; e < nEff; e++) {
    acc += weights[e];
    if (u < acc) {
      pick = e;
      break;
    }
  }

  h.last = pick;
  h.lastPos = k;
  h.use[pick] = k;
  return pick;
}