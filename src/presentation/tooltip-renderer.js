// One transient, singular tooltip (T22, T-REQ-034/035): hover/focus show,
// Escape/blur/leave hide, aria-describedby only while actually shown, safe
// on-screen placement, and association removed outright on invalid geometry
// rather than shown broken or off-screen.
export function createTooltipRenderer({ tooltipEl }) {
  let associatedId = null;
  let describedTarget = null;

  function place(x, y, bounds) {
    const w = tooltipEl.offsetWidth || 260;
    const h = tooltipEl.offsetHeight || 120;
    const m = 16;
    const boundsW = bounds?.width ?? Infinity;
    const boundsH = bounds?.height ?? Infinity;
    let left = x + 18;
    let top = y + 18;
    if (left + w > boundsW - m) left = x - w - 18;
    if (top + h > boundsH - m) top = y - h - 18;
    return { left: Math.max(m, left), top: Math.max(m, top) };
  }

  function show(node, x, y, opts = {}) {
    const { bounds, describedByTarget } = opts;
    tooltipEl.textContent = '';
    const title = document.createElement('div');
    title.className = 'micro-preview-title';
    title.textContent = node.label;
    tooltipEl.appendChild(title);
    if (node.meta) {
      const meta = document.createElement('div');
      meta.className = 'micro-preview-meta';
      meta.textContent = node.meta;
      tooltipEl.appendChild(meta);
    }
    const pos = place(x, y, bounds);
    tooltipEl.style.left = `${pos.left}px`;
    tooltipEl.style.top = `${pos.top}px`;
    tooltipEl.classList.add('visible');
    tooltipEl.setAttribute('aria-hidden', 'false');
    associatedId = node.id;
    describedTarget = describedByTarget || null;
    if (describedTarget && tooltipEl.id) describedTarget.setAttribute('aria-describedby', tooltipEl.id);
    return pos;
  }

  function hide() {
    tooltipEl.classList.remove('visible');
    tooltipEl.setAttribute('aria-hidden', 'true');
    associatedId = null;
    if (describedTarget) describedTarget.removeAttribute('aria-describedby');
    describedTarget = null;
  }

  // T-REQ-035: invalid geometry (NaN/negative/out-of-bounds) removes the
  // association entirely rather than rendering somewhere broken.
  function reconcileGeometry(x, y, bounds) {
    const boundsW = bounds?.width ?? Infinity;
    const boundsH = bounds?.height ?? Infinity;
    const valid = Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= boundsW && y <= boundsH;
    if (!valid) hide();
    return valid;
  }

  function isAssociatedWith(id) {
    return associatedId === id;
  }

  return { show, hide, place, reconcileGeometry, isAssociatedWith };
}
