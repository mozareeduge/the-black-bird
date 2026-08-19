import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The complete verification command required by the finalization authority
// (v3, F01), corrected by the v4 head-driver correction (R0, section 8).
// Every check below is a real command with a real exit code -- this script
// never marks a check green by omission or by catching its failure silently.
//
// Two closure layers, one aggregate result:
// - `local` checks are deterministic and always required, in every mode.
// - `browser` checks need Firefox/WebKit binaries. In `local` mode their
//   absence is recorded, not a failure (a sandboxed dev session may not have
//   them installed); in `ci` mode they are required, matching GitHub Actions
//   where exact-SHA workflows install and run all three browsers.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CHECKS = [
  { id: 'production_build', label: 'Deterministic production build + esbuild metafile', cmd: 'npm run build', category: 'local' },
  { id: 'build_verify', label: 'Deterministic build verification', cmd: 'npm run build:verify', category: 'local' },
  { id: 'canonical_integrity', label: 'Canonical data integrity (50 nodes, six types, fixed hash)', cmd: 'npm run test:data', category: 'local' },
  { id: 'source_policy', label: 'Source-policy scan (section 5 prohibited patterns)', cmd: 'node scripts/source-policy-scan.mjs', category: 'local' },
  { id: 'no_legacy_control_plane', label: 'No tracked repository-resident Claude control-plane residue', cmd: 'npm run test:legacy', category: 'local' },
  { id: 'contract_coherence', label: 'Canonical types + Route contract fields agree across contracts (R0)', cmd: 'node scripts/check-contract-coherence.mjs', category: 'local' },
  { id: 'production_ownership', label: 'Transitive production ownership: reachable, non-zero bundle bytes, allowed importers (R0/R2)', cmd: 'node scripts/check-production-ownership.mjs', category: 'local' },
  { id: 'semantic_duplication', label: 'No parallel legacy semantic store or duplicate authority in src/app.js (R1)', cmd: 'node scripts/check-semantic-duplication.mjs', category: 'local' },
  { id: 'unit_tests', label: 'Unit tests (node:test cases)', cmd: 'npm run test:unit', category: 'local' },
  { id: 'traceability', label: 'Requirement traceability contract', cmd: 'npm run test:traceability', category: 'local' },
  { id: 'scenario_coverage', label: '115/115 declared scenario coverage, zero gap/excluded (F06)', cmd: 'node scripts/check-scenario-coverage.mjs', category: 'local' },
  { id: 'generated_combinations', label: 'Generated pairwise/critical-triple coverage (Chromium)', cmd: 'npx playwright test tests/generated --project=chromium', category: 'local' },
  { id: 'chromium_e2e', label: 'Chromium E2E (tests/e2e)', cmd: 'npx playwright test tests/e2e --project=chromium', category: 'local' },
  { id: 'chromium_legacy_suite', label: 'Chromium legacy Playwright suites (baseline/route-solo/world-camera/mobile/design/visual)', cmd: 'npm run test:baseline && npm run test:route-solo && npm run test:world-camera && npm run test:mobile && npm run test:design && npm run test:visual', category: 'local' },
  { id: 'accessibility', label: 'Accessibility: axe-core zero serious/critical, zero exclusions', cmd: 'npm run test:a11y && npm run test:accessibility', category: 'local' },
  { id: 'documentation_truth', label: 'Documentation truth contract', cmd: 'npm run test:docs', category: 'local' },
  { id: 'cross_browser_smoke', label: 'Firefox/WebKit smoke (tests/cross-browser)', cmd: 'npm run test:cross-browser', category: 'browser' },
];

const BINARY_MISSING_MARKER = "Executable doesn't exist at";

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

function resolveMode() {
  const arg = process.argv[2];
  if (arg === '--ci') return 'ci';
  if (arg === '--local' || !arg) return 'local';
  throw new Error(`unknown verify-closure mode: ${arg} (expected --local or --ci)`);
}

function main() {
  const mode = resolveMode();
  const results = [];
  for (const check of CHECKS) {
    process.stderr.write(`\n--- ${check.id}: ${check.label} ---\n`);
    if (check.category === 'browser' && mode === 'local') {
      // Local mode still attempts installed browsers; only their absence is
      // non-blocking (v4 correction, section 1.7 / section 8) -- a real test
      // failure with the binaries present is still a real failure.
      const { conclusion, output, exit_code } = run(check.cmd);
      if (conclusion === 'failure' && output.includes(BINARY_MISSING_MARKER)) {
        process.stderr.write('--- ' + check.id + ': SKIPPED (browser binaries not installed in this environment; required in verify:closure:ci) ---\n');
        results.push({ id: check.id, label: check.label, command: check.cmd, category: check.category, conclusion: 'skipped', exit_code: 0, note: 'browser binaries unavailable locally' });
        continue;
      }
      process.stderr.write((output || '').slice(-4000) + '\n');
      process.stderr.write(`--- ${check.id}: ${conclusion.toUpperCase()} ---\n`);
      results.push({ id: check.id, label: check.label, command: check.cmd, category: check.category, conclusion, exit_code: exit_code ?? 0 });
      continue;
    }
    const { conclusion, output, exit_code } = run(check.cmd);
    process.stderr.write((output || '').slice(-4000) + '\n');
    process.stderr.write(`--- ${check.id}: ${conclusion.toUpperCase()} ---\n`);
    results.push({ id: check.id, label: check.label, command: check.cmd, category: check.category, conclusion, exit_code: exit_code ?? 0 });
  }

  // skipped only ever occurs for browser checks in local mode, and never
  // fails the aggregate; a real failure (any other conclusion !== success)
  // always does, in both modes.
  const failed = results.filter((r) => r.conclusion !== 'success' && r.conclusion !== 'skipped');
  const skipped = results.filter((r) => r.conclusion === 'skipped');
  const report = {
    schema_version: '4.0.0',
    mode,
    generated_at: new Date().toISOString(),
    candidate_head_sha: execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(),
    overall_conclusion: failed.length === 0 ? 'success' : 'failure',
    checks: results,
    failed_checks: failed.map((f) => f.id),
    skipped_checks: skipped.map((s) => s.id),
  };

  const outDir = path.join(ROOT, 'test-results', 'closure');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, `verification.${mode}.json`), JSON.stringify(report, null, 2));
  // Also write the unversioned name for tooling/CI that expects one fixed path.
  writeFileSync(path.join(outDir, 'verification.json'), JSON.stringify(report, null, 2));

  process.stderr.write(
    `\n=== verify:closure:${mode}: ${report.overall_conclusion.toUpperCase()} ` +
      `(${results.length - failed.length - skipped.length}/${results.length} passed, ${skipped.length} skipped) ===\n`,
  );
  if (skipped.length) process.stderr.write('Skipped (non-blocking): ' + skipped.map((s) => s.id).join(', ') + '\n');
  if (failed.length) process.stderr.write('Failed: ' + failed.map((f) => f.id).join(', ') + '\n');
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
