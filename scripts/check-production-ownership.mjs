import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Reference gate supplied by the head correction. Place this script in the
// repository's scripts/ directory and the ownership contract at
// tests/contracts/production-ownership-contract.json (or adjust CONTRACT).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT = path.join(ROOT, 'tests', 'contracts', 'production-ownership-contract.json');
const META = path.join(ROOT, 'dist', 'build-meta.json');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}
function rel(p) { return path.relative(ROOT, p).replaceAll('\\', '/'); }
function importsOf(file) {
  const src = readFileSync(file, 'utf8');
  const specs = [];
  const re = /(?:import\s+[\s\S]*?\s+from\s+|import\s*)['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) specs.push(m[1]);
  return specs.filter((s) => s.startsWith('.')).map((s) => {
    let p = path.resolve(path.dirname(file), s);
    if (!path.extname(p)) p += '.js';
    return rel(p);
  });
}
function normalizeMetaInput(k) {
  const n = k.replaceAll('\\', '/');
  if (n.startsWith('src/')) return n;
  const marker = '/src/';
  const i = n.lastIndexOf(marker);
  return i >= 0 ? n.slice(i + 1) : n;
}
function main() {
  const errors = [];
  if (!existsSync(CONTRACT)) errors.push('missing production ownership contract: ' + rel(CONTRACT));
  if (!existsSync(META)) errors.push('missing esbuild metafile: dist/build-meta.json');
  if (errors.length) {
    console.log(JSON.stringify({ valid:false, errors }, null, 2));
    process.exit(1);
  }
  const contract = JSON.parse(readFileSync(CONTRACT, 'utf8'));
  const srcFiles = walk(path.join(ROOT, 'src'));
  const graph = new Map();
  const reverse = new Map();
  for (const f of srcFiles) {
    const from = rel(f);
    const deps = importsOf(f);
    graph.set(from, deps);
    for (const to of deps) {
      if (!reverse.has(to)) reverse.set(to, new Set());
      reverse.get(to).add(from);
    }
  }
  const reachable = new Set();
  const q = [contract.entrypoint];
  while (q.length) {
    const cur = q.shift();
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    for (const dep of graph.get(cur) || []) if (!reachable.has(dep)) q.push(dep);
  }

  const meta = JSON.parse(readFileSync(META, 'utf8'));
  const bytesByInput = new Map();
  for (const output of Object.values(meta.outputs || {})) {
    for (const [input, info] of Object.entries(output.inputs || {})) {
      const key = normalizeMetaInput(input);
      bytesByInput.set(key, (bytesByInput.get(key) || 0) + (info.bytesInOutput || 0));
    }
  }

  for (const [modulePath, spec] of Object.entries(contract.modules)) {
    if (!reachable.has(modulePath)) errors.push(`unreachable production module: ${modulePath}`);
    if (spec.required_in_bundle && !(bytesByInput.get(modulePath) > 0)) {
      errors.push(`module contributes zero production bytes: ${modulePath}`);
    }
    const importers = [...(reverse.get(modulePath) || [])];
    if (spec.allowed_importers && spec.allowed_importers.length) {
      if (!importers.some((x) => spec.allowed_importers.includes(x))) {
        errors.push(`no allowed production importer for ${modulePath}; actual=[${importers.join(', ')}] allowed=[${spec.allowed_importers.join(', ')}]`);
      }
    }
  }

  const result = {
    valid: errors.length === 0,
    errors,
    reachable_required: Object.keys(contract.modules).filter((m) => reachable.has(m)).length,
    required_modules: Object.keys(contract.modules).length,
    contributing_required: Object.keys(contract.modules).filter((m) => (bytesByInput.get(m) || 0) > 0).length,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}
main();
