import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSync } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

const PLACEHOLDER = '/*__BB_BUILD_APP_SCRIPT__*/';

function extractCanonicalDataText(source) {
  const m = source.match(/export const DATA = (\{[\s\S]*\});\n?$/);
  if (!m) throw new Error('src/data/canonical-data.js: DATA export not found');
  return m[1];
}

// Real deterministic module bundling (F02, section 2.2/4): src/app.js
// imports the layered src/state|domain|application|layout|controllers|
// presentation|accessibility tree, and esbuild resolves those imports into
// one self-contained, backend-free IIFE -- not string-concatenated as an
// opaque flat script. The IIFE wrapper scopes app.js's internals out of
// global reach; tests that need to reach specific internals do so through
// the deliberately bounded window.__bbTest interface (exposed only in
// ?bbtest=1 sessions), never through accidental top-level globals.
function bundleAppScript() {
  const result = buildSync({
    entryPoints: [path.join(ROOT, 'src/app.js')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'silent',
  });
  if (result.errors.length) {
    throw new Error('esbuild failed to bundle src/app.js: ' + JSON.stringify(result.errors));
  }
  return result.outputFiles[0].text;
}

export function build() {
  const template = readFileSync(path.join(ROOT, 'src/index.template.html'), 'utf8');
  const dataModule = readFileSync(path.join(ROOT, 'src/data/canonical-data.js'), 'utf8');
  if (!template.includes(PLACEHOLDER)) {
    throw new Error('src/index.template.html is missing the app-script placeholder');
  }
  const dataText = extractCanonicalDataText(dataModule);
  const bundledAppJs = bundleAppScript();
  const scriptContent = `const DATA = ${dataText};\n${bundledAppJs}`;
  return template.replace(PLACEHOLDER, scriptContent);
}

function main() {
  const output = build();
  const outPath = path.join(ROOT, 'index.html');
  writeFileSync(outPath, output, 'utf8');
  process.stdout.write(`built ${outPath} (${Buffer.byteLength(output, 'utf8')} bytes)\n`);
  // dist/ is a generated, gitignored copy of the same deterministic output
  // (T29, T-REQ-002) -- a conventional build-artifact location CI can
  // archive, distinct from the committed root index.html that GitHub Pages
  // actually serves.
  const distDir = path.join(ROOT, 'dist');
  mkdirSync(distDir, { recursive: true });
  writeFileSync(path.join(distDir, 'index.html'), output, 'utf8');
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? '')) {
  main();
}
