// Reader renderer (T18, T-REQ-024). Builds Reader content in a detached
// container first; the live container is only ever touched if the owning
// transaction is still active at commit time -- a stale build never
// overwrites newer presentation (P-RULE-021).

const ARABIC_RUN = /[؀-ۿ]+/g;
const ARABIC_TEST = /[؀-ۿ]/;

function isArabicScript(s) {
  return ARABIC_TEST.test(s || '');
}

// Short label for chips/index items (the compact cross-reference form).
function shortLabelOf(id, nodesById) {
  const n = nodesById[id];
  return n ? n.shortLabel || n.label : id;
}

// Full label for the projected-edge head (the reading-facing form).
function fullLabelOf(id, nodesById) {
  return nodesById[id]?.label || id;
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sectionLabel(text, doc) {
  return el(doc, 'div', 'section-label', text);
}

function chipSpan(id, nodesById, doc) {
  const chip = el(doc, 'span', 'chip', shortLabelOf(id, nodesById));
  chip.dataset.id = id;
  return chip;
}

function chipRow(ids, nodesById, doc) {
  const row = el(doc, 'div', 'chip-row');
  for (const id of ids) row.appendChild(chipSpan(id, nodesById, doc));
  return row;
}

// Reader cross-reference lists are reading-facing (H-VIS/P2): they must carry
// the full canonical label -- including the full opaque RelO id, since a
// RelO's canonical `label` *is* its opaque id -- never the compact
// `shortLabel` chip form.
function indexList(ids, nodesById, doc) {
  const list = el(doc, 'div', 'index-list');
  for (const id of ids) {
    const item = el(doc, 'div', 'index-item');
    item.dataset.id = id;
    item.appendChild(el(doc, 'div', 'idx-type', nodesById[id]?.type || ''));
    item.appendChild(el(doc, 'div', 'idx-title', fullLabelOf(id, nodesById)));
    list.appendChild(item);
  }
  return list;
}

function metaBlock(node, doc) {
  const wrap = doc.createDocumentFragment();
  wrap.appendChild(el(doc, 'div', 'meta', `${node.type} · ${node.id}`));
  wrap.appendChild(el(doc, 'div', 'title', node.label));
  return wrap;
}

// Appends `text` to `parent`, wrapping any Arabic-script run in the same
// lang="ar" dir="rtl" span the live inline-link text carries -- so RTL runs
// inside otherwise-LTR gloss/source-layer prose still shape and align
// correctly (matches the previous inline wrapScriptSpans() behavior).
function appendArabicWrapped(parent, text, doc) {
  const s = text || '';
  let lastIndex = 0;
  let m;
  ARABIC_RUN.lastIndex = 0;
  while ((m = ARABIC_RUN.exec(s)) !== null) {
    if (m.index > lastIndex) parent.appendChild(doc.createTextNode(s.slice(lastIndex, m.index)));
    const span = el(doc, 'span', 'bb-arabic', m[0]);
    span.lang = 'ar';
    span.dir = 'rtl';
    parent.appendChild(span);
    lastIndex = ARABIC_RUN.lastIndex;
  }
  if (lastIndex < s.length) parent.appendChild(doc.createTextNode(s.slice(lastIndex)));
}

function buildTextContent(vm, nodesById, doc) {
  const root = doc.createDocumentFragment();
  root.appendChild(metaBlock(vm.node, doc));

  if (vm.node.type === 'MNO') {
    // DATA.texts[id].body is trusted canonical content (authored inline
    // markup like <span class="fl" data-id="...">), not user input -- same
    // trust boundary the live app already uses for this exact field.
    const bodyWrap = doc.createElement('div');
    bodyWrap.style.marginBottom = '8px';
    bodyWrap.innerHTML = vm.body;
    const disclosure = el(doc, 'div', 'disclosure');
    const toggle = el(doc, 'button', null, `objects ${vm.objects.length}`);
    toggle.id = 'toggleObjects';
    toggle.type = 'button';
    toggle.style.fontSize = '10px';
    toggle.style.letterSpacing = '.18em';
    const objectsBox = el(doc, 'div', 'chip-row');
    objectsBox.id = 'mnoObjects';
    objectsBox.style.display = 'none';
    vm.objects.forEach((id) => objectsBox.appendChild(chipSpan(id, nodesById, doc)));
    disclosure.append(toggle, objectsBox);
    root.append(bodyWrap, disclosure);
    return root;
  }

  const prose = el(doc, 'div', 'prose');
  const p = doc.createElement('p');
  p.innerHTML = vm.body;
  prose.appendChild(p);
  root.appendChild(prose);
  if (vm.refs.length) {
    root.appendChild(sectionLabel('references', doc));
    root.appendChild(chipRow(vm.refs, nodesById, doc));
  }
  root.appendChild(sectionLabel('objects', doc));
  root.appendChild(chipRow(vm.objects, nodesById, doc));
  return root;
}

function buildFoContent(vm, nodesById, doc) {
  const root = doc.createDocumentFragment();
  root.appendChild(metaBlock(vm.node, doc));
  if (vm.appearsIn.length) {
    root.appendChild(sectionLabel('appears in', doc));
    root.appendChild(indexList(vm.appearsIn, nodesById, doc));
  }
  if (vm.sourceNames.length) {
    root.appendChild(sectionLabel('source names', doc));
    root.appendChild(indexList(vm.sourceNames, nodesById, doc));
  }
  if (vm.relos.length) {
    root.appendChild(sectionLabel('relation objects', doc));
    root.appendChild(indexList(vm.relos, nodesById, doc));
  }
  return root;
}

function buildNameoContent(vm, nodesById, doc) {
  const root = doc.createDocumentFragment();
  root.appendChild(metaBlock(vm.node, doc));
  if (isArabicScript(vm.node.label)) {
    const label = el(doc, 'p', 'bb-arabic', vm.node.label);
    label.lang = 'ar';
    label.dir = 'rtl';
    root.appendChild(label);
  }
  const prose = el(doc, 'div', 'prose');
  const layer = doc.createElement('p');
  appendArabicWrapped(layer, vm.sourceLayer, doc);
  const gloss = doc.createElement('p');
  appendArabicWrapped(gloss, vm.gloss, doc);
  prose.append(layer, gloss);
  root.appendChild(prose);
  root.appendChild(sectionLabel('attached objects', doc));
  root.appendChild(indexList(vm.attached, nodesById, doc));
  return root;
}

function buildRefoContent(vm, nodesById, doc) {
  const root = doc.createDocumentFragment();
  root.appendChild(metaBlock(vm.node, doc));
  root.appendChild(el(doc, 'div', 'ref-citation', vm.citation));

  if (vm.sources && vm.sources.length) {
    for (const s of vm.sources) {
      if (s.url) {
        const a = el(doc, 'a', 'source-row', `${s.label} ↗`);
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener';
        root.appendChild(a);
      } else {
        const span = el(doc, 'span', 'source-row', s.label);
        span.style.opacity = '.5';
        span.style.cursor = 'default';
        root.appendChild(span);
      }
    }
    if (vm.statusNote) {
      const note = el(doc, 'div', null, vm.statusNote);
      note.style.fontFamily = 'var(--mono)';
      note.style.fontSize = '10px';
      note.style.color = 'var(--ghost)';
      note.style.marginTop = '10px';
      note.style.letterSpacing = '.08em';
      root.appendChild(note);
    }
  } else if (vm.url) {
    const a = el(doc, 'a', 'source-row', `${vm.status || 'source'} ↗`);
    a.href = vm.url;
    a.target = '_blank';
    a.rel = 'noopener';
    root.appendChild(a);
  } else {
    const span = el(doc, 'span', 'source-row', vm.status || 'bibliographic reference');
    span.style.opacity = '.45';
    span.style.cursor = 'default';
    span.style.borderBottom = '0';
    root.appendChild(span);
  }

  if (vm.linkedNotes.length) {
    root.appendChild(sectionLabel('linked notes', doc));
    root.appendChild(indexList(vm.linkedNotes, nodesById, doc));
  }
  return root;
}

function buildReloContent(vm, nodesById, doc) {
  const root = doc.createDocumentFragment();
  root.appendChild(el(doc, 'div', 'meta', `RelO · ${vm.node.id}`));
  root.appendChild(sectionLabel('objects', doc));
  root.appendChild(indexList(vm.participants, nodesById, doc));
  return root;
}

function buildObjectContent(vm, nodesById, doc = document) {
  if (vm.subtype === 'text') return buildTextContent(vm, nodesById, doc);
  if (vm.subtype === 'fo') return buildFoContent(vm, nodesById, doc);
  if (vm.subtype === 'nameo') return buildNameoContent(vm, nodesById, doc);
  if (vm.subtype === 'refo') return buildRefoContent(vm, nodesById, doc);
  if (vm.subtype === 'relo') return buildReloContent(vm, nodesById, doc);
  return doc.createDocumentFragment();
}

function buildProjectedEdgeContent(vm, nodesById, doc = document) {
  const root = doc.createDocumentFragment();
  root.appendChild(el(doc, 'div', 'meta', 'Projected edge'));
  root.appendChild(
    el(doc, 'div', 'edge-head', `${fullLabelOf(vm.sourceId, nodesById)} ↔ ${fullLabelOf(vm.targetId, nodesById)}`)
  );
  root.appendChild(sectionLabel('generated by', doc));
  root.appendChild(indexList(vm.relOIds, nodesById, doc));
  return root;
}

const ORIENTATION_TITLES = { statement: 'Statement', how: 'How to read', types: 'Object types', sources: 'Sources' };

function buildOrientationContent(vm, doc = document) {
  const root = doc.createDocumentFragment();
  root.appendChild(el(doc, 'div', 'meta', 'Index'));
  root.appendChild(el(doc, 'div', 'title', ORIENTATION_TITLES[vm.section] || 'Index'));
  const prose = el(doc, 'div', 'prose');
  for (const para of (vm.text || '').split('\n\n')) {
    const p = doc.createElement('p');
    const lines = para.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) p.appendChild(doc.createElement('br'));
      p.appendChild(doc.createTextNode(line));
    });
    prose.appendChild(p);
  }
  root.appendChild(prose);
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
