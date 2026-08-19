import worldLayout from '../data/world-layout.json' with { type: 'json' };

// Stable neutral world (T12, T-REQ-014/015): checked-in authored coordinates,
// not runtime physics. No d3.forceSimulation, no drag — the world is data.
export const WORLD = Object.freeze({ ...worldLayout.world });

export const AUTHORED_HOMES = Object.freeze(
  Object.fromEntries(worldLayout.nodes.map((n) => [n.id, Object.freeze({ x: n.x, y: n.y, cluster: n.cluster })]))
);

export function homeFor(id) {
  return AUTHORED_HOMES[id] || null;
}
