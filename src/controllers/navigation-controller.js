import { CommandType } from '../state/command-types.js';

// Field/Read chamber switching plus safe-area/visual-viewport reprojection
// (T24, T-REQ-040/041). D-DEC-19: breakpoint/orientation/safe-area/visual-
// viewport changes are one projection problem -- they only ever dispatch
// SET_SURFACE / RECONCILE_ENVIRONMENT, never touching reading anchor, Route,
// or trace (matching every other controller's DOM-observes-then-dispatches shape).
export function createNavigationController({ dispatch, env, doc }) {
  function setSurface(surface) {
    dispatch({ type: CommandType.SET_SURFACE, surface });
  }

  // T-REQ-041: the on-screen keyboard changes the *visual* viewport, not the
  // layout viewport. Publishing its height as a CSS custom property lets
  // keyboard-aware surfaces (Index search, modal controls) stay reachable
  // instead of being pushed under the keyboard by a stale 100vh/100dvh.
  function reconcileVisualViewport() {
    const vv = env.visualViewport;
    const height = vv ? vv.height : env.innerHeight;
    doc.documentElement.style.setProperty('--bb-visual-viewport-height', `${height}px`);
    dispatch({
      type: CommandType.RECONCILE_ENVIRONMENT,
      visualViewport: vv ? { width: vv.width, height: vv.height, offsetTop: vv.offsetTop || 0 } : null,
    });
  }

  // No redundant sheet: at most one surface ever presents a given object at
  // once. Opening/keeping the Read chamber for an object closes any legacy
  // bottom sheet that might otherwise be showing the same or stale content.
  function ensureNoRedundantSheet(sheetEl) {
    if (sheetEl && sheetEl.classList.contains('open')) {
      sheetEl.classList.remove('open');
      return true;
    }
    return false;
  }

  function onVisualViewportResize() {
    reconcileVisualViewport();
  }

  function start() {
    if (env.visualViewport) env.visualViewport.addEventListener('resize', onVisualViewportResize);
    reconcileVisualViewport();
  }
  function stop() {
    if (env.visualViewport) env.visualViewport.removeEventListener('resize', onVisualViewportResize);
  }

  return { setSurface, reconcileVisualViewport, ensureNoRedundantSheet, start, stop };
}
