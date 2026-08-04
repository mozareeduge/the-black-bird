import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

const PLACEHOLDER = '/*__BB_BUILD_APP_SCRIPT__*/';

function extractCanonicalDataText(source) {
  const m = source.match(/export const DATA = (\{[\s\S]*\});\n?$/);
  if (!m) throw new Error('src/data/canonical-data.js: DATA export not found');
  return m[1];
}

export function build() {
  const template = readFileSync(path.join(ROOT, 'src/index.template.html'), 'utf8');
  const dataModule = readFileSync(path.join(ROOT, 'src/data/canonical-data.js'), 'utf8');
  const appJs = readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
  if (!template.includes(PLACEHOLDER)) {
    throw new Error('src/index.template.html is missing the app-script placeholder');
  }
  const dataText = extractCanonicalDataText(dataModule);
  const scriptContent = `const DATA = ${dataText};\n${appJs}`;
  return template.replace(PLACEHOLDER, scriptContent);
}

function main() {
  const output = build();
  const outPath = path.join(ROOT, 'index.html');
  writeFileSync(outPath, output, 'utf8');
  process.stdout.write(`built ${outPath} (${Buffer.byteLength(output, 'utf8')} bytes)\n`);
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? '')) {
  main();
}
