// Solo band: an explicit lens indicator, never impersonating a direct commit
// (T20, T-REQ-028, D-DEC-08/09). This renderer only ever reflects state and
// calls onEnterSolo/onExitSolo -- it never appends Route or trace itself,
// matching src/domain/solo.js's own guarantee (enterSolo/exitSolo touch only
// the solo/view regions).
export function createSoloRenderer({ container, copy, labelOf, onExitSolo }) {
  function render(solo) {
    container.replaceChildren();
    if (!solo.active) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    const band = document.createElement('div');
    band.className = 'solo-band';
    band.setAttribute('role', 'status');
    const label = document.createElement('span');
    label.className = 'solo-label';
    label.textContent = `${copy.states.soloPrefix} · ${labelOf(solo.rootId)}`;
    const exit = document.createElement('button');
    exit.className = 'solo-exit';
    exit.textContent = copy.actions.exitSolo;
    exit.onclick = onExitSolo;
    band.append(label, exit);
    container.appendChild(band);
  }

  return { render };
}
