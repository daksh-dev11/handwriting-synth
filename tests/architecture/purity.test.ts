import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });

const FORBIDDEN_IMPORT =
  /from\s+['"](?!\.{1,2}\/)[^'"]+['"]|import\s*\(\s*['"](?!\.{1,2}\/)|import\s+['"](?!\.{1,2}\/)/;
const FORBIDDEN_GLOBAL =
  /\b(window|document|self|globalThis|navigator|performance|indexedDB|localStorage|sessionStorage|fetch|Worker|requestAnimationFrame|setTimeout|setInterval|console|TextEncoder|TextDecoder|crypto|structuredClone|process|require|Math\.random|Date\.now|new Date)\b/;
const ESLINT_DISABLE = /eslint-disable/;

describe('engine purity', () => {
  const files = walk('src/engine');

  it('has files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const f of files) {
    it(`pure: ${f}`, () => {
      const raw = readFileSync(f, 'utf8');
      const src = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1');
      expect(src).not.toMatch(FORBIDDEN_IMPORT);
      expect(src).not.toMatch(FORBIDDEN_GLOBAL);
      expect(raw).not.toMatch(ESLINT_DISABLE);
    });
  }
});