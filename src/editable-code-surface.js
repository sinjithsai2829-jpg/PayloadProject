const panes = [...document.querySelectorAll('.pane')];
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];

const gutters = [];
const gutterRows = [];
const renderFrames = [0, 0];

installStyles();
for (let index = 0; index < editors.length; index += 1) installPane(index);

function installPane(index) {
  const pane = panes[index];
  const editor = editors[index];
  const wrap = editor?.closest('.editor-wrap');
  if (!pane || !editor || !wrap) return;

  editor.classList.add('editor-with-line-numbers');

  const gutter = document.createElement('div');
  gutter.className = 'editor-line-gutter';
  gutter.setAttribute('aria-hidden', 'true');
  const rows = document.createElement('div');
  rows.className = 'editor-line-gutter-rows';
  gutter.appendChild(rows);
  wrap.appendChild(gutter);
  gutters[index] = gutter;
  gutterRows[index] = rows;

  const refreshSurface = () => {
    const treeActive = pane.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
    if (!treeActive) editor.classList.remove('hidden');
    gutter.classList.toggle('hidden', !!treeActive || editor.classList.contains('hidden'));
    scheduleRender(index);
  };

  editor.addEventListener('scroll', () => scheduleRender(index), { passive: true });
  editor.addEventListener('input', () => scheduleRender(index));
  pane.querySelector('.view-tabs')?.addEventListener('click', () => requestAnimationFrame(refreshSurface));

  if (typeof ResizeObserver !== 'undefined') {
    const resize = new ResizeObserver(() => scheduleRender(index));
    resize.observe(editor);
  } else {
    window.addEventListener('resize', () => scheduleRender(index), { passive: true });
  }

  refreshSurface();
}

function scheduleRender(index) {
  if (renderFrames[index]) return;
  renderFrames[index] = requestAnimationFrame(() => {
    renderFrames[index] = 0;
    renderLineNumbers(index);
  });
}

function renderLineNumbers(index) {
  const editor = editors[index];
  const gutter = gutters[index];
  const rows = gutterRows[index];
  if (!editor || !gutter || !rows || gutter.classList.contains('hidden')) return;

  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const contentHeight = Math.max(0, editor.scrollHeight - paddingTop - paddingBottom);
  const totalLines = Math.max(1, Math.round(contentHeight / lineHeight));
  const overscan = 8;
  const first = Math.max(1, Math.floor((editor.scrollTop - paddingTop) / lineHeight) + 1 - overscan);
  const visibleCount = Math.ceil(editor.clientHeight / lineHeight) + overscan * 2 + 2;
  const last = Math.min(totalLines, first + visibleCount);

  const fragment = document.createDocumentFragment();
  for (let line = first; line <= last; line += 1) {
    const row = document.createElement('div');
    row.className = 'editor-line-number';
    row.textContent = line.toLocaleString();
    row.style.top = `${paddingTop + (line - 1) * lineHeight - editor.scrollTop}px`;
    row.style.height = `${lineHeight}px`;
    row.style.lineHeight = `${lineHeight}px`;
    fragment.appendChild(row);
  }
  rows.replaceChildren(fragment);
}

function installStyles() {
  if (document.querySelector('#editable-code-surface-styles')) return;
  const style = document.createElement('style');
  style.id = 'editable-code-surface-styles';
  style.textContent = `
    .editor.editor-with-line-numbers { padding-left: 78px; }
    .editor-line-gutter {
      position: absolute;
      z-index: 5;
      left: 4px;
      top: 0;
      bottom: 0;
      width: 64px;
      overflow: hidden;
      pointer-events: none;
      background: #0b1221;
      border-right: 1px solid #253149;
      user-select: none;
    }
    .editor-line-gutter-rows { position: absolute; inset: 0; }
    .editor-line-number {
      position: absolute;
      left: 0;
      right: 0;
      padding-right: 10px;
      text-align: right;
      color: #71809d;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 12px;
      white-space: nowrap;
    }
    .editor-wrap:focus-within .editor-line-gutter { border-right-color: #3b4c70; }
  `;
  document.head.appendChild(style);
}
