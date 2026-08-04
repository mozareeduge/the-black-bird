import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSafeRect, computeNeutralCamera, computeFocusCamera, reconcileCamera } from '../../src/layout/camera.js';
import { createTransactionController } from '../../src/application/transaction-controller.js';

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
  assert.ok(occ >= 0.72 && occ <= 0.88, `occupancy ${occ} outside 0.72-0.88`);
  assert.ok(Math.abs(occ - 0.8) < 0.01, `occupancy ${occ} not close to target 0.80`);
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
  assert.equal(t1.k, 2.4);
  const hugeEnvelope = { x: 0, y: 0, width: 100000, height: 100000 };
  const t2 = computeNeutralCamera(hugeEnvelope, safeRect);
  assert.equal(t2.k, 0.55);
});

test('first focus fits the focus envelope to the focus occupancy band (0.58-0.82, target 0.70)', () => {
  const safeRect = computeSafeRect(PANE, MARGINS);
  // Large enough that the ideal fit scale for 0.70 occupancy stays within
  // [scaleMin, scaleMax] (960x840 safe rect => needs height >= ~245 or the
  // fit clamps at scaleMax and never reaches the target occupancy).
  const focusEnvelope = { x: 400, y: 300, width: 300, height: 300 };
  const t = computeFocusCamera(focusEnvelope, safeRect, null, { isFirstFocus: true });
  const occ = occupancy(focusEnvelope, t, safeRect);
  assert.ok(occ >= 0.58 && occ <= 0.82, `occupancy ${occ} outside focus band`);
  assert.ok(Math.abs(occ - 0.7) < 0.01);
  const proj = projectedRect(focusEnvelope, t);
  assert.ok(fullyInside(proj, safeRect), 'focus contour must be fully inside the safe rect after first focus');
});

test('later focus preserves the current transform exactly when the envelope is already fully inside', () => {
  const safeRect = computeSafeRect(PANE, MARGINS);
  const focusEnvelope = { x: 500, y: 400, width: 50, height: 50 };
  const currentTransform = { x: 0, y: 0, k: 1 }; // places the small envelope well inside a 960x840 safe rect
  const t = computeFocusCamera(focusEnvelope, safeRect, currentTransform);
  assert.equal(t, currentTransform, 'must be the identical transform reference, not a recomputed one');
});

test('a minimal pan nudges a barely-outside envelope into view without rescaling', () => {
  const safeRect = { x: 0, y: 0, width: 1000, height: 1000 };
  // Envelope projects just past the right edge (<=20% of its own area outside).
  const focusEnvelope = { x: 0, y: 0, width: 100, height: 100 };
  const currentTransform = { x: 950, y: 0, k: 1 }; // projected x in [950,1050]: 50% outside on x, but width*height small
  // Choose a case with a small outside fraction: shift so overlap area / total = ~0.9 (10% outside)
  const currentTransformSmallOverflow = { x: 910, y: 0, k: 1 }; // projected [910,1010]x[0,100]; outside width=10 of 100 => 10% area outside
  const t = computeFocusCamera(focusEnvelope, safeRect, currentTransformSmallOverflow);
  assert.equal(t.k, currentTransformSmallOverflow.k, 'minimal pan must not rescale');
  const proj = projectedRect(focusEnvelope, t);
  assert.ok(fullyInside(proj, safeRect), 'minimal pan must bring the envelope fully inside');
  assert.notEqual(t.x, currentTransformSmallOverflow.x, 'minimal pan must actually move x');
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
  assert.ok(Math.abs(occ - 0.7) < 0.01);
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
