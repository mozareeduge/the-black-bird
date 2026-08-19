import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Generates and executes declared scenario/sequence/combinatorial coverage
// (T27, T-REQ-044/045) against the read-only authority models in
// .bb-authority/authority/models/{coverage,scenarios,experience-traces}.json.
// This script never edits those files -- it only reads them and materializes
// the derived combinatorial sets + a scenario evidence report into
// tests/generated/** and test-results/coverage/coverage.json, both of which
// this task is allowed to write.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJSON(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function loadAuthorityModels() {
  const dir = path.join(ROOT, '.bb-authority', 'authority', 'models');
  return {
    coverage: readJSON(path.join(dir, 'coverage.json')),
    scenarios: readJSON(path.join(dir, 'scenarios.json')),
    traces: readJSON(path.join(dir, 'experience-traces.json')),
  };
}

// ---- constraint application (coverage.json `constraints`) -----------------
function constraintAppliesTo(constraint, row) {
  return Object.entries(constraint.if).every(([dim, val]) => {
    const want = Array.isArray(val) ? val : [val];
    return want.includes(row[dim]);
  });
}
function rowSatisfiesConstraints(row, constraints) {
  for (const c of constraints) {
    if (!constraintAppliesTo(c, row)) continue;
    for (const [dim, val] of Object.entries(c.then)) {
      if (dim === 'input_companion') continue; // advisory, not a hard filter on `row`
      if (!(dim in row)) continue;
      const allowed = Array.isArray(val) ? val : [val];
      if (!allowed.includes(row[dim])) return false;
    }
  }
  return true;
}

// ---- full cartesian product for "three-way" obligations --------------------
function cartesian(dims, dimensions) {
  let rows = [{}];
  for (const dim of dims) {
    const next = [];
    for (const row of rows) {
      for (const value of dimensions[dim]) next.push({ ...row, [dim]: value });
    }
    rows = next;
  }
  return rows;
}

// ---- greedy pairwise covering array for "pairwise" obligations -------------
function allPairsOf(dims) {
  const pairs = [];
  for (let i = 0; i < dims.length; i++) {
    for (let j = i + 1; j < dims.length; j++) pairs.push([dims[i], dims[j]]);
  }
  return pairs;
}
function pairKey(dimA, valA, dimB, valB) {
  return `${dimA}=${valA}&${dimB}=${valB}`;
}
function greedyPairwise(dims, dimensions, constraints) {
  const paramPairs = allPairsOf(dims);
  const uncovered = new Set();
  for (const [dimA, dimB] of paramPairs) {
    for (const valA of dimensions[dimA]) {
      for (const valB of dimensions[dimB]) {
        uncovered.add(pairKey(dimA, valA, dimB, valB));
      }
    }
  }
  const rows = [];
  function coveredByRow(row) {
    const keys = [];
    for (const [dimA, dimB] of paramPairs) keys.push(pairKey(dimA, row[dimA], dimB, row[dimB]));
    return keys;
  }
  function scoreRow(row) {
    return coveredByRow(row).filter((k) => uncovered.has(k)).length;
  }
  // Deterministic candidate pool: full cartesian product, constraint-filtered.
  const candidates = cartesian(dims, dimensions).filter((r) => rowSatisfiesConstraints(r, constraints));
  while (uncovered.size > 0) {
    let best = null;
    let bestScore = -1;
    for (const cand of candidates) {
      const s = scoreRow(cand);
      if (s > bestScore) {
        bestScore = s;
        best = cand;
      }
    }
    if (!best || bestScore <= 0) break; // remaining pairs are unreachable under constraints
    rows.push(best);
    for (const k of coveredByRow(best)) uncovered.delete(k);
  }
  return { rows, uncoveredCount: uncovered.size };
}

// ---- obligation generation --------------------------------------------------
function generateObligations(coverage) {
  const { dimensions, constraints, obligations } = coverage;
  const results = {};
  for (const ob of obligations) {
    if (ob.kind === 'three-way') {
      const rows = cartesian(ob.dimensions, dimensions).filter((r) => rowSatisfiesConstraints(r, constraints));
      results[ob.id] = { kind: ob.kind, dimensions: ob.dimensions, caseCount: rows.length, cases: rows };
    } else if (ob.kind === 'pairwise') {
      const { rows, uncoveredCount } = greedyPairwise(ob.dimensions, dimensions, constraints);
      results[ob.id] = { kind: ob.kind, dimensions: ob.dimensions, caseCount: rows.length, cases: rows, uncoveredPairs: uncoveredCount };
    } else if (ob.kind === 'ordered-pairs') {
      const pairs = [];
      for (const a of ob.actions) for (const b of ob.actions) if (a !== b) pairs.push([a, b]);
      results[ob.id] = { kind: ob.kind, actions: ob.actions, caseCount: pairs.length, cases: pairs };
    } else if (ob.kind === 'named-triples') {
      results[ob.id] = { kind: ob.kind, caseCount: ob.cases.length, cases: ob.cases };
    } else if (ob.kind === 'enumeration') {
      results[ob.id] = { kind: ob.kind, caseCount: ob.values.length, cases: ob.values };
    } else if (ob.kind === 'boundary-enumeration') {
      results[ob.id] = { kind: ob.kind, caseCount: ob.values.length, cases: ob.values };
    } else if (ob.kind === 'scenario-property') {
      results[ob.id] = { kind: ob.kind, property: ob.property };
    } else if (ob.kind === 'exhaustive-model') {
      results[ob.id] = { kind: ob.kind, source: ob.source };
    } else {
      results[ob.id] = { kind: ob.kind, note: 'unrecognized obligation kind; generated verbatim', raw: ob };
    }
  }
  return results;
}

// ---- cross-references from generation to existing/generated evidence -------
// Disclosed, hand-maintained mapping from each obligation to the concrete
// evidence that satisfies it. Kept here (not invented per-run) so a reviewer
// can see exactly what backs each claim.
const OBLIGATION_EVIDENCE = {
  'COV-TRANSITIONS': [
    'tests/unit/reducer.test.js :: COMMAND_SPECS matches the committed command contract exactly, command by command (T26, T-REQ-044)',
    'tests/unit/reducer.test.js :: reducer is pure: does not mutate a frozen input state, for every command',
  ],
  'COV-SIDE-EFFECTS': [
    'tests/unit/reducer.test.js :: reducer is pure: does not mutate a frozen input state, for every command',
    'tests/unit/transactions.test.js :: effects planned by the dispatcher carry the transaction txId and abort signal',
  ],
  'COV-VIEWPORT-INPUT-MOTION': [
    'tests/e2e/desktop-composition.spec.js (viewport)',
    'tests/e2e/tooltip-keyboard-status.spec.js (keyboard input)',
    'tests/e2e/mobile-chambers.spec.js, tests/generated/ordered-pairs.spec.js (touch/mobile viewport)',
    'tests/e2e/reduced-motion.spec.js (motion)',
  ],
  'COV-TARGET-VISIBILITY-TIMING': [
    'tests/e2e/view-index-solo.spec.js (visibility: default/group-filtered/object-hidden/all-hidden/solo)',
    'tests/unit/pointer-ownership.test.js (target: dense/invalid)',
    'tests/generated/critical-triples.spec.js (timing: rapid-commit, stale-callback)',
  ],
  'COV-ENVIRONMENT-PAIRWISE': [
    'tests/e2e/bootstrap.spec.js (bootstrap)',
    'tests/e2e/modals-about.spec.js (overlay)',
    'tests/e2e/environmental-resilience.spec.js (environment: forced-colors, zoom/reflow)',
    'tests/generated/critical-triples.spec.js :: [modal, breakpoint-cross, close-modal] (lifecycle x overlay)',
  ],
  'COV-ORDERED-ACTION-PAIRS': ['tests/generated/ordered-pairs.spec.js', 'tests/generated/critical-triples.spec.js'],
  'COV-CRITICAL-TRIPLES': ['tests/generated/critical-triples.spec.js'],
  'COV-CANONICAL-TYPES': [
    'tests/e2e/field-rendering.spec.js :: all six canonical morphologies plus the aperture role are present and match the extracted metric roles',
    'tests/e2e/reader.spec.js :: every one of the six canonical object types produces a view model...',
  ],
  'COV-RECOVERY': ['tests/generated/scenario-coverage-map.json (per-scenario evidence for every non-null `recovery` scenario)'],
  'COV-BOUNDARIES': [
    'tests/unit/route.test.js (route-empty, route-long, route-500-plus)',
    'tests/unit/trace.test.js (wear-zero, wear-cap, afterglow-zero, afterglow-cap)',
    'tests/e2e/view-index-solo.spec.js (no-visible-nodes/all-hidden, no-search-results)',
    'tests/e2e/environmental-resilience.spec.js (viewport-320, text-zoom-200)',
    'tests/e2e/mobile-chambers.spec.js (safe-area-edge)',
    'tests/unit/label-solver.test.js, tests/unit/focus-targets.test.js (dense-targets)',
  ],
};

function recoveryScenarios(scenarios) {
  return scenarios.scenarios.filter((s) => s.recovery != null).map((s) => s.id);
}

function loadScenarioMap() {
  return readJSON(path.join(ROOT, 'tests', 'generated', 'scenario-coverage-map.json'));
}

function validateScenarioMap(scenarioMap, scenarios) {
  const errors = [];
  const authorityIds = new Set(scenarios.scenarios.map((s) => s.id));
  const mapIds = new Set(scenarioMap.entries.map((e) => e.id));
  for (const id of authorityIds) if (!mapIds.has(id)) errors.push(`scenario ${id} missing from scenario-coverage-map.json (silent exclusion)`);
  for (const id of mapIds) if (!authorityIds.has(id)) errors.push(`scenario-coverage-map.json has unknown id ${id}`);
  for (const entry of scenarioMap.entries) {
    if (!['covered', 'gap'].includes(entry.status)) errors.push(`scenario ${entry.id}: unrecognized status "${entry.status}"`);
    if (entry.status === 'covered' && (!entry.evidence || entry.evidence.length === 0)) errors.push(`scenario ${entry.id}: status covered but no evidence listed`);
    if (entry.status === 'gap' && !entry.notes) errors.push(`scenario ${entry.id}: status gap but no disclosed reason (silent exclusion)`);
  }
  return errors;
}

function runGeneratedSpecs() {
  const generatedDir = path.join(ROOT, 'tests', 'generated');
  const specs = readdirSync(generatedDir).filter((f) => f.endsWith('.spec.js'));
  if (specs.length === 0) return { ran: false, exitCode: 0, specs: [] };
  const result = spawnSync('npx', ['playwright', 'test', ...specs.map((s) => path.join('tests', 'generated', s)), '--project=chromium'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return { ran: true, exitCode: result.status ?? 1, specs };
}

function main() {
  const { coverage, scenarios, traces } = loadAuthorityModels();
  if (scenarios.scenarios.length !== 115) throw new Error(`expected 115 scenarios, found ${scenarios.scenarios.length}`);
  if (traces.traces.length !== 115) throw new Error(`expected 115 traces, found ${traces.traces.length}`);

  const scenarioMap = loadScenarioMap();
  const mapErrors = validateScenarioMap(scenarioMap, scenarios);

  const obligations = generateObligations(coverage);
  const recovery = recoveryScenarios(scenarios);

  const specRun = runGeneratedSpecs();

  const coveredScenarios = scenarioMap.entries.filter((e) => e.status === 'covered').length;
  const gapScenarios = scenarioMap.entries.filter((e) => e.status === 'gap');

  const report = {
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    source: {
      coverage_schema_version: coverage.schema_version,
      scenario_count: scenarios.scenarios.length,
      trace_count: traces.traces.length,
      claim_boundary: coverage.claim_boundary,
    },
    obligations: Object.fromEntries(
      Object.entries(obligations).map(([id, ob]) => [
        id,
        { ...ob, evidence: OBLIGATION_EVIDENCE[id] ?? [], cases: ob.cases && ob.cases.length > 40 ? undefined : ob.cases },
      ])
    ),
    obligation_case_counts: Object.fromEntries(Object.entries(obligations).map(([id, ob]) => [id, ob.caseCount ?? null])),
    recovery_scenarios: recovery,
    scenarios: {
      total: scenarioMap.entries.length,
      covered: coveredScenarios,
      gap: gapScenarios.length,
      gap_ids: gapScenarios.map((e) => e.id),
    },
    generated_spec_run: { executed: specRun.ran, specs: specRun.specs, exit_code: specRun.exitCode },
    scenario_map_validation_errors: mapErrors,
    valid: mapErrors.length === 0 && specRun.exitCode === 0,
  };

  mkdirSync(path.join(ROOT, 'test-results', 'coverage'), { recursive: true });
  writeFileSync(path.join(ROOT, 'test-results', 'coverage', 'coverage.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(
    JSON.stringify(
      {
        valid: report.valid,
        scenarios: report.scenarios,
        generated_spec_exit_code: specRun.exitCode,
        scenario_map_validation_errors: mapErrors,
      },
      null,
      2
    )
  );
  process.exit(report.valid ? 0 : 1);
}

main();
