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

  codeTab?.classList.add('active');
  treeTab?.classList.remove('active');
  tree?.classList.add('hidden');
  editor.classList.remove('hidden');
}

function keepFormattedTextEditable() {
  [0, 1].forEach(showEditableCode);
}

function restoreCurrentComparisonView() {
  for (let index = 0; index < panes.length; index += 1) {
    const treeTab = panes[index].querySelector('.view-btn[data-view="tree"]');
    if (!treeTab?.classList.contains('active')) showEditableCode(index);
  }
}

formatBtn?.addEventListener('click', () => afterBusy(keepFormattedTextEditable), true);
compareBtn?.addEventListener('click', () => afterBusy(restoreCurrentComparisonView), true);
