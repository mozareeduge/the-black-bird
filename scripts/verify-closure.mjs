import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The single complete local verification command required by the
// finalization authority (v3, F01). Every check below is a real command
// with a real exit code — this script never marks a check green by
// omission or by catching its failure silently.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CHECKS = [
  { id: 'build_verify', label: 'Deterministic build verification', cmd: 'npm run build:verify' },
  { id: 'canonical_integrity', label: 'Canonical data integrity (50 nodes, six types, fixed hash)', cmd: 'npm run test:data' },
  { id: 'source_policy', label: 'Source-policy scan (section 5 prohibited patterns)', cmd: 'node scripts/source-policy-scan.mjs' },
  { id: 'no_legacy_control_plane', label: 'No active Claude control-plane residue', cmd: 'npm run test:legacy' },
  { id: 'production_module_coupling', label: 'src/app.js imports the tested layered module tree (F02)', cmd: 'node scripts/check-production-coupling.mjs' },
  { id: 'unit_tests', label: 'Unit tests (121+ node:test cases)', cmd: 'npm run test:unit' },
  { id: 'traceability', label: 'Requirement traceability contract', cmd: 'npm run test:traceability' },
  { id: 'scenario_coverage', label: '115/115 declared scenario coverage, zero gap/excluded (F06)', cmd: 'node scripts/check-scenario-coverage.mjs' },
  { id: 'generated_combinations', label: 'Generated pairwise/critical-triple coverage (Chromium)', cmd: 'npx playwright test tests/generated --project=chromium' },
  { id: 'chromium_e2e', label: 'Chromium E2E (tests/e2e)', cmd: 'npx playwright test tests/e2e --project=chromium' },
  { id: 'chromium_legacy_suite', label: 'Chromium legacy Playwright suites (baseline/route-solo/world-camera/mobile/design/visual)', cmd: 'npm run test:baseline && npm run test:route-solo && npm run test:world-camera && npm run test:mobile && npm run test:design && npm run test:visual' },
  { id: 'accessibility', label: 'Accessibility: axe-core zero serious/critical, zero exclusions', cmd: 'npm run test:a11y && npm run test:accessibility' },
  { id: 'cross_browser_smoke', label: 'Firefox/WebKit smoke (tests/cross-browser)', cmd: 'npm run test:cross-browser' },
  { id: 'documentation_truth', label: 'Documentation truth contract', cmd: 'npm run test:docs' },
];

function run(cmd) {
  try {
    const output = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { conclusion: 'success', output };
  } catch (err) {
    return {
      conclusion: 'failure',
      output: [err.stdout, err.stderr].filter(Boolean).join('\n'),
      exit_code: err.status ?? null,
    };
  }
}

function main() {
  const results = [];
  for (const check of CHECKS) {
    process.stderr.write(`\n--- ${check.id}: ${check.label} ---\n`);
    const { conclusion, output, exit_code } = run(check.cmd);
    process.stderr.write((output || '').slice(-4000) + '\n');
    process.stderr.write(`--- ${check.id}: ${conclusion.toUpperCase()} ---\n`);
    results.push({ id: check.id, label: check.label, command: check.cmd, conclusion, exit_code: exit_code ?? 0 });
  }

  const failed = results.filter((r) => r.conclusion !== 'success');
  const report = {
    schema_version: '3.0.0',
    generated_at: new Date().toISOString(),
    candidate_head_sha: execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(),
    overall_conclusion: failed.length === 0 ? 'success' : 'failure',
    checks: results,
    failed_checks: failed.map((f) => f.id),
  };

  const outDir = path.join(ROOT, 'test-results', 'closure');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'verification.json'), JSON.stringify(report, null, 2));

  process.stderr.write(`\n=== verify:closure: ${report.overall_conclusion.toUpperCase()} (${results.length - failed.length}/${results.length} checks passed) ===\n`);
  if (failed.length) {
    process.stderr.write('Failed: ' + failed.map((f) => f.id).join(', ') + '\n');
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
