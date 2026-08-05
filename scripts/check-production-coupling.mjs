import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// F02 gate: "the production bundle contains the tested modules" and
// "src/app.js contains composition and wiring only." This checks the
// claim against the real source text of src/app.js, not the PR description.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAYERED_DIRS = ['state', 'domain', 'application', 'layout', 'controllers', 'presentation', 'accessibility'];

function listModules(dir) {
  const full = path.join(ROOT, 'src', dir);
  const out = [];
  for (const name of readdirSync(full)) {
    const p = path.join(full, name);
    if (statSync(p).isFile() && name.endsWith('.js')) out.push(`src/${dir}/${name}`);
  }
  return out;
}

function main() {
  const appJs = readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
  const allModules = LAYERED_DIRS.flatMap(listModules);
  const importedModules = allModules.filter((m) => {
    const base = path.basename(m, '.js');
    const re = new RegExp(`from\\s+['"][^'"]*/${base}(\\.js)?['"]`);
    return re.test(appJs);
  });
  const missing = allModules.filter((m) => !importedModules.includes(m));

  const errors = [];
  if (importedModules.length === 0) {
    errors.push('src/app.js imports zero modules from the layered src/ tree (state/domain/application/layout/controllers/presentation/accessibility) — it is a second, parallel implementation, not a composition root.');
  }
  if (missing.length > 0) {
    errors.push(`${missing.length}/${allModules.length} layered modules are not imported by src/app.js: ${missing.join(', ')}`);
  }

  const result = {
    valid: errors.length === 0,
    errors,
    total_layered_modules: allModules.length,
    imported_by_app_js: importedModules.length,
    missing: missing,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exit(1);
}

main();
