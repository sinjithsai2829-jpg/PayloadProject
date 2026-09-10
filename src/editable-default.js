const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const formatBtn = document.querySelector('#formatBtn');
const compareBtn = document.querySelector('#compareBtn');
const compareBar = document.querySelector('#compareBar');
const workspace = document.querySelector('.workspace');

// Keep the comparison summary visible near the Compare button.
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
    virtualToggle.textContent = 'Large view';
  }
}

function keepFormattedTextEditable() {
  [0, 1].forEach(showEditableCode);
}

function restoreCurrentComparisonView() {
  for (let index = 0; index < panes.length; index += 1) {
    const treeTab = panes[index].querySelector('.view-btn[data-view="tree"]');
    // Compare must not force Tree view. If the user was already in Tree, leave
    // it alone; otherwise keep Code as the editable comparison surface.
    if (!treeTab?.classList.contains('active')) showEditableCode(index);
  }
}

// Formatting leaves the normalized payload directly editable.
formatBtn?.addEventListener('click', () => afterBusy(keepFormattedTextEditable), true);

// Comparing preserves the view the user chose. Code remains editable and Tree
// remains available as an optional navigation view. No automatic scroll occurs.
compareBtn?.addEventListener('click', () => afterBusy(restoreCurrentComparisonView), true);
