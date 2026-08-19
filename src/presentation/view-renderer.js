import { isNodeVisible, restoreVisibility } from '../domain/visibility.js';

// View drawer: per-type toggles + projected/labels/sourceNames options, and
// the explicit, recoverable all-hidden state (T20, T-REQ-026, D-DEC-09). No
// silent View mutation happens here -- every change is one onSetTypeVisibility
// / onSetViewOption / onRestoreField callback the caller dispatches as a
// command. `container` (a single container, for isolated testing) or the
// live app's own separate `typeContainer`/`optionContainer` -- the live
// Field View drawer already has two static sections ("Object groups",
// "View") with their own DOM ids, and this renderer populates whichever
// shape the caller gives it without assuming which. Toggle markup
// (.toggle-row/.switch) matches the live app's existing rendering exactly,
// so no new CSS is needed for those; only .all-hidden-notice (D-DEC-09's
// previously-unwired recovery affordance) is new.
export function createViewRenderer({
  container,
  typeContainer = container,
  optionContainer = container,
  copy,
  typeOrder,
  countType,
  viewOptionKeyMap = {},
  onSetTypeVisibility,
  onSetViewOption,
  onRestoreField,
}) {
  function optionValue(view, key) {
    return view[viewOptionKeyMap[key] || key];
  }

  function toggleRow(label, on, dataAttr, dataValue, onToggle) {
    const row = document.createElement('div');
    row.className = 'toggle-row';
    row.appendChild(label);
    const btn = document.createElement('button');
    btn.className = `switch${on ? ' on' : ''}`;
    btn.dataset[dataAttr] = dataValue;
    btn.setAttribute('aria-label', `toggle ${dataValue}`);
    btn.setAttribute('aria-pressed', String(on));
    btn.onclick = onToggle;
    row.appendChild(btn);
    return row;
  }

  function renderTypeToggle(type, view) {
    const label = document.createElement('span');
    const count = countType ? countType(type) : null;
    label.textContent = count == null ? type : `${type} `;
    if (count != null) {
      const countSpan = document.createElement('span');
      countSpan.style.color = 'var(--ghost)';
      countSpan.textContent = `(${count})`;
      label.appendChild(countSpan);
    }
    const on = view.typeVisibility[type] !== false;
    return toggleRow(label, on, 'type', type, () => onSetTypeVisibility(type, !on));
  }

  function renderOptionToggle(key, text, view) {
    const label = document.createElement('span');
    label.textContent = text;
    const on = !!optionValue(view, key);
    return toggleRow(label, on, 'view', key, () => onSetViewOption(key, !on));
  }

  function render(view) {
    const order = typeOrder || Object.keys(view.typeVisibility);
    const sameContainer = typeContainer === optionContainer;
    typeContainer.replaceChildren();
    if (!sameContainer) optionContainer.replaceChildren();

    typeContainer.append(...order.map((type) => renderTypeToggle(type, view)));
    optionContainer.append(
      renderOptionToggle('projected', 'Projected edges', view),
      renderOptionToggle('labels', 'Labels', view),
      renderOptionToggle('sourceNames', 'Source names', view)
    );

    if (order.every((t) => view.typeVisibility[t] === false)) {
      typeContainer.appendChild(renderAllHiddenNotice());
    }
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
