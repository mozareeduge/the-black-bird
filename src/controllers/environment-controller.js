import { CommandType } from '../state/command-types.js';

// Breakpoint/orientation/visual-viewport observation (T11, T-REQ-040/041).
// D-DEC-19: one projection problem, reported through a single command —
// this controller never mutates state itself, only dispatches
// RECONCILE_ENVIRONMENT (route_policy/trace_policy: none), so semantic state
// is untouched by any responsive change (P-RULE-033).
export function computeProfile(width) {
  if (width < 700) return 'mobile';
  if (width < 1180) return 'compact-desktop';
  return 'desktop';
}

export function computeOrientation(width, height) {
  return height >= width ? 'portrait' : 'landscape';
}

export function createEnvironmentController({ dispatch, env }) {
  function reconcile() {
    const width = env.innerWidth;
    const height = env.innerHeight;
    const vv = env.visualViewport;
    dispatch({
      type: CommandType.RECONCILE_ENVIRONMENT,
      profile: computeProfile(width),
      orientation: computeOrientation(width, height),
      visualViewport: vv ? { width: vv.width, height: vv.height, offsetTop: vv.offsetTop || 0 } : null,
    });
  }

  function onResize() {
    reconcile();
  }

  function start() {
    env.addEventListener('resize', onResize);
    if (env.visualViewport && env.visualViewport.addEventListener) {
      env.visualViewport.addEventListener('resize', onResize);
    }
    reconcile();
  }

  function stop() {
    env.removeEventListener('resize', onResize);
    if (env.visualViewport && env.visualViewport.removeEventListener) {
      env.visualViewport.removeEventListener('resize', onResize);
    }
  }

  return { start, stop, reconcile };
}
