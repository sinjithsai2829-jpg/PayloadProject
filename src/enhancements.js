const ROW_HEIGHT = 22;
const OVERSCAN = 35;
const SEARCH_LIMIT = 5000;

const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const trees = [document.querySelector('#tree0'), document.querySelector('#tree1')];
const panes = [...document.querySelectorAll('.pane')];
const formatBtn = document.querySelector('#formatBtn');
const compareBtn = document.querySelector('#compareBtn');
const clearBtn = document.querySelector('#clearBtn');
const statusText = document.querySelector('#statusText');

const state = [0, 1].map(() => ({
  active: false,
  lines: [],
  start: -1,
  end: -1,
  raf: 0,
  searchResults: [],
  searchIndex: -1,
  searchQuery: '',
}));

let syncTrees = true;
let searchSeq = 0;
const searchPending = new Map();
const searchWorker = new Worker(new URL('./tree-search-worker.js', import.meta.url), { type: 'module' });
searchWorker.onmessage = ({ data }) => {
  const pending = searchPending.get(data.id);
  if (!pending) return;
  searchPending.delete(data.id);
  data.ok ? pending.resolve(data.result) : pending.reject(new Error(data.error));
};

function searchInWorker(text, query) {
  return new Promise((resolve, reject) => {
    const id = ++searchSeq;
    searchPending.set(id, { resolve, reject });
    searchWorker.postMessage({ id, text, query, limit: SEARCH_LIMIT });
  });
}

const syncControl = document.createElement('label');
syncControl.className = 'sync-toggle enhancement-sync';
syncControl.innerHTML = '<input type="checkbox" checked /> Sync tree navigation';
const toolbarRight = document.querySelector('.toolbar-right');
toolbarRight?.prepend(syncControl);
syncControl.querySelector('input').addEventListener('change', (event) => {
  syncTrees = event.target.checked;
});

const virtuals = [];
const virtualSpacers = [];
const virtualRows = [];
const editButtons = [];
const searchInputs = [];
const searchCounts = [];

for (let index = 0; index < 2; index += 1) {
  const wrap = panes[index].querySelector('.editor-wrap');
  const virtual = document.createElement('div');
  virtual.className = 'virtual-code hidden';
  virtual.setAttribute('aria-label', 'Virtualized formatted payload');
  const spacer = document.createElement('div');
  spacer.className = 'virtual-spacer';
  const rows = document.createElement('div');
  rows.className = 'virtual-rows';
  virtual.append(spacer, rows);
  wrap.insertBefore(virtual, trees[index]);
  virtuals.push(virtual);
  virtualSpacers.push(spacer);
  virtualRows.push(rows);

  const actions = panes[index].querySelector('.pane-actions');
  const edit = document.createElement('button');
  edit.className = 'enhancement-edit';
  edit.textContent = 'View formatted';
  edit.disabled = true;
  actions.insertBefore(edit, actions.querySelector('.copy-btn'));
  editButtons.push(edit);
  edit.addEventListener('click', () => toggleVirtual(index));

  const tabs = panes[index].querySelector('.view-tabs');
  const searchWrap = document.createElement('div');
  searchWrap.className = 'tree-search-control';
  searchWrap.innerHTML = `
    <input class="tree-search" type="search" autocomplete="off" placeholder="Search JSON key, path, or value" />
    <button class="search-run" title="Search">Search</button>
    <button class="search-prev" title="Previous match">↑</button>
    <button class="search-next" title="Next match">↓</button>
    <span class="search-count">0</span>
  `;
  tabs.parentElement?.insertBefore(searchWrap, tabs.nextSibling);
  searchInputs.push(searchWrap.querySelector('.tree-search'));
  searchCounts.push(searchWrap.querySelector('.search-count'));
  searchWrap.querySelector('.search-run').addEventListener('click', () => runSearch(index));
  searchWrap.querySelector('.search-prev').addEventListener('click', () => moveSearch(index, -1));
  searchWrap.querySelector('.search-next').addEventListener('click', () => moveSearch(index, 1));
  searchInputs[index].addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (event.shiftKey) moveSearch(index, -1);
    else if (state[index].searchQuery === searchInputs[index].value.trim() && state[index].searchResults.length) moveSearch(index, 1);
    else runSearch(index);
  });

  virtual.addEventListener('scroll', () => scheduleVirtual(index));
  editors[index].addEventListener('input', () => deactivateVirtual(index));
}

function afterBusy(callback) {
  let seenBusy = document.body.classList.contains('busy');
  const check = () => {
    seenBusy ||= document.body.classList.contains('busy');
    if (!document.body.classList.contains('busy') && seenBusy) {
      callback();
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

formatBtn?.addEventListener('click', () => afterBusy(() => {
  [0, 1].forEach((index) => {
    if (editors[index].value.trim()) activateVirtual(index);
  });
}), true);

compareBtn?.addEventListener('click', () => afterBusy(() => {
  [0, 1].forEach((index) => {
    if (editors[index].value.trim() && !isTreeVisible(index)) activateVirtual(index);
  });
}), true);

clearBtn?.addEventListener('click', () => {
  requestAnimationFrame(() => [0, 1].forEach(resetPaneEnhancements));
});

for (const btn of document.querySelectorAll('.mode-btn')) {
  btn.addEventListener('click', () => {
    requestAnimationFrame(() => {
      const json = btn.dataset.mode === 'json';
      document.querySelectorAll('.tree-search-control').forEach((node) => node.classList.toggle('hidden', !json));
      syncControl.classList.toggle('hidden', !json);
      if (!json) [0, 1].forEach((index) => hideVirtual(index));
    });
  });
}

for (const tabs of document.querySelectorAll('.view-tabs')) {
  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('.view-btn');
    if (!button) return;
    const index = Number(tabs.dataset.pane);
    requestAnimationFrame(() => {
      if (button.dataset.view === 'tree') hideVirtual(index);
      else if (state[index].active) showVirtual(index);
    });
  });
}

function activateVirtual(index) {
  const text = editors[index].value;
  if (!text) return;
  state[index].lines = text.split('\n');
  state[index].active = true;
  state[index].start = -1;
  state[index].end = -1;
  editButtons[index].disabled = false;
  editButtons[index].textContent = 'Edit';
  showVirtual(index);
}

function deactivateVirtual(index) {
  state[index].active = false;
  state[index].lines = [];
  state[index].start = -1;
  state[index].end = -1;
  virtualRows[index].replaceChildren();
  virtualSpacers[index].style.height = '0px';
  hideVirtual(index);
  editButtons[index].disabled = !editors[index].value.trim();
  editButtons[index].textContent = 'View formatted';
  resetSearch(index);
}

function toggleVirtual(index) {
  if (!editors[index].value.trim()) return;
  if (state[index].active && !virtuals[index].classList.contains('hidden')) {
    hideVirtual(index);
    editors[index].classList.remove('hidden');
    editButtons[index].textContent = 'View formatted';
  } else {
    if (!state[index].active) activateVirtual(index);
    else {
      editButtons[index].textContent = 'Edit';
      showVirtual(index);
    }
  }
}

function showVirtual(index) {
  if (!state[index].active || isTreeVisible(index)) return;
  editors[index].classList.add('hidden');
  trees[index].classList.add('hidden');
  virtuals[index].classList.remove('hidden');
  renderVirtual(index, true);
}

function hideVirtual(index) {
  virtuals[index].classList.add('hidden');
}

function scheduleVirtual(index) {
  if (state[index].raf) return;
  state[index].raf = requestAnimationFrame(() => {
    state[index].raf = 0;
    renderVirtual(index);
  });
}

function renderVirtual(index, force = false) {
  const pane = state[index];
  const scroller = virtuals[index];
  if (!pane.active || scroller.classList.contains('hidden')) return;
  const total = pane.lines.length;
  const viewport = Math.max(scroller.clientHeight, 400);
  const start = Math.max(0, Math.floor(scroller.scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(total, Math.ceil((scroller.scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  virtualSpacers[index].style.height = `${total * ROW_HEIGHT}px`;
  if (!force && start === pane.start && end === pane.end) return;
  pane.start = start;
  pane.end = end;

  const frag = document.createDocumentFragment();
  for (let i = start; i < end; i += 1) {
    const row = document.createElement('div');
    row.className = 'code-row';
    row.style.top = `${i * ROW_HEIGHT}px`;
    row.dataset.line = String(i + 1);
    const no = document.createElement('span');
    no.className = 'code-line-number';
    no.textContent = (i + 1).toLocaleString();
    const text = document.createElement('span');
    text.className = 'code-line-text';
    text.textContent = pane.lines[i] || ' ';
    row.append(no, text);
    frag.appendChild(row);
  }
  virtualRows[index].replaceChildren(frag);
}

async function runSearch(index) {
  const query = searchInputs[index].value.trim();
  if (!query) return setStatus('Enter a JSON key, path, or value to search.', true);
  const text = editors[index].value.trim();
  if (!text) return setStatus(`File ${index + 1} is empty.`, true);
  try {
    setStatus(`Searching File ${index + 1} tree…`);
    const result = await searchInWorker(text, query);
    const pane = state[index];
    pane.searchQuery = query;
    pane.searchResults = result.paths;
    pane.searchIndex = result.paths.length ? 0 : -1;
    updateSearchCount(index, result.truncated);
    if (!result.paths.length) return setStatus(`No JSON tree matches for “${query}”.`, true);
    await revealPath(index, result.paths[0], true);
    setStatus(`Found ${result.paths.length.toLocaleString()}${result.truncated ? '+' : ''} matches in ${result.elapsedMs} ms.`);
  } catch (error) {
    setStatus(`Search requires formatted valid JSON: ${error.message}`, true);
  }
}

async function moveSearch(index, delta) {
  const pane = state[index];
  const query = searchInputs[index].value.trim();
  if (!pane.searchResults.length || pane.searchQuery !== query) return runSearch(index);
  pane.searchIndex = (pane.searchIndex + delta + pane.searchResults.length) % pane.searchResults.length;
  updateSearchCount(index, false);
  await revealPath(index, pane.searchResults[pane.searchIndex], true);
}

function updateSearchCount(index, truncated) {
  const pane = state[index];
  searchCounts[index].textContent = pane.searchResults.length
    ? `${pane.searchIndex + 1}/${pane.searchResults.length}${truncated ? '+' : ''}`
    : '0';
}

function resetSearch(index) {
  const pane = state[index];
  pane.searchQuery = '';
  pane.searchResults = [];
  pane.searchIndex = -1;
  searchInputs[index].value = '';
  searchCounts[index].textContent = '0';
}

async function revealPath(index, path, mirror) {
  const treeTab = panes[index].querySelector('[data-view="tree"]');
  if (!treeTab.classList.contains('active')) treeTab.click();
  hideVirtual(index);
  await nextFrame();

  const ancestors = pathAncestors(path);
  for (const ancestor of ancestors.slice(0, -1)) await ensureExpanded(index, ancestor);
  await ensureVisible(index, path);
  highlightPath(index, path);

  if (mirror && syncTrees) {
    const other = index === 0 ? 1 : 0;
    const otherTreeTab = panes[other].querySelector('[data-view="tree"]');
    if (!otherTreeTab.classList.contains('active')) otherTreeTab.click();
    await nextFrame();
    for (const ancestor of ancestors.slice(0, -1)) await ensureExpanded(other, ancestor);
    await ensureVisible(other, path);
    highlightPath(other, path);
  }
}

async function ensureExpanded(index, path) {
  await ensureVisible(index, path);
  let row = findRow(index, path);
  if (!row) return;
  const toggle = row.querySelector('.tree-toggle');
  if (toggle && !toggle.disabled && toggle.textContent === '▸') {
    toggle.click();
    await nextFrame();
  }
}

async function ensureVisible(index, path) {
  for (let guard = 0; guard < 250 && !findRow(index, path); guard += 1) {
    const parent = parentPath(path);
    if (!parent || parent === path) break;
    const parentRow = findRow(index, parent);
    if (!parentRow) {
      await ensureVisible(index, parent);
      await ensureExpanded(index, parent);
    }
    if (findRow(index, path)) break;
    const more = trees[index].querySelector('.tree-more');
    if (!more) break;
    more.click();
    await nextFrame();
  }
}

function highlightPath(index, path) {
  trees[index].querySelectorAll('.search-hit').forEach((node) => node.classList.remove('search-hit'));
  const row = findRow(index, path);
  if (!row) return;
  row.classList.add('search-hit');
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function findRow(index, path) {
  return [...trees[index].querySelectorAll('.tree-row[data-path]')].find((row) => row.dataset.path === path) || null;
}

for (let index = 0; index < 2; index += 1) {
  trees[index].addEventListener('click', (event) => {
    const toggle = event.target.closest('.tree-toggle');
    const row = toggle?.closest('.tree-row[data-path]');
    if (!toggle || !row || !syncTrees) return;
    const path = row.dataset.path;
    const wasExpanded = toggle.textContent === '▾';
    setTimeout(() => mirrorToggle(index, path, !wasExpanded), 0);
  }, true);
}

async function mirrorToggle(source, path, shouldExpand) {
  if (!syncTrees) return;
  const other = source === 0 ? 1 : 0;
  if (trees[other].classList.contains('hidden')) return;
  await ensureVisible(other, path);
  const row = findRow(other, path);
  const toggle = row?.querySelector('.tree-toggle');
  if (!toggle || toggle.disabled) return;
  const expanded = toggle.textContent === '▾';
  if (expanded !== shouldExpand) toggle.click();
}

function pathAncestors(path) {
  const out = ['$'];
  if (path === '$') return out;
  const tokens = path.slice(1).match(/\.[A-Za-z_$][\w$]*|\[(?:\d+|"(?:\\.|[^"])*")\]/g) || [];
  let current = '$';
  for (const token of tokens) {
    current += token;
    out.push(current);
  }
  return out;
}

function parentPath(path) {
  const ancestors = pathAncestors(path);
  return ancestors.length > 1 ? ancestors[ancestors.length - 2] : null;
}

function isTreeVisible(index) {
  return !trees[index].classList.contains('hidden');
}

function resetPaneEnhancements(index) {
  state[index].active = false;
  state[index].lines = [];
  state[index].start = -1;
  state[index].end = -1;
  virtuals[index].scrollTop = 0;
  virtuals[index].classList.add('hidden');
  virtualRows[index].replaceChildren();
  virtualSpacers[index].style.height = '0px';
  editButtons[index].disabled = true;
  editButtons[index].textContent = 'View formatted';
  resetSearch(index);
}

function setStatus(message, error = false) {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle('error', error);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
