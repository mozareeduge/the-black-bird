// Modal shell mechanics (T21, T-REQ-032): genuinely inert background,
// focus trapped inside the active panel. One function per concern so the
// controller can compose them without owning DOM details itself.

const INERT_TARGETS_SELECTOR = '.rail, #mainLayout, .bottom-nav';

export function setBackgroundInert(doc, inert) {
  doc.querySelectorAll(INERT_TARGETS_SELECTOR).forEach((el) => {
    if (inert) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  });
}

export function openPanel(panelEl) {
  panelEl.classList.add('open');
  panelEl.setAttribute('aria-hidden', 'false');
  panelEl.removeAttribute('inert');
}

export function closePanel(panelEl) {
  panelEl.classList.remove('open');
  panelEl.setAttribute('aria-hidden', 'true');
  panelEl.setAttribute('inert', '');
}

export function focusFirstIn(panelEl) {
  const focusable = panelEl.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])');
  if (focusable && focusable.focus) focusable.focus();
  return focusable || null;
}
