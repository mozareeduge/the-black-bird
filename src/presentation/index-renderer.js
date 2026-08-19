import { isNodeVisible } from '../domain/visibility.js';

// Index: searchable object list with an explicit, recoverable no-results
// state, and hidden-by-View disclosure rather than silent omission (T20,
// T-REQ-026/027, D-DEC-09). Index Open never overrides a group-hidden type
// (P-RULE-016) -- it only clears an individual hide, via onOpen, which the
// caller is responsible for implementing as "remove objectVisibility[id]",
// never "force objectVisibility[id] = true".
// P-RULE-016: Index Open removes an individual hide on its target but never
// forces visibility true, so an intentionally disabled type group is never
// overridden -- isNodeVisible still returns false for a group-hidden target
// after this runs, exactly as required ("remains readable... must be
// disclosed as hidden by View").
export function clearIndividualHide(view, id) {
  if (view.objectVisibility[id] === undefined) return view;
  const objectVisibility = { ...view.objectVisibility };
  delete objectVisibility[id];
  return { ...view, objectVisibility };
}

// Row markup (.object-row/.otype/.olabel[data-open]/[data-eye]/[data-solo])
// matches the live app's existing rendering exactly, so no new CSS is
// needed for those; only the hidden-by-view badge and .no-results-notice
// (both previously designed and tested in isolation, but with no live
// trigger) are new.
export function createIndexRenderer({ container, copy, onOpen, onToggleVisible, onSolo, onHoverStart, onHoverEnd }) {
  function row(node, view) {
    const el = document.createElement('div');
    el.className = 'object-row';
    el.dataset.id = node.id;
    const visible = isNodeVisible(node, view);
    if (!visible) {
      el.classList.add('hidden-by-view');
      el.setAttribute('aria-label', `${node.label}, hidden by View`);
    }

    const type = document.createElement('div');
    type.className = 'otype';
    type.textContent = node.type;

    const title = document.createElement('div');
    title.className = 'olabel';
    title.dataset.open = node.id;
    title.append(node.label);
    title.onclick = () => onOpen(node.id);
    el.append(type, title);

    if (onToggleVisible) {
      const individuallyHidden = view.objectVisibility[node.id] === false;
      const eye = document.createElement('button');
      eye.className = 'icon-small';
      eye.dataset.eye = node.id;
      eye.textContent = individuallyHidden ? 'show' : 'hide';
      eye.onclick = () => onToggleVisible(node.id, individuallyHidden);
      el.appendChild(eye);
    }
    if (onSolo) {
      const solo = document.createElement('button');
      solo.className = 'icon-small';
      solo.dataset.solo = node.id;
      solo.textContent = 'solo';
      solo.onclick = () => onSolo(node.id);
      el.appendChild(solo);
    }
    if (!visible) {
      const badge = document.createElement('span');
      badge.className = 'idx-hidden-badge';
      badge.textContent = copy.states.hiddenByView;
      title.appendChild(badge);
    }
    if (onHoverStart) el.onmouseenter = () => onHoverStart(node.id);
    if (onHoverEnd) el.onmouseleave = () => onHoverEnd();
    return el;
  }

  function render(nodes, view, query = '') {
    container.replaceChildren();
    const q = query.trim().toLowerCase();
    const matches = q ? nodes.filter((n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)) : nodes;

    if (matches.length === 0) {
      const notice = document.createElement('div');
      notice.className = 'no-results-notice';
      notice.setAttribute('role', 'status');
      const title = document.createElement('div');
      title.className = 'notice-title';
      title.textContent = copy.states.noResultsTitle;
      const body = document.createElement('div');
      body.className = 'notice-body';
      body.textContent = copy.states.noResultsBody;
      notice.append(title, body);
      container.appendChild(notice);
      return;
    }
    for (const node of matches) container.appendChild(row(node, view));
  }

  return { render };
}
