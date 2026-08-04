import { CommandType } from '../state/command-types.js';
import { resolvePointerOwner, createGestureArbiter } from '../layout/pointer-ownership.js';

// Wires DOM-shaped pointer events to resolvePointerOwner + the gesture
// arbiter (T16). Only ever dispatches a command on a validated pointerup
// commit (commitOnPointerUpOnly) — this controller never mutates state
// itself. Keyboard commits never go through this controller or its pointer
// solver at all (T-REQ-021's "keyboard bypasses pointer solver" is
// structural: a keyboard controller dispatches COMMIT_OBJECT directly).
export function createPointerController({ surface, dispatch, getCandidates, getFocusMemberIds }) {
  const arbiter = createGestureArbiter();

  function point(evt) {
    return { x: evt.clientX ?? 0, y: evt.clientY ?? 0 };
  }

  function ownerAt(evt) {
    const candidates = getCandidates();
    const modality = evt.pointerType || 'mouse';
    const focusMemberIds = getFocusMemberIds ? getFocusMemberIds() : new Set();
    return resolvePointerOwner(point(evt), candidates, { modality, focusMemberIds });
  }

  function onPointerDown(evt) {
    const ownerId = ownerAt(evt);
    if (ownerId == null) return;
    arbiter.pointerDown(evt.pointerId, point(evt), ownerId, evt.pointerType || 'mouse');
  }

  function onPointerMove(evt) {
    arbiter.pointerMove(evt.pointerId, point(evt));
  }

  function onPointerCancel(evt) {
    arbiter.pointerCancel(evt.pointerId);
  }

  function onPointerUp(evt) {
    const ownerIdAtUp = ownerAt(evt);
    const result = arbiter.pointerUp(evt.pointerId, ownerIdAtUp);
    if (result.commit) {
      dispatch({ type: CommandType.COMMIT_OBJECT, id: result.ownerId, source: 'pointer' });
    }
  }

  function onClick(evt) {
    if (arbiter.shouldSuppressSyntheticClick()) {
      evt.preventDefault?.();
      evt.stopPropagation?.();
    }
  }

  function start() {
    surface.addEventListener('pointerdown', onPointerDown);
    surface.addEventListener('pointermove', onPointerMove);
    surface.addEventListener('pointerup', onPointerUp);
    surface.addEventListener('pointercancel', onPointerCancel);
    surface.addEventListener('click', onClick);
  }

  function stop() {
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointermove', onPointerMove);
    surface.removeEventListener('pointerup', onPointerUp);
    surface.removeEventListener('pointercancel', onPointerCancel);
    surface.removeEventListener('click', onClick);
  }

  return { start, stop, arbiter };
}
