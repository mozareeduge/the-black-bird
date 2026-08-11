import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSafeRect, computeNeutralCamera, computeFocusCamera, neutralCoreEnvelope, reconcileCamera } from '../../src/layout/camera.js';
import { createTransactionController } from '../../src/application/transaction-controller.js';
import { readContract } from '../contracts/load.mjs';

// Scale bounds and occupancy bands come from the committed algorithm-
// contracts/visual-tokens fixtures (T26, T-REQ-044), not re-typed literals.
const { scaleMin: SCALE_MIN, scaleMax: SCALE_MAX } = readContract('algorithm-contracts.json').camera;
const { neutralMin: NEUTRAL_MIN, neutralTarget: NEUTRAL_TARGET, neutralMax: NEUTRAL_MAX, focusMin: FOCUS_MIN, focusTarget: FOCUS_TARGET, focusMax: FOCUS_MAX } =
  readContract('visual-tokens.json').occupancy;

const PANE = { x: 0, y: 0, width: 1440, height: 900 };
const MARGINS = { top: 60, right: 0, bottom: 0, left: 480 }; // rail + reader, no bottom nav on desktop

function occupancy(envelope, transform, safeRect) {
  const projectedW = envelope.width * transform.k;
  const projectedH = envelope.height * transform.k;
  return Math.max(projectedW / safeRect.width, projectedH / safeRect.height);
}

function projectedRect(envelope, t) {
  return { x: envelope.x * t.k + t.x, y: envelope.y * t.k + t.y, width: envelope.width * t.k, height: envelope.height * t.k };
}
function fullyInside(rect, safeRect, eps = 1e-6) {
  return (
    rect.x >= safeRect.x - eps &&
    rect.y >= safeRect.y - eps &&
    rect.x + rect.width <= safeRect.x + safeRect.width + eps &&
    rect.y + rect.height <= safeRect.y + safeRect.height + eps
  );
}

test('computeSafeRect subtracts margins and safe-area insets from the pane', () => {
  const safeRect = computeSafeRect(PANE, MARGINS);
  assert.deepEqual(safeRect, { x: 480, y: 60, width: 960, height: 840 });
});

test('computeSafeRect with no margins returns the pane unchanged', () => {
  assert.deepEqual(computeSafeRect(PANE), PANE);
});

test('neutral camera hits the exact occupancy band (0.72-0.88) at a required desktop profile', () => {
  const safeRect = computeSafeRect(PANE, MARGINS);
  const envelope = { x: 0, y: 0, width: 1000, height: 760 }; // WORLD extent
  const t = computeNeutralCamera(envelope, safeRect);
  const occ = occupancy(envelope, t, safeRect);
  assert.ok(occ >= NEUTRAL_MIN && occ <= NEUTRAL_MAX, `occupancy ${occ} outside ${NEUTRAL_MIN}-${NEUTRAL_MAX}`);
  assert.ok(Math.abs(occ - NEUTRAL_TARGET) < 0.01, `occupancy ${occ} not close to target ${NEUTRAL_TARGET}`);
});

test('neutral camera centers the envelope in the safe rect', () => {
  const safeRect = computeSafeRect(PANE, MARGINS);
  const envelope = { x: 0, y: 0, width: 1000, height: 760 };
  const t = computeNeutralCamera(envelope, safeRect);
  const proj = projectedRect(envelope, t);
  const envelopeCenterX = proj.x + proj.width / 2;
  const envelopeCenterY = proj.y + proj.height / 2;
  assert.ok(Math.abs(envelopeCenterX - (safeRect.x + safeRect.width / 2)) < 1e-6);
  assert.ok(Math.abs(envelopeCenterY - (safeRect.y + safeRect.height / 2)) < 1e-6);
});

test('scale is clamped to [scaleMin, scaleMax] for extreme envelope sizes', () => {
  const safeRect = computeSafeRect(PANE, MARGINS);
  const tinyEnvelope = { x: 0, y: 0, width: 1, height: 1 };
  const t1 = computeNeutralCamera(tinyEnvelope, safeRect);
  assert.equal(t1.k, SCALE_MAX);
  const hugeEnvelope = { x: 0, y: 0, width: 100000, height: 100000 };
  const t2 = computeNeutralCamera(hugeEnvelope, safeRect);
  assert.equal(t2.k, SCALE_MIN);
});

test('first focus fits the focus envelope to the focus occupancy band (0.58-0.82, target 0.70)', () => {
  const safeRect = computeSafeRect(PANE, MARGINS);
  // Large enough that the ideal fit scale for 0.70 occupancy stays within
  // [scaleMin, scaleMax] (960x840 safe rect => needs height >= ~245 or the
  // fit clamps at scaleMax and never reaches the target occupancy).
  const focusEnvelope = { x: 400, y: 300, width: 300, height: 300 };
  const t = computeFocusCamera(focusEnvelope, safeRect, null, { isFirstFocus: true });
  const occ = occupancy(focusEnvelope, t, safeRect);
  assert.ok(occ >= FOCUS_MIN && occ <= FOCUS_MAX, `occupancy ${occ} outside focus band`);
  assert.ok(Math.abs(occ - FOCUS_TARGET) < 0.01);
  const proj = projectedRect(focusEnvelope, t);
  assert.ok(fullyInside(proj, safeRect), 'focus contour must be fully inside the safe rect after first focus');
});

test('later focus preserves the current transform exactly when the envelope is already fully inside and within the occupancy band', () => {
  const safeRect = computeSafeRect(PANE, MARGINS); // {x:480,y:60,width:960,height:840}
  // Sized/positioned for ~0.7 occupancy (well inside [0.58,0.82]), not just
  // "small and somewhere inside" -- a tiny in-view envelope is fully inside
  // but out of band, and must NOT be preserved (see the next test).
  const focusEnvelope = { x: 635, y: 205, width: 650, height: 550 };
  const currentTransform = { x: 0, y: 0, k: 1 };
  const t = computeFocusCamera(focusEnvelope, safeRect, currentTransform);
  assert.equal(t, currentTransform, 'must be the identical transform reference, not a recomputed one');
});

test('later focus refits (does not preserve) when the envelope is fully inside but out of the occupancy band', () => {
  const safeRect = computeSafeRect(PANE, MARGINS);
  // Fully inside at k=1 (occupancy ~0.31, well below the 0.58 floor), and
  // large enough that the refit's ideal 0.70-occupancy scale (~2.24) stays
  // under scaleMax (2.4) -- an even smaller envelope would still trigger a
  // refit but couldn't actually reach the band (scale-clamped), which would
  // conflate "refit happened" with "refit hit its target" in one assertion.
  const focusEnvelope = { x: 500, y: 400, width: 300, height: 250 };
  const currentTransform = { x: 0, y: 0, k: 1 };
  const t = computeFocusCamera(focusEnvelope, safeRect, currentTransform);
  assert.notEqual(t.k, currentTransform.k, 'an in-band-failing envelope must be refit even though it is geometrically fully inside');
  const occ = occupancy(focusEnvelope, t, safeRect);
  assert.ok(occ >= FOCUS_MIN && occ <= FOCUS_MAX, `refit occupancy ${occ} should land in the sealed focus band`);
});

test('a minimal pan nudges a barely-outside, in-band envelope into view without rescaling', () => {
  const safeRect = { x: 0, y: 0, width: 1000, height: 1000 };
  // 700x700 in a 1000x1000 safe rect -> 0.7 occupancy (in band), so the
  // outside-fraction path is what's under test here, not the occupancy-band one.
  const focusEnvelope = { x: 0, y: 0, width: 700, height: 700 };
  // projected x:[370,1070] (70 outside of 700 width => 10% area outside), y:[150,850] fully inside.
  const currentTransform = { x: 370, y: 150, k: 1 };
  const t = computeFocusCamera(focusEnvelope, safeRect, currentTransform);
  assert.equal(t.k, currentTransform.k, 'minimal pan must not rescale');
  const proj = projectedRect(focusEnvelope, t);
  assert.ok(fullyInside(proj, safeRect), 'minimal pan must bring the envelope fully inside');
  assert.notEqual(t.x, currentTransform.x, 'minimal pan must actually move x');
});

test('more than 20% outside triggers a full refit, not a pan', () => {
  const safeRect = { x: 0, y: 0, width: 1000, height: 1000 };
  // Large enough that the 0.70-occupancy refit target stays within scaleMax.
  const focusEnvelope = { x: 0, y: 0, width: 400, height: 400 };
  // Projected far outside (only a sliver overlapping): forces a refit.
  const currentTransform = { x: 950, y: 950, k: 1 };
  const t = computeFocusCamera(focusEnvelope, safeRect, currentTransform);
  assert.notEqual(t.k, currentTransform.k, 'a refit recomputes scale for the focus occupancy target');
  const occ = occupancy(focusEnvelope, t, safeRect);
  assert.ok(Math.abs(occ - FOCUS_TARGET) < 0.01);
});

test('neutralCoreEnvelope leaves the envelope unchanged when the full envelope already satisfies both occupancy bands (desktop-shaped case)', () => {
  const envelope = { x: 0, y: 0, width: 800, height: 600 };
  const safeRect = { x: 0, y: 0, width: 1000, height: 800 };
  const anchor = { x: 400, y: 300 };
  const result = neutralCoreEnvelope(envelope, safeRect, anchor);
  assert.deepEqual(result, envelope);
});

test('neutralCoreEnvelope crops width, centered on the anchor, when the envelope is too wide for a portrait safe rect', () => {
  const envelope = { x: -300, y: 0, width: 1400, height: 600 };
  const safeRect = { x: 0, y: 0, width: 400, height: 800 };
  const anchor = { x: 100, y: 50 };
  const result = neutralCoreEnvelope(envelope, safeRect, anchor);
  assert.notDeepEqual(result, envelope, 'an out-of-band envelope must be cropped, not passed through');
  assert.equal(result.height, envelope.height, 'only the oversized axis is cropped');
  assert.ok(Math.abs(result.x + result.width / 2 - anchor.x) < 1e-9, 'the crop is centered on the anchor');
  const k = Math.min((safeRect.width * 0.8) / result.width, (safeRect.height * 0.8) / result.height);
  const occX = (result.width * k) / safeRect.width;
  const occY = (result.height * k) / safeRect.height;
  assert.ok(Math.abs(occX - 0.8) < 1e-9 && Math.abs(occY - 0.8) < 1e-9, 'both axes land exactly at the neutral occupancy target, not just inside the band');
});

test('neutralCoreEnvelope crops height, centered on the anchor, when the envelope is too tall for a landscape safe rect (symmetric case)', () => {
  const envelope = { x: 0, y: 0, width: 300, height: 1400 };
  const safeRect = { x: 0, y: 0, width: 800, height: 300 };
  const anchor = { x: 10, y: 700 };
  const result = neutralCoreEnvelope(envelope, safeRect, anchor);
  assert.equal(result.width, envelope.width, 'only the oversized axis is cropped');
  assert.ok(Math.abs(result.y + result.height / 2 - anchor.y) < 1e-9, 'the crop is centered on the anchor');
  const k = Math.min((safeRect.width * 0.8) / result.width, (safeRect.height * 0.8) / result.height);
  const occX = (result.width * k) / safeRect.width;
  const occY = (result.height * k) / safeRect.height;
  assert.ok(Math.abs(occX - 0.8) < 1e-9 && Math.abs(occY - 0.8) < 1e-9);
});

test('neutralCoreEnvelope is a no-op guard for a degenerate zero-size envelope', () => {
  const envelope = { x: 0, y: 0, width: 0, height: 600 };
  const safeRect = { x: 0, y: 0, width: 400, height: 800 };
  const result = neutralCoreEnvelope(envelope, safeRect, { x: 0, y: 0 });
  assert.deepEqual(result, envelope);
});

test('reconcileCamera returns the computed transform only while its transaction is still active (T-REQ-017)', () => {
  const transactions = createTransactionController();
  const t1 = transactions.begin();
  const compute = () => ({ x: 1, y: 2, k: 1.5 });
  const fresh = reconcileCamera({ txId: t1.txId, isActive: transactions.isActive, compute });
  assert.deepEqual(fresh, { x: 1, y: 2, k: 1.5 });

  transactions.begin(); // supersedes t1
  const stale = reconcileCamera({ txId: t1.txId, isActive: transactions.isActive, compute });
  assert.equal(stale, null, 'a stale transaction must never hand back a usable camera transform');
});
