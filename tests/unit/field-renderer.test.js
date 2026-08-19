import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNodeMetrics,
  morphologyOf,
  CANONICAL_MORPHOLOGIES,
  isArabicScript,
  splitNameOInscription,
} from '../../src/presentation/field-renderer.js';
import { readContract } from '../contracts/load.mjs';
import { DATA } from '../../src/data/canonical-data.js';

// NameO body design decision (owner-directed, see .blackbird-v6/PROGRESS.md
// "NameO body design decision"): the smallest, quietest body in the
// morphology set -- a plain filled circle, not a new shape family. Values
// read from the committed visual-tokens contract, not re-typed literals
// (T26, T-REQ-044).
const NAMEO_CORE_R = readContract('visual-tokens.json').morphology.NameO.coreRadius;

test('computeNodeMetrics: NameO has a real, non-degenerate body -- the smallest of all six types', () => {
  const m = computeNodeMetrics({ id: 'NameO.AR.GHURAB', type: 'NameO' });
  assert.equal(m.coreR, NAMEO_CORE_R);
  assert.equal(m.outerR, NAMEO_CORE_R);
  assert.ok(m.coreR > 0, 'NameO must have a real, visible body radius (not the old degenerate coreR=0)');
  // Smallest of all six non-aperture types (previous smallest: RefO, coreR
  // 4.5, diamond half-width).
  const others = ['RefO', 'RNO', 'MNO', 'RelO', 'FO'].map((type) => computeNodeMetrics({ id: `${type}.X`, type }));
  for (const other of others) {
    assert.ok(m.coreR < other.coreR, `NameO coreR (${m.coreR}) must be smaller than every other type's (got ${other.coreR})`);
  }
});

test('computeNodeMetrics: NameO hit/collide/label-offset follow the same shared formula as every other type (no special-casing)', () => {
  const m = computeNodeMetrics({ id: 'NameO.AR.GHURAB', type: 'NameO' });
  assert.equal(m.hitR, m.outerR + 9);
  assert.equal(m.collideR, m.outerR + 9);
  assert.equal(m.labelOffset, m.outerR + 9);
  assert.equal(m.haloR, m.outerR + 6);
  assert.equal(m.focusR, m.outerR + 8);
  // Strictly smaller than the previous invisible placeholder's reserved
  // collision footprint (outerR=5 -> collideR=14), so the new real body can
  // only relax existing force-simulation spacing, never introduce a new
  // overlap.
  assert.ok(m.collideR < 14, 'new real body must reserve less collision room than the old invisible placeholder did');
});

test('CANONICAL_MORPHOLOGIES still lists nameo (unchanged by giving it a real body)', () => {
  assert.ok(CANONICAL_MORPHOLOGIES.includes('nameo'));
  assert.equal(morphologyOf({ id: 'NameO.AR.GHURAB', type: 'NameO' }), 'nameo');
});

// MICRO-03: splitNameOInscription derives the active NameO's two-line Field
// inscription from canonical node.label alone -- every current canonical
// NameO label, exercised directly from DATA (no invented content).
test('splitNameOInscription: Arabic-script side is primary when exactly one side is Arabic (canonical NameO.AR.GHURAB)', () => {
  const label = DATA.nodes.find((n) => n.id === 'NameO.AR.GHURAB').label;
  assert.equal(label, 'ghurāb / غراب');
  const { primary, secondary } = splitNameOInscription(label);
  assert.equal(primary, 'غراب');
  assert.equal(secondary, 'ghurāb');
});

test('splitNameOInscription: left/right order is preserved verbatim when neither side is Arabic', () => {
  const cases = [
    ['hrafn / hrafnar', 'hrafn', 'hrafnar'],
    ['scald-crow / ennach', 'scald-crow', 'ennach'],
    ['American crow / Corvus brachyrhynchos', 'American crow', 'Corvus brachyrhynchos'],
  ];
  for (const [label, primary, secondary] of cases) {
    const result = splitNameOInscription(label);
    assert.equal(result.primary, primary);
    assert.equal(result.secondary, secondary);
  }
});

test('splitNameOInscription: every current canonical NameO label derives a valid inscription with no invented content (NAI-03)', () => {
  const nameos = DATA.nodes.filter((n) => n.type === 'NameO');
  assert.equal(nameos.length, 4);
  for (const node of nameos) {
    const { primary, secondary } = splitNameOInscription(node.label);
    assert.ok(primary.length > 0, `${node.id} must derive a non-empty primary line`);
    assert.ok(node.label.includes(primary), `${node.id} primary must come from canonical label, not invented text`);
    if (secondary) assert.ok(node.label.includes(secondary), `${node.id} secondary must come from canonical label, not invented text`);
  }
});

test('splitNameOInscription: a label with no " / " separator becomes the whole primary line with no secondary', () => {
  const result = splitNameOInscription('SingleWord');
  assert.equal(result.primary, 'SingleWord');
  assert.equal(result.secondary, '');
});

test('isArabicScript: detects the Arabic block and rejects Latin-only text', () => {
  assert.equal(isArabicScript('غراب'), true);
  assert.equal(isArabicScript('ghurāb'), false);
  assert.equal(isArabicScript(''), false);
  assert.equal(isArabicScript(undefined), false);
});
