// External destination open/failure handling (T25, T-REQ-042, P-RULE-037).
// window.open() returning a falsy value is the cross-browser signal that a
// popup was blocked or the destination could not be opened; when that
// happens this controller never touches semantic state at all -- it holds
// no dispatch, and never calls one -- so the poem session is left exactly
// as it was (P-RULE-037: "leaves the poem session unchanged"). Recovery is a
// small local, non-modal status with retry/copy-address, per the same rule.
export function createExternalLinkController({ win, doc, container }) {
  function clear() {
    container.innerHTML = '';
    container.hidden = true;
  }

  function showFailure(url, label) {
    container.innerHTML = '';
    container.hidden = false;
    const status = doc.createElement('div');
    status.className = 'external-link-status';
    status.setAttribute('role', 'status');

    const text = doc.createElement('span');
    text.className = 'external-link-status-text';
    text.textContent = `Couldn't open ${label || url}.`;

    const retry = doc.createElement('button');
    retry.type = 'button';
    retry.className = 'external-link-status-retry';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => attempt(url, label));

    const copy = doc.createElement('button');
    copy.type = 'button';
    copy.className = 'external-link-status-copy';
    copy.textContent = 'Copy address';
    copy.addEventListener('click', async () => {
      try {
        if (win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText) {
          await win.navigator.clipboard.writeText(url);
          copy.textContent = 'Copied';
        } else {
          copy.textContent = 'Copy unavailable';
        }
      } catch (e) {
        copy.textContent = 'Copy failed';
      }
    });

    const dismiss = doc.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'external-link-status-dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', clear);

    status.append(text, retry, copy, dismiss);
    container.appendChild(status);
  }

  // Never dispatches. A blocked/failed open is purely a local UI concern.
  function attempt(url, label) {
    let opened = null;
    try {
      opened = win.open(url, '_blank', 'noopener');
    } catch (e) {
      opened = null;
    }
    if (opened) {
      clear();
      return true;
    }
    showFailure(url, label);
    return false;
  }

  function handleClick(ev, anchor) {
    ev.preventDefault();
    return attempt(anchor.href, (anchor.textContent || '').trim());
  }

  return { attempt, handleClick, clear };
}
