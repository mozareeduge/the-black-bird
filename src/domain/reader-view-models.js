// Reader subject view models (T18, T-REQ-025). Three structurally distinct
// kinds -- object, projected-edge, orientation -- so the Reader can never
// confuse committed reading, transient edge inspection, and neutral
// orientation. Every field here is pulled directly from canonical DATA; none
// of this generates filler copy.

export function buildObjectViewModel(id, ctx) {
  const { nodesById, texts, nameos, refs, relations } = ctx;
  const node = nodesById[id];
  if (!node) return null;

  if (node.type === 'RNO' || node.type === 'MNO') {
    const t = texts[id];
    return { kind: 'object', subtype: 'text', node, body: t.body, refs: t.refs || [], objects: t.objects || [] };
  }
  if (node.type === 'FO') {
    const appearsIn = Object.entries(texts)
      .filter(([, t]) => (t.objects || []).includes(id))
      .map(([tid]) => tid);
    const sourceNames = Object.entries(nameos)
      .filter(([, no]) => (no.attached || []).includes(id))
      .map(([nid]) => nid);
    const relos = Object.entries(relations)
      .filter(([, parts]) => parts.includes(id))
      .map(([rid]) => rid);
    return { kind: 'object', subtype: 'fo', node, appearsIn, sourceNames, relos };
  }
  if (node.type === 'NameO') {
    const no = nameos[id];
    return { kind: 'object', subtype: 'nameo', node, sourceLayer: no.sourceLayer, gloss: no.gloss, attached: no.attached || [] };
  }
  if (node.type === 'RefO') {
    const r = refs[id];
    const linkedNotes = Object.entries(texts)
      .filter(([, t]) => (t.refs || []).includes(id))
      .map(([tid]) => tid);
    return {
      kind: 'object',
      subtype: 'refo',
      node,
      citation: r.citation,
      url: r.url || null,
      status: r.status || null,
      statusNote: r.statusNote || null,
      sources: r.sources || null,
      linkedNotes,
    };
  }
  if (node.type === 'RelO') {
    return { kind: 'object', subtype: 'relo', node, participants: relations[id] || [] };
  }
  return null;
}

// P-RULE-014: projected edges are derived, not canonical -- this model never
// carries a `node` at all, so it structurally cannot be mistaken for an
// object subject or imply a reading-anchor change.
export function buildProjectedEdgeViewModel(sourceId, targetId, relOIds) {
  return { kind: 'projected-edge', sourceId, targetId, relOIds: relOIds || [] };
}

export function buildOrientationViewModel(docs, section = 'statement') {
  return { kind: 'orientation', section, text: docs[section] || docs.statement };
}
