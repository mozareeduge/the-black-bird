// Trace renderer (T17, T-REQ-030): Route, wear, and afterglow as three
// separate, non-confusable render layers on the live field -- Route uses a
// neutral silver/bone mark; wear is a distinct amber gradient; afterglow is
// its own soft departure residue. Formulas are an exact extraction of
// src/app.js's ROUTE_MARK_COLOR/updateRouteHalos, wearColorScale/
// wearOpacityFor/updateWearOverlay, and updateAfterglowOverlay -- this file
// was written against an earlier, since-superseded material design (a fixed
// wear color, a deadline-recomputed afterglow snapshot) and is strengthened
// here to match what the live field actually renders, not the stub it
// previously was. d3 is loaded globally (vendor/d3.v7.9.0.min.js), matching
// every other presentation module in this codebase.

export const ROUTE_MARK_COLOR = '#a89f8f';
export const WEAR_COLOR_FROM = '#6b6258';
export const WEAR_COLOR_TO = '#c49a45';

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

export function wearOpacityFor(count) {
  return count ? Math.min(0.85, 0.14 + count * 0.1) : 0;
}

// Wear: an edge material, an amber gradient capped at wearMax passes --
// entirely separate DOM/material from route halos (which mark nodes) or
// afterglow (which marks departure residue).
export function wearEdgeStyle(count, wearColorScale, wearMax = 7) {
  return {
    stroke: wearColorScale(Math.min(1, count / wearMax)),
    strokeOpacity: wearOpacityFor(count),
    strokeWidth: count ? Math.min(1.6, 0.5 + count * 0.12) : 0.5,
  };
}

export function createTraceRenderer({ d3: d3Lib = globalThis.d3 } = {}) {
  const wearColorScale = d3Lib.interpolateRgb(WEAR_COLOR_FROM, WEAR_COLOR_TO);

  // nodeSelection: the live selection to style directly (already narrowed to
  // .node-route-halo, and already carrying any transition the caller wants);
  // routeStatFor(d) returns this node's { count, minAge } route-recency
  // stat, or undefined.
  function applyRouteHalos(nodeSelection, routeStatFor) {
    return nodeSelection
      .attr('stroke', (d) => routeHaloStyle(routeStatFor(d)).stroke)
      .attr('stroke-opacity', (d) => routeHaloStyle(routeStatFor(d)).strokeOpacity)
      .attr('stroke-width', (d) => routeHaloStyle(routeStatFor(d)).strokeWidth);
  }

  // edgeSelection: the live wear-edge d3 selection; wearCountFor(d) returns
  // this edge's recorded pass count.
  function applyWearEdges(edgeSelection, wearCountFor, wearMax = 7) {
    return edgeSelection
      .attr('stroke', (d) => wearEdgeStyle(wearCountFor(d), wearColorScale, wearMax).stroke)
      .attr('stroke-opacity', (d) => wearEdgeStyle(wearCountFor(d), wearColorScale, wearMax).strokeOpacity)
      .attr('stroke-width', (d) => wearEdgeStyle(wearCountFor(d), wearColorScale, wearMax).strokeWidth);
  }

  // layer: the live SVG <g> afterglow circles join into. afterglows:
  // state.trace.afterglows entries { id, deadline, totalMs }. nodesById
  // resolves each entry's node for position. Each circle fades from opacity
  // 1 to 0 over its own totalMs via a one-shot transition set up once on
  // entry -- not a per-frame recompute against `deadline` -- so it never
  // needs polling to look right. Returns the still-live afterglow data so
  // the caller can update its own node-level "has an active afterglow" flag.
  function renderAfterglowLayer(layer, afterglows, nodesById, { isMobile = false, reducedMotion = false, now = Date.now(), nodeX, nodeY } = {}) {
    const data = afterglows
      .filter((a) => a.deadline > now)
      .map((a) => ({ ...a, node: nodesById[a.id] }))
      .filter((a) => a.node);
    const sel = layer.selectAll('circle.bb-afterglow').data(data, (d) => d.id);
    sel.exit().remove();
    const residueR = isMobile ? 46 : 64; // soft residue, larger than the body -- not a ring hugging its edge
    const enter = sel
      .enter()
      .append('circle')
      .attr('class', 'bb-afterglow')
      .attr('fill', 'url(#bb-afterglow-gradient)')
      .attr('pointer-events', 'none')
      .attr('cx', (d) => nodeX(d.node))
      .attr('cy', (d) => nodeY(d.node))
      .attr('r', residueR)
      .attr('opacity', 1);
    enter
      .merge(sel)
      .transition()
      .duration(reducedMotion ? 0 : (d) => d.totalMs)
      .ease(d3Lib.easeLinear)
      .attr('opacity', 0);
    return data;
  }

  return { applyRouteHalos, applyWearEdges, renderAfterglowLayer, wearColorScale };
}
