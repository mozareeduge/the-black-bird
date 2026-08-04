// Field renderer (T17, T-REQ-029/031): morphology, aperture, RelO clearing,
// canonical body shapes. Extracted from the already-live, already-tested
// rendering rules in src/app.js (nodeMetrics/morphologyOf/nodeShape) -- exact
// metrics match .bb-authority/contracts/visual-tokens.json#morphology. Pure
// geometry/morphology functions are the primary, testable surface;
// createFieldRenderer is a thin D3-shaped factory for future wiring.

export function isApertureNode(node) {
  return node.id === 'FO.BLACK_BIRD_FIELD';
}

export function morphologyOf(node) {
  return isApertureNode(node) ? 'aperture' : node.type.toLowerCase();
}

// Exact morphology metrics: FO coreR=6.4; RNO coreR=6.0/outerR=11.5; MNO mean
// radius 7.4; RefO diamond 9x9 (half-diagonal outerR = 4.5*sqrt2); RelO
// hollow ring r=8.5; aperture core r=9.5 / rim r=11.
export function computeNodeMetrics(node) {
  if (isApertureNode(node)) {
    return radiiOf('aperture', 9.5, 11);
  }
  switch (node.type) {
    case 'RNO':
      return radiiOf('rno', 6.0, 11.5);
    case 'MNO':
      return radiiOf('mno', 7.4, 7.4);
    case 'NameO':
      return radiiOf('nameo', 0, 5);
    case 'RefO':
      return radiiOf('refo', 4.5, 4.5 * Math.SQRT2);
    case 'RelO':
      return radiiOf('relo', 8.5, 8.5);
    default:
      return radiiOf('fo', 6.4, 6.4);
  }
}

function radiiOf(role, coreR, outerR) {
  return {
    role,
    coreR,
    outerR,
    hitR: outerR + 9,
    collideR: outerR + 9,
    labelOffset: outerR + 9,
    haloR: outerR + 6,
    focusR: outerR + 8,
  };
}

// The full six canonical morphologies plus the aperture role, in one place
// so a caller (or a test) can assert every one is accounted for exactly.
export const CANONICAL_MORPHOLOGIES = Object.freeze(['fo', 'rno', 'mno', 'nameo', 'refo', 'relo', 'aperture']);

// A D3-shaped factory (duck-typed: `container` needs append/attr/selectAll/
// data/join, matching a real d3.Selection). Builds the same per-node body
// structure as the live nodeShape(): a route-halo ring, a focus ring, a
// type-specific body (or aperture core+rim), and an invisible hit circle --
// nothing here decides layout position; it only shapes and classes each node.
export function createFieldRenderer(container) {
  function renderNode(g, node) {
    const m = computeNodeMetrics(node);
    g.append('circle').attr('class', 'node-route-halo').attr('r', m.haloR).attr('fill', 'none').attr('stroke', 'transparent');
    g.append('circle')
      .attr('class', 'node-focus-ring')
      .attr('r', m.focusR)
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('vector-effect', 'non-scaling-stroke');

    if (isApertureNode(node)) {
      g.append('circle')
        .attr('class', 'bb-aperture-rim')
        .attr('r', m.outerR)
        .attr('vector-effect', 'non-scaling-stroke');
      g.append('circle').attr('class', 'bb-aperture-core').attr('r', m.coreR);
    } else if (node.type === 'RNO') {
      g.append('circle')
        .attr('class', 'bb-rno-ring')
        .attr('r', m.outerR)
        .attr('fill', 'none')
        .attr('vector-effect', 'non-scaling-stroke');
      g.append('circle').attr('class', 'bb-body').attr('r', m.coreR);
    } else if (node.type === 'MNO') {
      g.append('path').attr('class', 'bb-body');
    } else if (node.type === 'RefO') {
      const side = m.coreR * 2;
      g.append('rect')
        .attr('class', 'bb-body')
        .attr('width', side)
        .attr('height', side)
        .attr('x', -side / 2)
        .attr('y', -side / 2)
        .attr('transform', 'rotate(45)');
    } else if (node.type === 'RelO') {
      g.append('circle').attr('class', 'bb-body').attr('r', m.coreR).attr('fill', 'none').attr('vector-effect', 'non-scaling-stroke');
    } else if (node.type !== 'NameO') {
      g.append('circle').attr('class', 'bb-body').attr('r', m.coreR);
    }
    // NameO: textual body only, no visible geometric core -- matches the
    // live renderer exactly (hit target still present below).

    g.append('circle').attr('class', 'node-hit').attr('r', m.hitR);
    g.attr('data-bb-id', node.id)
      .attr('data-bb-type', node.type)
      .attr('data-bb-morphology', morphologyOf(node))
      .attr('data-bb-light', 'field')
      .attr('data-bb-afterglow', '0');
    return g;
  }

  function render(nodes) {
    return nodes.map((node) => renderNode(container.append('g').attr('class', 'node bb-node'), node));
  }

  return { render, renderNode, computeNodeMetrics, morphologyOf, isApertureNode };
}
