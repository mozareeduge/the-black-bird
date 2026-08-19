const STABLE_LINKS = [
  { href: 'research/', label: 'Research' },
  { href: 'https://github.com/mozareeduge/the-black-bird/blob/main/CITATION.cff', label: 'Citation' },
  { href: 'https://github.com/mozareeduge/the-black-bird', label: 'Source repository' },
];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderBootstrapFailure(container, copy) {
  container.innerHTML = '';
  container.className = 'phase-unavailable';
  const wrap = document.createElement('div');
  wrap.className = 'bb-unavailable';
  wrap.setAttribute('role', 'alert');
  const links = STABLE_LINKS.map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`).join('');
  wrap.innerHTML = `
    <div class="bb-unavailable-card">
      <h1>THE BLACK BIRD</h1>
      <p class="bb-unavailable-title">${escapeHtml(copy.bootstrapUnavailableTitle)}</p>
      <p class="bb-unavailable-body">${escapeHtml(copy.bootstrapUnavailableBody)}</p>
      <ul class="bb-unavailable-links">${links}</ul>
    </div>`;
  container.appendChild(wrap);
  return wrap;
}
