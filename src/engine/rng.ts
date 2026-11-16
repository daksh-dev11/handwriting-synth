const mix32 = (h: number): number => {
  h >>>= 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85EBCA6B);
  h ^= h >>> 13;
  h = Math.imul(h, 0xC2B2AE35);
  h ^= h >>> 16;
  return h >>> 0;
};

export const hash32 = (seed: number, i: number, ch: number): number => {
  let h = mix32((seed ^ 0x9E3779B9) >>> 0);
  h = mix32((h ^ Math.imul((i >>> 0) + 1, 0x85EBCA6B)) >>> 0);
  h = mix32((h ^ Math.imul((ch >>> 0) + 1, 0xC2B2AE35)) >>> 0);
  return h >>> 0;
};

export const u01 = (seed: number, i: number, ch: number): number =>
  hash32(seed, i, ch) / 4294967296;

export const gauss = (seed: number, i: number, ch: number): number => {
  const u1 = Math.max(u01(seed, i, 0x1000 + 2 * ch), 1e-12);
  const u2 = u01(seed, i, 0x1000 + 2 * ch + 1);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(-3, Math.min(3, z));
};

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

export const perlin1 = (seed: number, ch: number, x: number): number => {
  const i0 = Math.floor(x);
  const t = x - i0;
  const g = (i: number): number => 2 * u01(seed, i >>> 0, 0x2000 + ch) - 1;
  const n0 = g(i0) * t;
  const n1 = g(i0 + 1) * (t - 1);
  return 2 * (n0 + fade(t) * (n1 - n0));
};

export const fnv1a32 = (s: string): number => {
  let h = 0x811C9DC5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export { mix32 };