import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dir = 'dist/assets';
const KiB = 1024;
const budgets = [
  { test: /^index-.*\.js$/, maxGz: 130 * KiB, label: 'main chunk (react + app + engine)' },
  { test: /^pdf\.worker-.*\.js$/, maxGz: 280 * KiB, label: 'worker chunk (pdf-lib + engine)' },
  { test: /^demoHand-.*\.js$/, maxGz: 14 * KiB, label: 'demo chunk (demo hand DSL)' },
];

let failed = false;

if (!existsSync(dir)) {
  console.log(`skip: ${dir} does not exist yet`);
  process.exit(0);
}

const files = readdirSync(dir);

for (const b of budgets) {
  const matches = files.filter((f) => b.test.test(f));
  if (matches.length === 0) {
    console.log(`skip ${b.label}: no chunk emitted yet`);
    continue;
  }
  for (const f of matches) {
    const gz = gzipSync(readFileSync(join(dir, f))).length;
    const ok = gz <= b.maxGz;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${b.label}: ${(gz / KiB).toFixed(1)} KiB gz (max ${(b.maxGz / KiB).toFixed(0)})`);
    if (!ok) failed = true;
  }
}

const cssFiles = files.filter((f) => f.endsWith('.css'));
if (cssFiles.length === 0) {
  console.log('skip all CSS combined: no CSS emitted yet');
} else {
  const cssGz = cssFiles.reduce((sum, f) => sum + gzipSync(readFileSync(join(dir, f))).length, 0);
  const ok = cssGz <= 14 * KiB;
  console.log(`${ok ? 'ok  ' : 'FAIL'} all CSS combined: ${(cssGz / KiB).toFixed(1)} KiB gz (max 14)`);
  if (!ok) failed = true;
}

const mainChunks = files.filter((f) => /^index-.*\.js$/.test(f));
const pdfLibMarker = /%PDF-|FlateStream|node_modules[/\\]pdf-lib/;
for (const f of mainChunks) {
  if (pdfLibMarker.test(readFileSync(join(dir, f), 'utf8'))) {
    console.log(`FAIL pdf-lib leaked into the main chunk (${f})`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);