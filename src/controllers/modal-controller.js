import { setBackgroundInert, openPanel, closePanel, focusFirstIn } from '../presentation/modal-renderer.js';

// One modal authority for View, Index, Route and About (T21, T-REQ-032/033,
// D-DEC-20). Exactly one panel is ever open; opening a second replaces the
// first without an intermediate background-focused frame (no focus leak);
// closing restores the recorded invoker, or a deterministic logical
// fallback when that invoker is gone.
export function createModalController({ doc, panels, fallbackFor }) {
  let current = null; // { kind, invoker }

  function isUsableInvoker(el) {
    return !!el && typeof el.focus === 'function' && doc.contains(el);
  }

  function open(kind, invoker) {
    const panel = panels[kind];
    if (!panel) throw new Error(`modal-controller: unknown kind "${kind}"`);
    if (current && current.kind !== kind) {
      // Replacement: close the old panel's DOM state first, but do NOT run
      // the close-focus-restore step -- focus goes straight into the new
      // panel next, never bouncing out to the background in between.
      closePanel(panels[current.kind]);
    }
    current = { kind, invoker: isUsableInvoker(invoker) ? invoker : null };
    setBackgroundInert(doc, true);
    openPanel(panel);
    focusFirstIn(panel);
    return current;
  }

  function close() {
    if (!current) return null;
    const { kind, invoker } = current;
    closePanel(panels[kind]);
    setBackgroundInert(doc, false);
    current = null;
    const target = isUsableInvoker(invoker) ? invoker : fallbackFor(kind);
    if (target && target.focus) target.focus();
    return target || null;
  }

  function activeKind() {
    return current ? current.kind : null;
  }

  return { open, close, activeKind };
}
