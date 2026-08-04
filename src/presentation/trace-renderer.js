// Trace renderer (T17, T-REQ-030): Route, wear, and afterglow as three
// separate, non-confusable render layers. Route uses a neutral silver/bone
// mark; wear uses a distinct amber-brown; afterglow is its own soft residue.
// Materials extracted from src/app.js's ROUTE_MARK_COLOR / updateRouteHalos /
// recordDepartureAfterglow and src/styles/field.css's --bb-route-mark token.

export const ROUTE_MARK_COLOR = '#a89f8f';
export const WEAR_MARK_COLOR = '#9a6736'; // --bb-wear... (visual-tokens.json colors.wearUmber)
export const AFTERGLOW_RESIDUE = 'radial-soft'; // never the same shape/color family as route or wear

// Route halo: presence + recency/count-derived opacity and width, using
// ROUTE_MARK_COLOR only -- never the wear color.
export function routeHaloStyle(routeStat) {
  if (!routeStat) return { stroke: 'transparent', strokeOpacity: 0, strokeWidth: 1 };
  const { count, minAge } = routeStat;
  return {
    stroke: ROUTE_MARK_COLOR,
    strokeOpacity: Math.max(0.06, 0.28 - minAge * 0.025) + Math.min(0.12, (count - 1) * 0.04),
    strokeWidth: Math.min(2.2, 1 + (count - 1) * 0.25),
  };
}

// Wear: an edge material, amber-brown, capped by wearMax passes -- entirely
// separate DOM/material from route halos (which mark nodes) or afterglow
// (which marks departure residue).
export function wearEdgeStyle(passes, wearMax = 7) {
  const clamped = Math.min(passes, wearMax);
  return {
    stroke: WEAR_MARK_COLOR,
    strokeOpacity: Math.min(0.7, 0.15 + clamped * 0.07),
    strokeWidth: Math.min(3, 1 + clamped * 0.25),
  };
}

// Afterglow: a soft radial residue keyed to a wall-clock deadline, using
// neither ROUTE_MARK_COLOR nor WEAR_MARK_COLOR -- its own material family.
export function afterglowStyle(afterglow, nowMs = Date.now()) {
  const remainingMs = Math.max(0, afterglow.deadline - nowMs);
  const totalMs = afterglow.totalMs || 10000;
  const life = Math.min(1, remainingMs / totalMs);
  return {
    kind: AFTERGLOW_RESIDUE,
    opacity: 0.22 * life,
    radiusScale: 1 + (1 - life) * 0.6,
  };
}

export function createTraceRenderer(container) {
  function renderRouteHalo(nodeSelection, routeStat) {
    const style = routeHaloStyle(routeStat);
    return nodeSelection
      .select('.node-route-halo')
      .attr('stroke', style.stroke)
      .attr('stroke-opacity', style.strokeOpacity)
      .attr('stroke-width', style.strokeWidth);
  }

  function renderWearEdge(edgeSelection, passes, wearMax) {
    const style = wearEdgeStyle(passes, wearMax);
    return edgeSelection
      .attr('class', 'bb-wear')
      .attr('stroke', style.stroke)
      .attr('stroke-opacity', style.strokeOpacity)
      .attr('stroke-width', style.strokeWidth);
  }

  function renderAfterglow(afterglow, nowMs) {
    const style = afterglowStyle(afterglow, nowMs);
    return container
      .append('circle')
      .attr('class', 'bb-afterglow')
      .attr('opacity', style.opacity)
      .attr('data-bb-afterglow-kind', style.kind);
  }

  return { renderRouteHalo, renderWearEdge, renderAfterglow };
}
