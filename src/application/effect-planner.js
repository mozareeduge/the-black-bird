import { CommandType } from '../state/command-types.js';

// Declarative presentation effects for a just-reduced command (T07, T-REQ-006/007).
// This module is DOM-free by design: it only describes *what* should happen, each
// entry carrying the transaction's txId and abort signal, so whatever executes
// them later (a presentation-layer module, out of scope here) can check
// `signal.aborted` before mutating anything — "stale work may not mutate
// semantic or current presentation state" (P-RULE-036).
export function planEffects({ command, txId, signal, previousId, nextId }) {
  const effects = [];
  const withOwner = (effect) => ({ ...effect, txId, signal });

  switch (command.type) {
    case CommandType.COMMIT_OBJECT:
    case CommandType.INTERRUPT_ONBOARDING_WITH_OBJECT:
      effects.push(withOwner({ type: 'camera-focus', targetId: nextId, fromNeutral: previousId == null }));
      effects.push(withOwner({ type: 'reader-render', targetId: nextId, delayMs: 160 }));
      effects.push(withOwner({ type: 'route-draw', durationMs: 420 }));
      break;

    case CommandType.RETURN_TO_WHOLE_FIELD:
      effects.push(withOwner({ type: 'camera-neutral' }));
      break;

    case CommandType.REPLAY_ROUTE_EVENT:
      effects.push(withOwner({ type: 'camera-focus', targetId: nextId, fromNeutral: false }));
      effects.push(withOwner({ type: 'reader-render', targetId: nextId, delayMs: 0 }));
      break;

    case CommandType.ENTER_SOLO:
    case CommandType.EXIT_SOLO:
    case CommandType.RESTORE_FIELD:
    case CommandType.SET_TYPE_VISIBILITY:
    case CommandType.SET_OBJECT_VISIBILITY:
      effects.push(withOwner({ type: 'field-recompute' }));
      break;

    case CommandType.SET_SURFACE:
      effects.push(withOwner({ type: 'camera-refit' }));
      break;

    default:
      break;
  }

  return effects;
}
