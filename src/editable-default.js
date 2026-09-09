const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const formatBtn = document.querySelector('#formatBtn');
const compareBtn = document.querySelector('#compareBtn');

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

  // Respect Tree View if the user intentionally selected it.
  if (treeTab?.classList.contains('active')) return;

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

// Formatting and comparison should leave the formatted payload directly
// editable. The virtualized renderer is still available as an optional view.
formatBtn?.addEventListener('click', () => afterBusy(keepFormattedTextEditable), true);
compareBtn?.addEventListener('click', () => afterBusy(keepFormattedTextEditable), true);
