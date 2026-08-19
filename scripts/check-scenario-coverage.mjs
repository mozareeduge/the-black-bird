import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// F06 gate: scenario_count = 115, covered = 115, gap = 0, excluded = 0.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(readFileSync(path.join(ROOT, 'tests/generated/scenario-coverage-map.json'), 'utf8'));

function main() {
  const entries = map.entries || [];
  const covered = entries.filter((e) => e.status === 'covered');
  const gap = entries.filter((e) => e.status === 'gap');
  const excluded = entries.filter((e) => e.status === 'excluded');
  const errors = [];
  if (entries.length !== 115) errors.push(`scenario_count is ${entries.length}, required 115`);
  if (gap.length !== 0) errors.push(`${gap.length} scenarios remain gap (required 0): ${gap.map((e) => e.id).join(', ')}`);
  if (excluded.length !== 0) errors.push(`${excluded.length} scenarios are excluded (required 0): ${excluded.map((e) => e.id).join(', ')}`);
  for (const e of covered) {
    if (!Array.isArray(e.evidence) || e.evidence.length === 0) {
      errors.push(`covered scenario ${e.id} names no resolving test/assertion evidence`);
    }
  }
  const result = {
    valid: errors.length === 0,
    errors,
    scenario_count: entries.length,
    covered: covered.length,
    gap: gap.length,
    excluded: excluded.length,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exit(1);
}

main();
