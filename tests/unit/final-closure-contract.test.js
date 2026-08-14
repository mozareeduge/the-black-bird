import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readContract } from '../contracts/load.mjs';
import { WORLD } from '../../src/layout/authored-world.js';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const contract = readContract('final-closure-contract.json');

test('closure contract declares the exact fixed terminal state', () => {
  assert.equal(contract.terminal_state, 'CANDIDATE_READY_FOR_ARTISTIC_REVIEW');
});

test('closure contract canonical hash matches the tracked canonical-data.sha256 file', () => {
  const tracked = readFileSync(path.join(ROOT, 'src/data/canonical-data.sha256'), 'utf8').trim();
  assert.equal(contract.canonical_data_sha256, tracked);
  assert.equal(contract.canonical_data_sha256, 'c5d22a4590ccd6ced0188fec0391b73fc6c1538c3f286cb85ff8a78c44a5c83d');
});

test('closure contract authored-world dimensions match the live layout module', () => {
  assert.equal(contract.authored_world.width, WORLD.width);
  assert.equal(contract.authored_world.height, WORLD.height);
});

test('closure contract browser matrix is exactly chromium, firefox, webkit', () => {
  assert.deepEqual(contract.browser_matrix, ['chromium', 'firefox', 'webkit']);
});

test('closure contract required scenario count is exactly 115', () => {
  assert.equal(contract.required_scenario_count, 115);
});

test('closure contract required evidence IDs total exactly 49 primary entries', () => {
  // FQ-03: RESPONSIVE-ACCESS/text-zoom-200 (a mislabeled viewport reflow
  // capture) split into two truthfully-named entries -- reflow-zoom-
  // equivalent (the same reflow capture, honestly named) and text-resize-200
  // (a new, real computed-font-size-doubling proof) -- so static count grew
  // by one, 30 -> 31.
  // Micro-refinement round (MR-05): added 4 new required primary entries for
  // MICRO-01/02/03 -- ARTISTIC-CORE/relo-reader-caption,
  // ARTISTIC-CORE/nameo-active-inscription,
  // STATE-AND-RECOVERY/reader-actions-hide-show (static, 31 -> 34), and
  // motion/reader-context-actions-mobile (motion, 7 -> 8).
  const { static_application_captures, motion_recordings, machine_reports } = contract.required_evidence_ids;
  assert.equal(static_application_captures.length, 34);
  assert.equal(motion_recordings.length, 8);
  assert.equal(machine_reports.length, 7);
  const total = static_application_captures.length + motion_recordings.length + machine_reports.length;
  assert.equal(total, contract.required_primary_entry_count);
  assert.equal(total, 49);
});

test('closure contract required evidence IDs are unique', () => {
  const { static_application_captures, motion_recordings, machine_reports } = contract.required_evidence_ids;
  const all = [...static_application_captures, ...motion_recordings, ...machine_reports];
  assert.equal(new Set(all).size, all.length);
});

test('closure contract responsive viewport matrix covers all seven required profiles', () => {
  const labels = contract.responsive_viewport_matrix.map((v) => v.label);
  assert.deepEqual(labels, ['1440x960', '1280x800', '1024x640', '430x932', '390x844', '320x640', '844x390']);
});
