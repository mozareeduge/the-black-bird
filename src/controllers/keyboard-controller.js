// Keyboard input (T22, T-REQ-036): Enter commits the roving-focus node
// directly -- the pointer solver (src/layout/pointer-ownership.js) is never
// consulted, matching T16's "keyboard bypasses pointer solver". Arrow keys
// move the roving target via a caller-supplied, deterministic direction
// resolver. Escape tries dismiss handlers in order (tooltip, then modal,
// then transient preview -- algorithm-contracts.json#modals.escape) and
// stops at the first one that actually dismissed something, so a single
// Escape press never ambiguously closes two things at once (T-REQ-035).
// `shouldHandleDirectional` is optional and gates Enter/Space/arrow-key
// activation only -- Escape is never gated by it, so a `surface` of
// `document` still dismisses from anywhere, but a `surface` that broadly
// reaches text inputs/buttons doesn't hijack their own Enter/arrow-key
// behavior.
const DIRECTIONS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

export function createKeyboardController({
  surface,
  focusManager,
  onCommitRoving,
  onDirectional,
  dismissHandlers = [],
  shouldHandleDirectional,
}) {
  function onEscape() {
    for (const handler of dismissHandlers) {
      if (handler()) return true;
    }
    return false;
  }

  function onKeydown(e) {
    // Escape always runs, everywhere `surface` reaches (D-DEC-20's "escape
    // works from anywhere") -- only Enter/Space/arrow-key roving activation
    // is scoped to the caller's shouldHandleDirectional, so a `surface` of
    // `document` never hijacks arrow-key text-cursor movement or Enter
    // inside an unrelated focused input/button.
    if (e.key === 'Escape') {
      onEscape();
      return;
    }
    if (shouldHandleDirectional && !shouldHandleDirectional(e)) return;
    if (e.key === 'Enter' || e.key === ' ') {
      // Space's default browser behavior is page-scroll; the focused node is
      // an SVG <g role="button">, which carries no native activation of its
      // own, so nothing else would suppress that scroll.
      e.preventDefault?.();
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
