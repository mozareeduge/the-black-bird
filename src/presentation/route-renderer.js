// Route aperture (compact strip) + modal (expanded drawer), and the two
// independent clear controls (T19, T-REQ-010/011). D-DEC-10/22: the drawer
// always renders the complete, unwindowed session history; the strip only
// ever shows a caller-supplied, non-destructive aperture selection over it.
// Aperture *selection* (which events count as "leading"/"tail", and how many
// fit before the strip collapses) is viewport-dependent and stays the
// caller's concern -- this module only turns an already-selected aperture
// into DOM, matching the RouteEvent shape from domain/route.js:
// { sequence, id, type, label, fromId, source, committedAt }.
export function createRouteRenderer({
  stripContainer,
  drawerContainer,
  labelOf,
  shortLabelOf,
  onReplay,
  onDrawerReplay,
  onClearRoute,
  onOpenDrawer,
  onHoverStart,
  onHoverEnd,
}) {
  function emptyNotice(text) {
    const span = document.createElement('span');
    span.className = 'route-empty';
    span.textContent = text;
    return span;
  }

  function separator() {
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '·';
    return sep;
  }

  function routeButton(ev, extraClass = '') {
    const btn = document.createElement('button');
    btn.className = `route-item ${extraClass}`.trim();
    btn.dataset.routeIndex = String(ev.sequence);
    btn.dataset.id = ev.id;
    btn.title = labelOf(ev.id);
    btn.textContent = shortLabelOf(ev.id);
    btn.onclick = () => onReplay(ev.id, ev.sequence);
    if (onHoverStart) btn.onmouseenter = () => onHoverStart(ev.id);
    if (onHoverEnd) btn.onmouseleave = () => onHoverEnd();
    return btn;
  }

  // `aperture` is { leading: RouteEvent[], tail: RouteEvent[], collapsed }
  // (the same shape the live strip's own viewport-aware selection produces).
  function renderStrip(route, aperture) {
    stripContainer.replaceChildren();
    if (!route.length) {
      stripContainer.appendChild(emptyNotice('route is empty'));
      return;
    }
    const appendWithSep = (node) => {
      if (stripContainer.children.length) stripContainer.appendChild(separator());
      stripContainer.appendChild(node);
    };
    aperture.leading.forEach((ev) => stripContainer.appendChild(routeButton(ev)));
    if (aperture.collapsed) {
      const ellipsis = document.createElement('button');
      ellipsis.className = 'route-ellipsis';
      ellipsis.dataset.routeOpen = '1';
      ellipsis.title = 'show route';
      ellipsis.textContent = '···';
      ellipsis.onclick = () => {
        renderDrawer(route);
        if (onOpenDrawer) onOpenDrawer();
      };
      appendWithSep(ellipsis);
    }
    aperture.tail.forEach((ev, i) => appendWithSep(routeButton(ev, i === aperture.tail.length - 1 ? 'current' : '')));
    const clearBtn = document.createElement('button');
    clearBtn.className = 'clear-route';
    clearBtn.setAttribute('aria-label', 'clear route');
    clearBtn.textContent = 'clear';
    clearBtn.onclick = () => onClearRoute();
    stripContainer.appendChild(clearBtn);
  }

  // D-DEC-10/22: the drawer is the one surface that always exposes the
  // complete session history, however long it has grown -- never windowed.
  function renderDrawer(route) {
    drawerContainer.replaceChildren();
    if (!route.length) {
      drawerContainer.appendChild(emptyNotice('route is empty'));
      return;
    }
    route.forEach((ev, i) => {
      const row = document.createElement('div');
      row.className = 'route-row';
      row.dataset.id = ev.id;
      row.dataset.routeIndex = String(ev.sequence);
      const index = document.createElement('div');
      index.className = 'route-row-index';
      index.textContent = String(i + 1).padStart(2, '0');
      const label = document.createElement('div');
      label.className = 'route-row-label';
      label.textContent = labelOf(ev.id);
      row.append(index, label);
      row.onclick = () => onDrawerReplay(ev.id, ev.sequence);
      drawerContainer.appendChild(row);
    });
  }

  return { renderStrip, renderDrawer };
}
