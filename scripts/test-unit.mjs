import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Entry point for `npm run test:unit` (T26, T-REQ-044). Glob-based file
// discovery instead of the shell's own `tests/unit/*.test.js` expansion, so
// this runs identically regardless of shell.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const UNIT_DIR = path.join(ROOT, 'tests', 'unit');

const files = readdirSync(UNIT_DIR)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => path.join('tests', 'unit', name));

if (files.length === 0) {
  console.error('test-unit: no tests/unit/*.test.js files found');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, stdio: 'inherit' });
process.exit(result.status ?? 1);
