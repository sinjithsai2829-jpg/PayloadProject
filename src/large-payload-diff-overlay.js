const panes = [...document.querySelectorAll('.pane')];
const state = [0, 1].map(() => ({ map: new Map(), currentLine: null, frame: 0 }));

window.addEventListener('payloaddiff:large-comparison-updated', (event) => {
  const detail = event.detail || {};
  const diffs = Array.isArray(detail.diffs) ? detail.diffs : [];
  const current = Number(detail.currentDiffIndex);

  for (let paneIndex = 0; paneIndex < 2; paneIndex += 1) {
    const map = new Map();
    let currentLine = null;
    for (let diffIndex = 0; diffIndex < diffs.length; diffIndex += 1) {
      const diff = diffs[diffIndex];
      const line = Number(paneIndex === 0 ? diff.leftLine : diff.rightLine);
      if (!Number.isInteger(line) || line <= 0) continue;
      const incoming = diff.type === 'added' || diff.type === 'removed' ? diff.type : 'modified';
      const existing = map.get(line);
      map.set(line, existing && existing !== incoming ? 'modified' : incoming);
      if (diffIndex === current) currentLine = line;
    }
    state[paneIndex].map = map;
    state[paneIndex].currentLine = currentLine;
    schedule(paneIndex);
  }
});

window.addEventListener('payloaddiff:comparison-reset', clear);

for (let index = 0; index < panes.length; index += 1) {
  panes[index]?.querySelector('.large-payload-view')?.addEventListener('scroll', () => schedule(index), { passive: true });
}

function schedule(index) {
  const item = state[index];
  if (!item || item.frame) return;
  item.frame = requestAnimationFrame(() => {
    item.frame = 0;
    decorate(index);
  });
}

function decorate(index) {
  const item = state[index];
  const rows = panes[index]?.querySelectorAll('.large-payload-row[data-line-index]') || [];
  for (const row of rows) {
    row.classList.remove('diff-added', 'diff-removed', 'diff-modified', 'current');
    const line = Number(row.dataset.lineIndex) + 1;
    const type = item.map.get(line);
    if (type) row.classList.add(`diff-${type}`);
    if (line === item.currentLine) row.classList.add('current');
  }
}

function clear() {
  for (let index = 0; index < state.length; index += 1) {
    state[index].map = new Map();
    state[index].currentLine = null;
    schedule(index);
  }
}
