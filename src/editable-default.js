const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const formatBtn = document.querySelector('#formatBtn');
const compareBtn = document.querySelector('#compareBtn');
const compareBar = document.querySelector('#compareBar');
const workspace = document.querySelector('.workspace');

// Keep the comparison result visible near the Compare button. Previously it
// lived below the full-height editors, so users could miss the summary.
if (compareBar && workspace?.parentNode) {
  workspace.parentNode.insertBefore(compareBar, workspace);
  compareBar.style.marginTop = '0';
  compareBar.style.marginBottom = '14px';
}

function afterBusy(callback) {
  let sawBusy = document.body.classList.contains('busy');
  const check = () => {
    sawBusy ||= document.body.classList.contains('busy');
    if (sawBusy && !document.body.classList.contains('busy')) {
      requestAnimationFrame(callback);
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function showEditableCode(index) {
  const pane = panes[index];
  const editor = editors[index];
  if (!pane || !editor) return;

  const codeTab = pane.querySelector('.view-btn[data-view="code"]');
  const treeTab = pane.querySelector('.view-btn[data-view="tree"]');
  const tree = pane.querySelector('.tree-view');
  const virtual = pane.querySelector('.virtual-code');
  const virtualToggle = pane.querySelector('.enhancement-edit');

  codeTab?.classList.add('active');
  treeTab?.classList.remove('active');
  tree?.classList.add('hidden');
  virtual?.classList.add('hidden');
  editor.classList.remove('hidden');

  if (virtualToggle) {
    virtualToggle.disabled = !editor.value.trim();
    virtualToggle.textContent = 'View formatted';
  }
}

function keepFormattedTextEditable() {
  [0, 1].forEach(showEditableCode);
}

function isJsonMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode === 'json';
}

async function revealFirstVisibleDiff(index) {
  const tree = panes[index]?.querySelector('.tree-view');
  if (!tree) return;

  // Expand only one changed branch at a time. This reveals an actual changed
  // value without expanding a huge 50k+ node payload all at once.
  for (let depth = 0; depth < 12; depth += 1) {
    const exact = tree.querySelector('.tree-row.diff-added, .tree-row.diff-removed, .tree-row.diff-modified');
    if (exact) {
      exact.scrollIntoView({ block: 'center' });
      return;
    }

    const branch = [...tree.querySelectorAll('.tree-row.diff-branch')].find((row) => {
      const toggle = row.querySelector('.tree-toggle');
      return toggle && !toggle.disabled && toggle.textContent === '▸';
    });

    if (!branch) return;
    branch.querySelector('.tree-toggle')?.click();
    await nextFrame();
  }
}

async function showJsonComparison() {
  if (!compareBar || compareBar.classList.contains('hidden')) {
    keepFormattedTextEditable();
    return;
  }

  for (const pane of panes) {
    const treeTab = pane.querySelector('.view-btn[data-view="tree"]');
    if (treeTab && !treeTab.classList.contains('active')) treeTab.click();
  }

  await nextFrame();
  await revealFirstVisibleDiff(0);
  await revealFirstVisibleDiff(1);
}

function showComparisonResult() {
  if (isJsonMode()) showJsonComparison();
  else keepFormattedTextEditable();
}

// Formatting leaves the normalized payload directly editable.
formatBtn?.addEventListener('click', () => afterBusy(keepFormattedTextEditable), true);

// Comparing JSON opens Tree View, where structural differences are highlighted.
// XML remains in editable Code View and uses its line-difference navigation.
compareBtn?.addEventListener('click', () => afterBusy(showComparisonResult), true);
