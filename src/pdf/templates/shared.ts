import { fmt } from '../num';

export function hex2rg(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return `${fmt(r, 3)} ${fmt(g, 3)} ${fmt(b, 3)}`;
}
