import { isNodeVisible, restoreVisibility } from '../domain/visibility.js';

// View drawer: per-type toggles + projected/labels/sourceNames options, and
// the explicit, recoverable all-hidden state (T20, T-REQ-026, D-DEC-09). No
// silent View mutation happens here -- every change is one onSetTypeVisibility
// / onSetViewOption / onRestoreField callback the caller dispatches as a command.
export function createViewRenderer({ container, copy, onSetTypeVisibility, onSetViewOption, onRestoreField }) {
  const TYPES = ['RNO', 'MNO', 'FO', 'NameO', 'RefO', 'RelO'];

  function renderTypeToggle(type, view) {
    const btn = document.createElement('button');
    btn.className = 'view-toggle';
    btn.dataset.objectType = type;
    btn.setAttribute('aria-pressed', String(view.typeVisibility[type] !== false));
    btn.textContent = type;
    btn.onclick = () => onSetTypeVisibility(type, !(view.typeVisibility[type] !== false));
    return btn;
  }

  function renderOptionToggle(option, label, view) {
    const btn = document.createElement('button');
    btn.className = 'view-option';
    btn.dataset.option = option;
    btn.setAttribute('aria-pressed', String(!!view[option]));
    btn.textContent = label;
    btn.onclick = () => onSetViewOption(option, !view[option]);
    return btn;
  }

  function render(view) {
    container.replaceChildren();
    const typeRow = document.createElement('div');
    typeRow.className = 'view-type-row';
    for (const type of TYPES) typeRow.appendChild(renderTypeToggle(type, view));
    container.appendChild(typeRow);

    const optionRow = document.createElement('div');
    optionRow.className = 'view-option-row';
    optionRow.append(
      renderOptionToggle('projectedEdges', 'projected', view),
      renderOptionToggle('labels', 'labels', view),
      renderOptionToggle('sourceNames', 'source names', view)
    );
    container.appendChild(optionRow);

    const allHidden = TYPES.every((t) => view.typeVisibility[t] === false);
    if (allHidden) container.appendChild(renderAllHiddenNotice());
  }

  // D-DEC-09: explicit, local, one-action recovery -- never a silent revert.
  function renderAllHiddenNotice() {
    const notice = document.createElement('div');
    notice.className = 'all-hidden-notice';
    notice.setAttribute('role', 'status');
    const title = document.createElement('div');
    title.className = 'notice-title';
    title.textContent = copy.states.allHiddenTitle;
    const body = document.createElement('div');
    body.className = 'notice-body';
    body.textContent = copy.states.allHiddenBody;
    const restore = document.createElement('button');
    restore.className = 'tool-btn';
    restore.textContent = copy.actions.restoreField;
    restore.onclick = onRestoreField;
    notice.append(title, body, restore);
    return notice;
  }

  return { render, isNodeVisible, restoreVisibility };
}
