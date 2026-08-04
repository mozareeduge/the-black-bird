// Reader renderer (T18, T-REQ-024). Builds Reader content in a detached
// container first; the live container is only ever touched if the owning
// transaction is still active at commit time -- a stale build never
// overwrites newer presentation (P-RULE-021).

function labelOf(id, nodesById) {
  const n = nodesById[id];
  return n ? n.shortLabel || n.label : id;
}

function chipRow(ids, nodesById) {
  const row = document.createElement('div');
  row.className = 'chip-row';
  for (const id of ids) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.id = id;
    chip.textContent = labelOf(id, nodesById);
    row.appendChild(chip);
  }
  return row;
}

function metaBlock(node) {
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${node.type} · ${node.id}`;
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = node.label;
  const wrap = document.createDocumentFragment();
  wrap.append(meta, title);
  return wrap;
}

// DATA.texts[id].body is trusted canonical content (authored inline markup
// like <span class="fl" data-id="...">), not user input -- same trust
// boundary the live app already uses for this exact field.
function buildObjectContent(vm, nodesById, doc = document) {
  const root = doc.createDocumentFragment();
  root.appendChild(metaBlock(vm.node));

  if (vm.subtype === 'text') {
    const prose = document.createElement('div');
    prose.className = 'prose';
    const p = document.createElement('p');
    p.innerHTML = vm.body;
    prose.appendChild(p);
    root.appendChild(prose);
    if (vm.refs.length) root.appendChild(chipRow(vm.refs, nodesById));
    root.appendChild(chipRow(vm.objects, nodesById));
  } else if (vm.subtype === 'fo') {
    if (vm.appearsIn.length) root.appendChild(chipRow(vm.appearsIn, nodesById));
    if (vm.sourceNames.length) root.appendChild(chipRow(vm.sourceNames, nodesById));
    if (vm.relos.length) root.appendChild(chipRow(vm.relos, nodesById));
  } else if (vm.subtype === 'nameo') {
    const prose = document.createElement('div');
    prose.className = 'prose';
    const layer = document.createElement('p');
    layer.textContent = vm.sourceLayer;
    const gloss = document.createElement('p');
    gloss.textContent = vm.gloss;
    prose.append(layer, gloss);
    root.appendChild(prose);
    root.appendChild(chipRow(vm.attached, nodesById));
  } else if (vm.subtype === 'refo') {
    const citation = document.createElement('div');
    citation.className = 'ref-citation';
    citation.textContent = vm.citation;
    root.appendChild(citation);
    if (vm.url) {
      const a = document.createElement('a');
      a.className = 'source-row';
      a.href = vm.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = vm.status || 'source';
      root.appendChild(a);
    }
    if (vm.linkedNotes.length) root.appendChild(chipRow(vm.linkedNotes, nodesById));
  } else if (vm.subtype === 'relo') {
    root.appendChild(chipRow(vm.participants, nodesById));
  }
  return root;
}

function buildProjectedEdgeContent(vm, nodesById, doc = document) {
  const root = doc.createDocumentFragment();
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = 'Projected edge';
  const head = document.createElement('div');
  head.className = 'edge-head';
  head.textContent = `${labelOf(vm.sourceId, nodesById)} ↔ ${labelOf(vm.targetId, nodesById)}`;
  root.append(meta, head, chipRow(vm.relOIds, nodesById));
  return root;
}

function buildOrientationContent(vm, doc = document) {
  const root = doc.createDocumentFragment();
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = 'Index';
  const prose = document.createElement('div');
  prose.className = 'prose';
  for (const para of vm.text.split('\n\n')) {
    const p = document.createElement('p');
    p.textContent = para;
    prose.appendChild(p);
  }
  root.append(meta, prose);
  return root;
}

export function buildReaderContent(viewModel, nodesById, doc = document) {
  if (viewModel.kind === 'object') return buildObjectContent(viewModel, nodesById, doc);
  if (viewModel.kind === 'projected-edge') return buildProjectedEdgeContent(viewModel, nodesById, doc);
  return buildOrientationContent(viewModel, doc);
}

// Split so the atomicity/txId gate is testable without a real DOM: `build`
// runs unconditionally (detached, side-effect-free until commit), and the
// result only reaches `container` if the transaction is still active.
export function createReaderRenderer({ container, isActive, build }) {
  function commit(viewModel, txId) {
    const content = build(viewModel);
    if (!isActive(txId)) return { committed: false };
    if (container.replaceChildren) container.replaceChildren(content);
    else {
      container.innerHTML = '';
      container.appendChild(content);
    }
    return { committed: true };
  }
  return { commit };
}
