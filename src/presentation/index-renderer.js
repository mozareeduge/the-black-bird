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

export function createIndexRenderer({ container, copy, onOpen, onHoverStart, onHoverEnd }) {
  function row(node, view) {
    const el = document.createElement('div');
    el.className = 'index-item';
    el.dataset.id = node.id;
    const visible = isNodeVisible(node, view);
    if (!visible) {
      el.classList.add('hidden-by-view');
      el.setAttribute('aria-label', `${node.label}, hidden by View`);
    }
    const type = document.createElement('div');
    type.className = 'idx-type';
    type.textContent = node.type;
    const title = document.createElement('div');
    title.className = 'idx-title';
    title.textContent = node.label;
    el.append(type, title);
    if (!visible) {
      const badge = document.createElement('span');
      badge.className = 'idx-hidden-badge';
      badge.textContent = copy.states.hiddenByView;
      el.appendChild(badge);
    }
    el.onmouseenter = () => onHoverStart && onHoverStart(node.id);
    el.onmouseleave = () => onHoverEnd && onHoverEnd();
    el.onclick = () => onOpen(node.id);
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
