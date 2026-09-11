const SEARCH_LIMIT = 5000;

const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const trees = [document.querySelector('#tree0'), document.querySelector('#tree1')];
const panes = [...document.querySelectorAll('.pane')];
const clearBtn = document.querySelector('#clearBtn');
const statusText = document.querySelector('#statusText');

const state = [0, 1].map(() => ({
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

function currentMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode || 'json';
}

function searchInWorker(mode, text, query) {
  return new Promise((resolve, reject) => {
    const id = ++searchSeq;
    searchPending.set(id, { resolve, reject });
    searchWorker.postMessage({ id, mode, text, query, limit: SEARCH_LIMIT });
  });
}

// Shared workspace feature: visible in JSON and XML. In JSON Tree it mirrors
// branches; in XML Tree it mirrors the same path-based expansion behavior.
const syncControl = document.createElement('label');
syncControl.className = 'sync-toggle enhancement-sync';
syncControl.innerHTML = '<input type="checkbox" checked /> Sync views & scroll';
document.querySelector('.toolbar-right')?.prepend(syncControl);
syncControl.querySelector('input')?.addEventListener('change', (event) => {
  syncTrees = event.target.checked;
});

const searchInputs = [];
const searchCounts = [];

for (let index = 0; index < 2; index += 1) {
  const tabs = panes[index]?.querySelector('.view-tabs');
  if (!tabs) continue;

  let tools = tabs.parentElement?.classList.contains('pane-tools') ? tabs.parentElement : null;
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'pane-tools';
    tabs.parentNode?.insertBefore(tools, tabs);
    tools.appendChild(tabs);
  }

  const searchWrap = document.createElement('div');
  searchWrap.className = 'tree-search-control';
  searchWrap.innerHTML = `
    <input class="tree-search" type="search" autocomplete="off" placeholder="Search JSON key, path, or value" />
    <button class="search-run" title="Search">Search</button>
    <button class="search-prev" title="Previous match">↑</button>
    <button class="search-next" title="Next match">↓</button>
    <span class="search-count">0</span>
  `;
  tools.appendChild(searchWrap);

  const input = searchWrap.querySelector('.tree-search');
  const count = searchWrap.querySelector('.search-count');
  searchInputs[index] = input;
  searchCounts[index] = count;

  searchWrap.querySelector('.search-run')?.addEventListener('click', () => runSearch(index));
  searchWrap.querySelector('.search-prev')?.addEventListener('click', () => moveSearch(index, -1));
  searchWrap.querySelector('.search-next')?.addEventListener('click', () => moveSearch(index, 1));

  input?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (event.shiftKey) moveSearch(index, -1);
    else if (state[index].searchQuery === input.value.trim() && state[index].searchResults.length) moveSearch(index, 1);
    else runSearch(index);
  });
}

clearBtn?.addEventListener('click', () => {
  requestAnimationFrame(() => [0, 1].forEach(resetSearch));
});

for (const button of document.querySelectorAll('.mode-btn')) {
  button.addEventListener('click', () => {
    requestAnimationFrame(() => {
      const xml = button.dataset.mode === 'xml';
      searchInputs.forEach((input) => {
        if (!input) return;
        input.placeholder = xml
          ? 'Search XML element, attribute, path, or value'
          : 'Search JSON key, path, or value';
      });
      document.querySelectorAll('.tree-search-control').forEach((node) => node.classList.remove('hidden'));
      syncControl.classList.remove('hidden');
      [0, 1].forEach(resetSearch);
    });
  });
}

async function runSearch(index) {
  const mode = currentMode();
  const query = searchInputs[index]?.value.trim();
  if (!query) return setStatus(`Enter a ${mode.toUpperCase()} key, element, path, attribute, or value to search.`, true);

  const text = editors[index]?.value.trim();
  if (!text) return setStatus(`File ${index + 1} is empty.`, true);

  try {
    setStatus(`Searching File ${index + 1} ${mode.toUpperCase()} tree…`);
    const result = await searchInWorker(mode, text, query);
    const pane = state[index];
    pane.searchQuery = query;
    pane.searchResults = result.paths;
    pane.searchIndex = result.paths.length ? 0 : -1;
    updateSearchCount(index, result.truncated);

    if (!result.paths.length) return setStatus(`No ${mode.toUpperCase()} tree matches for “${query}”.`, true);

    await revealPath(index, result.paths[0], true);
    setStatus(`Found ${result.paths.length.toLocaleString()}${result.truncated ? '+' : ''} matches in ${result.elapsedMs} ms.`);
  } catch (error) {
    setStatus(`Search requires structurally valid ${mode.toUpperCase()} after recovery: ${error.message}`, true);
  }
}

async function moveSearch(index, delta) {
  const pane = state[index];
  const query = searchInputs[index]?.value.trim() || '';
  if (!pane.searchResults.length || pane.searchQuery !== query) return runSearch(index);

  pane.searchIndex = (pane.searchIndex + delta + pane.searchResults.length) % pane.searchResults.length;
  updateSearchCount(index, false);
  await revealPath(index, pane.searchResults[pane.searchIndex], true);
}

function updateSearchCount(index, truncated) {
  const pane = state[index];
  if (!searchCounts[index]) return;
  searchCounts[index].textContent = pane.searchResults.length
    ? `${pane.searchIndex + 1}/${pane.searchResults.length}${truncated ? '+' : ''}`
    : '0';
}

function resetSearch(index) {
  const pane = state[index];
  pane.searchQuery = '';
  pane.searchResults = [];
  pane.searchIndex = -1;
  if (searchInputs[index]) searchInputs[index].value = '';
  if (searchCounts[index]) searchCounts[index].textContent = '0';
  trees[index]?.querySelectorAll('.search-hit').forEach((node) => node.classList.remove('search-hit'));
}

async function revealPath(index, path, mirror) {
  const treeTab = panes[index]?.querySelector('[data-view="tree"]');
  if (!treeTab) return;
  if (!treeTab.classList.contains('active')) treeTab.click();
  await nextFrame();

  const ancestors = pathAncestors(path, currentMode());
  for (const ancestor of ancestors.slice(0, -1)) await ensureExpanded(index, ancestor);
  await ensureVisible(index, path);
  highlightPath(index, path);

  if (mirror && syncTrees) {
    const other = index === 0 ? 1 : 0;
    const otherTreeTab = panes[other]?.querySelector('[data-view="tree"]');
    if (!otherTreeTab) return;
    if (!otherTreeTab.classList.contains('active')) otherTreeTab.click();
    await nextFrame();
    for (const ancestor of ancestors.slice(0, -1)) await ensureExpanded(other, ancestor);
    await ensureVisible(other, path);
    highlightPath(other, path);
  }
}

async function ensureExpanded(index, path) {
  await ensureVisible(index, path);
  const row = findRow(index, path);
  const toggle = row?.querySelector('.tree-toggle');
  if (toggle && !toggle.disabled && toggle.textContent === '▸') {
    toggle.click();
    await nextFrame();
  }
}

async function ensureVisible(index, path) {
  for (let guard = 0; guard < 250 && !findRow(index, path); guard += 1) {
    const parent = parentPath(path, currentMode());
    if (!parent || parent === path) break;

    const parentRow = findRow(index, parent);
    if (!parentRow) {
      await ensureVisible(index, parent);
      await ensureExpanded(index, parent);
    }

    if (findRow(index, path)) break;
    const more = trees[index]?.querySelector('.tree-more');
    if (!more) break;
    more.click();
    await nextFrame();
  }
}

function highlightPath(index, path) {
  const tree = trees[index];
  if (!tree) return;
  tree.querySelectorAll('.search-hit').forEach((node) => node.classList.remove('search-hit'));
  const row = findRow(index, path);
  if (!row) return;
  row.classList.add('search-hit');
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function findRow(index, path) {
  return [...(trees[index]?.querySelectorAll('.tree-row[data-path]') || [])]
    .find((row) => row.dataset.path === path) || null;
}

for (let index = 0; index < 2; index += 1) {
  trees[index]?.addEventListener('click', (event) => {
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
  if (trees[other]?.classList.contains('hidden')) return;

  await ensureVisible(other, path);
  const row = findRow(other, path);
  const toggle = row?.querySelector('.tree-toggle');
  if (!toggle || toggle.disabled) return;

  const expanded = toggle.textContent === '▾';
  if (expanded !== shouldExpand) toggle.click();
}

function pathAncestors(path, mode) {
  if (path === '$') return ['$'];
  if (mode === 'xml') {
    const out = ['$'];
    const parts = path.slice(1).split('/').filter(Boolean);
    let current = '$';
    for (const part of parts) {
      current += `/${part}`;
      out.push(current);
    }
    return out;
  }

  const out = ['$'];
  const tokens = path.slice(1).match(/\.[A-Za-z_$][\w$]*|\[(?:\d+|"(?:\\.|[^"])*")\]/g) || [];
  let current = '$';
  for (const token of tokens) {
    current += token;
    out.push(current);
  }
  return out;
}

function parentPath(path, mode) {
  const ancestors = pathAncestors(path, mode);
  return ancestors.length > 1 ? ancestors[ancestors.length - 2] : null;
}

function setStatus(message, error = false) {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle('error', error);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}
