import { selectRouteWindow } from '../domain/route.js';

// Route aperture (compact strip) + modal (expanded drawer), and the two
// independent clear controls (T19, T-REQ-010/011). D-DEC-10/22: the strip
// only ever shows a windowed view via selectRouteWindow (which never
// mutates or drops routeState.events); the drawer always renders every
// event. Clear Route and Clear field trace are wired to entirely separate
// callbacks -- neither can reach the other's state.
export function createRouteRenderer({ stripContainer, drawerContainer, labelOf, onReplay, onClearRoute, onClearTrace }) {
  function emptyNotice(text) {
    const span = document.createElement('span');
    span.className = 'route-empty';
    span.textContent = text;
    return span;
  }

  function routeButton(ev, extraClass = '') {
    const btn = document.createElement('button');
    btn.className = `route-item ${extraClass}`.trim();
    btn.dataset.routeIndex = String(ev.index);
    btn.dataset.id = ev.id;
    btn.title = labelOf(ev.id);
    btn.textContent = labelOf(ev.id);
    btn.onclick = () => onReplay(ev.index);
    return btn;
  }

  function renderStrip(routeState, opts = {}) {
    stripContainer.replaceChildren();
    if (!routeState.events.length) {
      stripContainer.appendChild(emptyNotice('route is empty'));
      return { windowed: null };
    }
    const windowed = selectRouteWindow(routeState, opts);
    windowed.events.forEach((ev, i) => {
      stripContainer.appendChild(routeButton(ev, i === windowed.events.length - 1 ? 'current' : ''));
    });
    if (windowed.truncated) {
      const ellipsis = document.createElement('button');
      ellipsis.className = 'route-ellipsis';
      ellipsis.title = 'show route';
      ellipsis.textContent = `··· (${windowed.hiddenCount} more)`;
      ellipsis.onclick = () => renderDrawer(routeState);
      stripContainer.insertBefore(ellipsis, stripContainer.children[Math.min(1, stripContainer.children.length)]);
    }
    const clearBtn = document.createElement('button');
    clearBtn.className = 'clear-route';
    clearBtn.setAttribute('aria-label', 'clear route');
    clearBtn.textContent = 'clear';
    clearBtn.onclick = () => onClearRoute();
    stripContainer.appendChild(clearBtn);
    return { windowed, clearButton: clearBtn };
  }

  // D-DEC-10/22: the drawer is the one surface that always exposes the
  // complete session history, however long it has grown -- never windowed.
  function renderDrawer(routeState) {
    drawerContainer.replaceChildren();
    if (!routeState.events.length) {
      drawerContainer.appendChild(emptyNotice('route is empty'));
      return;
    }
    routeState.events.forEach((ev, i) => {
      const row = document.createElement('div');
      row.className = 'route-row';
      row.dataset.id = ev.id;
      const index = document.createElement('div');
      index.className = 'route-row-index';
      index.textContent = String(i + 1).padStart(2, '0');
      const label = document.createElement('div');
      label.className = 'route-row-label';
      label.textContent = labelOf(ev.id);
      row.append(index, label);
      row.onclick = () => onReplay(ev.index);
      drawerContainer.appendChild(row);
    });
  }

  function renderClearTraceControl(target) {
    target.replaceChildren();
    const btn = document.createElement('button');
    btn.className = 'clear-trace';
    btn.setAttribute('aria-label', 'clear field trace');
    btn.textContent = 'clear field trace';
    btn.onclick = () => onClearTrace();
    target.appendChild(btn);
    return btn;
  }

  return { renderStrip, renderDrawer, renderClearTraceControl };
}
