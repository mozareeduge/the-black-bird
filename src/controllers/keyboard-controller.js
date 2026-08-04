// Keyboard input (T22, T-REQ-036): Enter commits the roving-focus node
// directly -- the pointer solver (src/layout/pointer-ownership.js) is never
// consulted, matching T16's "keyboard bypasses pointer solver". Arrow keys
// move the roving target via a caller-supplied, deterministic direction
// resolver. Escape tries dismiss handlers in order (tooltip, then modal,
// then transient preview -- algorithm-contracts.json#modals.escape) and
// stops at the first one that actually dismissed something, so a single
// Escape press never ambiguously closes two things at once (T-REQ-035).
const DIRECTIONS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

export function createKeyboardController({ surface, focusManager, onCommitRoving, onDirectional, dismissHandlers = [] }) {
  function onEscape() {
    for (const handler of dismissHandlers) {
      if (handler()) return true;
    }
    return false;
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      onEscape();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      const id = focusManager.getRovingTarget();
      if (id != null) onCommitRoving(id);
      return;
    }
    const dir = DIRECTIONS[e.key];
    if (dir) {
      e.preventDefault?.();
      onDirectional(dir[0], dir[1]);
    }
  }

  function start() {
    surface.addEventListener('keydown', onKeydown);
  }
  function stop() {
    surface.removeEventListener('keydown', onKeydown);
  }

  return { start, stop, onEscape };
}
