import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Enforces the prohibited-pattern list in the finalization authority (v3,
// section 5) against real source text, not a hand-typed claim. Every rule
// here is a literal quote or close paraphrase of that section.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src', 'tests', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report', 'candidate-evidence']);
const SKIP_FILES = new Set([path.join('scripts', 'source-policy-scan.mjs')]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(js|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

const RULES = [
  { id: 'forced-playwright-action', re: /\bforce\s*:\s*true\b/g, message: 'force: true (or equivalent forced Playwright action) is prohibited' },
  { id: 'runtime-force-simulation', re: /d3\s*\.\s*forceSimulation\s*\(/g, message: 'd3.forceSimulation as runtime geometry authority is prohibited', dirs: ['src'] },
  { id: 'public-node-drag', re: /d3\s*\.\s*drag\s*\(/g, message: 'public d3.drag node movement is prohibited', dirs: ['src'] },
  { id: 'axe-rule-exclusion', re: /disableRules|rules\s*:\s*\{[^}]*enabled\s*:\s*false/g, message: 'Axe rule exclusion is prohibited' },
  { id: 'manual-completion-receipt', re: /\.bb-control\/|\.bb-authority\//g, message: 'manual completion receipts or exception statuses (.bb-control/, .bb-authority/) are prohibited' },
];

// Blanks out comment bodies (replacing non-newline chars with spaces) so
// regex match indices still map to correct original line numbers, and
// prose inside comments never trips a rule meant for live code.
function blankComments(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (text[i] === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (text[i] === '/' && text[i + 1] === '*') {
      out += '  '; i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

function main() {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
  const violations = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (SKIP_FILES.has(rel)) continue;
    const raw = readFileSync(file, 'utf8');
    const code = blankComments(raw);
    for (const rule of RULES) {
      if (rule.dirs && !rule.dirs.some((d) => rel.startsWith(d + path.sep))) continue;
      for (const m of code.matchAll(rule.re)) {
        violations.push({ rule: rule.id, file: rel, line: lineOf(raw, m.index), message: rule.message });
      }
    }
  }
  const result = { valid: violations.length === 0, violations, files_scanned: files.length };
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exit(1);
}

main();
