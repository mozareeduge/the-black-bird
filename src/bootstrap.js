const REQUIRED_DATA_KEYS = ['nodes', 'texts', 'nameos', 'refs', 'relations', 'meta', 'docs', 'ui'];
const REQUIRED_NODE_TYPES = ['FO', 'MNO', 'NameO', 'RNO', 'RefO', 'RelO'];

export function validateBootstrap({ data, hasD3 }) {
  if (!hasD3) return { ok: false, reason: 'runtime-missing' };
  if (!data || typeof data !== 'object') return { ok: false, reason: 'invalid-data' };
  if (REQUIRED_DATA_KEYS.some((k) => !(k in data))) return { ok: false, reason: 'invalid-data' };
  if (!Array.isArray(data.nodes) || data.nodes.length !== 50) return { ok: false, reason: 'invalid-data' };
  const ids = data.nodes.map((n) => n && n.id);
  if (new Set(ids).size !== 50 || ids.some((id) => typeof id !== 'string' || !id)) {
    return { ok: false, reason: 'invalid-data' };
  }
  const types = new Set(data.nodes.map((n) => n && n.type));
  if (!REQUIRED_NODE_TYPES.every((t) => types.has(t))) return { ok: false, reason: 'invalid-data' };
  return { ok: true };
}
