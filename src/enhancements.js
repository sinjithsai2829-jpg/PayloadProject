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
  searchSurface: 'code',
  truncated: false,
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

// Shared workspace feature: visible in JSON and XML. Search respects the
// active Code/Tree surface and never changes a panel's selected view.
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

  // Keep the existing CSS class for layout compatibility; this is now a panel
  // search control rather than a Tree-only control.
  const searchWrap = document.createElement('div');
  searchWrap.className = 'tree-search-control panel-search-control';
  searchWrap.innerHTML = `
    <input class="tree-search panel-search" type="search" autocomplete="off" placeholder="Search JSON code" />
    <button class="search-run" title="Search current view">Search</button>
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
    else if (
      state[index].searchQuery === input.value.trim()
      && state[index].searchResults.length
      && state[index].searchSurface === activeSearchSurface(index)
    ) moveSearch(index, 1);
    else runSearch(index);
  });

  tabs.addEventListener('click', () => {
    requestAnimationFrame(() => {
      const query = searchInputs[index]?.value || '';
      resetSearch(index, { clearQuery: false });
      if (searchInputs[index]) searchInputs[index].value = query;
      updateSearchPlaceholder(index);
    });
  });

  updateSearchPlaceholder(index);
}

clearBtn?.addEventListener('click', () => {
  requestAnimationFrame(() => [0, 1].forEach((index) => resetSearch(index)));
});

for (const button of document.querySelectorAll('.mode-btn')) {
  button.addEventListener('click', () => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.tree-search-control').forEach((node) => node.classList.remove('hidden'));
      syncControl.classList.remove('hidden');
      [0, 1].forEach((index) => {
        resetSearch(index);
        updateSearchPlaceholder(index);
      });
    });
  });
}

async function runSearch(index) {
  const mode = currentMode();
  const surface = activeSearchSurface(index);
  const query = searchInputs[index]?.value.trim();
  if (!query) return setStatus(`Enter something to search in ${surface === 'tree' ? 'Tree' : 'Code'} view.`, true);

  const text = editors[index]?.value || '';
  if (!text.trim()) return setStatus(`File ${index + 1} is empty.`, true);

  try {
    const pane = state[index];
    pane.searchQuery = query;
    pane.searchSurface = surface;

    if (surface === 'code') {
      const result = searchCode(text, query, SEARCH_LIMIT);
      pane.searchResults = result.matches;
      pane.searchIndex = result.matches.length ? 0 : -1;
      pane.truncated = result.truncated;
      updateSearchCount(index, result.truncated);

      if (!result.matches.length) return setStatus(`No ${mode.toUpperCase()} Code matches for “${query}”.`, true);

      revealCodeMatch(index, result.matches[0]);
      setStatus(`Found ${result.matches.length.toLocaleString()}${result.truncated ? '+' : ''} Code matches in ${result.elapsedMs} ms.`);
      return;
    }

    setStatus(`Searching File ${index + 1} ${mode.toUpperCase()} Tree…`);
    const result = await searchInWorker(mode, text, query);
    pane.searchResults = result.paths;
    pane.searchIndex = result.paths.length ? 0 : -1;
    pane.truncated = !!result.truncated;
    updateSearchCount(index, result.truncated);

    if (!result.paths.length) return setStatus(`No ${mode.toUpperCase()} Tree matches for “${query}”.`, true);

    await revealTreePath(index, result.paths[0], true);
    setStatus(`Found ${result.paths.length.toLocaleString()}${result.truncated ? '+' : ''} Tree matches in ${result.elapsedMs} ms.`);
  } catch (error) {
    setStatus(`Unable to search ${surface === 'tree' ? 'Tree' : 'Code'} view: ${error.message}`, true);
  }
}

async function moveSearch(index, delta) {
  const pane = state[index];
  const query = searchInputs[index]?.value.trim() || '';
  const surface = activeSearchSurface(index);
  if (!pane.searchResults.length || pane.searchQuery !== query || pane.searchSurface !== surface) return runSearch(index);

  pane.searchIndex = (pane.searchIndex + delta + pane.searchResults.length) % pane.searchResults.length;
  updateSearchCount(index, pane.truncated);

  const match = pane.searchResults[pane.searchIndex];
  if (surface === 'code') revealCodeMatch(index, match);
  else await revealTreePath(index, match, true);
}

function searchCode(text, query, limit) {
  const started = performance.now();
  const source = String(text ?? '');
  const needle = String(query ?? '');
  const sourceLower = source.toLowerCase();
  const needleLower = needle.toLowerCase();
  const matches = [];
  let cursor = 0;
  let truncated = false;

  while (needleLower && cursor <= sourceLower.length - needleLower.length) {
    const offset = sourceLower.indexOf(needleLower, cursor);
    if (offset < 0) break;
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
    matches.push({ start: offset, end: offset + needle.length });
    cursor = offset + Math.max(1, needle.length);
  }

  return {
    matches,
    truncated,
    elapsedMs: Math.round(performance.now() - started),
  };
}

function revealCodeMatch(index, match) {
  const editor = editors[index];
  if (!editor || !match || activeSearchSurface(index) !== 'code') return;

  const line = lineNumberAtOffset(editor.value, match.start);
  const folded = panes[index]?.querySelector('.fold-code-view');
  if (folded && !folded.classList.contains('hidden')) {
    // A match hidden inside a collapsed block must become visible. Expanding is
    // preferable to silently selecting text behind the folded visual surface.
    window.PayloadDiffCodeFolding?.expandAll?.(index);
  }

  requestAnimationFrame(() => {
    if (activeSearchSurface(index) !== 'code') return;
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(match.start, match.end);
    editor.scrollTop = Math.max(0, (line - 1) * lineHeight - editor.clientHeight * 0.42);
    scrollSelectionHorizontally(editor, match.start);
  });
}

function scrollSelectionHorizontally(editor, offset) {
  const lineStart = editor.value.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const column = Math.max(0, offset - lineStart);
  const style = getComputedStyle(editor);
  const fontSize = parseFloat(style.fontSize) || 13;
  const estimatedCharWidth = fontSize * 0.62;
  const targetLeft = column * estimatedCharWidth;
  if (targetLeft < editor.scrollLeft || targetLeft > editor.scrollLeft + editor.clientWidth * 0.8) {
    editor.scrollLeft = Math.max(0, targetLeft - editor.clientWidth * 0.25);
  }
}

function lineNumberAtOffset(text, offset) {
  let line = 1;
  const end = Math.max(0, Math.min(Number(offset) || 0, text.length));
  for (let index = 0; index < end; index += 1) if (text.charCodeAt(index) === 10) line += 1;
  return line;
}

function updateSearchCount(index, truncated) {
  const pane = state[index];
  if (!searchCounts[index]) return;
  searchCounts[index].textContent = pane.searchResults.length
    ? `${pane.searchIndex + 1}/${pane.searchResults.length}${truncated ? '+' : ''}`
    : '0';
}

function resetSearch(index, { clearQuery = true } = {}) {
  const pane = state[index];
  pane.searchQuery = '';
  pane.searchResults = [];
  pane.searchIndex = -1;
  pane.searchSurface = activeSearchSurface(index);
  pane.truncated = false;
  if (clearQuery && searchInputs[index]) searchInputs[index].value = '';
  if (searchCounts[index]) searchCounts[index].textContent = '0';
  trees[index]?.querySelectorAll('.search-hit').forEach((node) => node.classList.remove('search-hit'));
}

function updateSearchPlaceholder(index) {
  const input = searchInputs[index];
  if (!input) return;
  const mode = currentMode().toUpperCase();
  input.placeholder = activeSearchSurface(index) === 'tree'
    ? `Search ${mode} Tree`
    : `Search ${mode} Code`;
  input.setAttribute('aria-label', input.placeholder);
}

function activeSearchSurface(index) {
  const treeTab = panes[index]?.querySelector('.view-btn[data-view="tree"]');
  const tree = trees[index];
  return treeTab?.classList.contains('active') && tree && !tree.classList.contains('hidden') ? 'tree' : 'code';
}

async function revealTreePath(index, path, mirror) {
  // Search must never switch Code/Tree automatically. This function is called
  // only when this pane is already in Tree view.
  if (activeSearchSurface(index) !== 'tree') return;

  const ancestors = pathAncestors(path, currentMode());
  for (const ancestor of ancestors.slice(0, -1)) await ensureExpanded(index, ancestor);
  await ensureVisible(index, path);
  highlightPath(index, path);

  if (mirror && syncTrees) {
    const other = index === 0 ? 1 : 0;
    // Do not force the other pane from Code to Tree either.
    if (activeSearchSurface(other) !== 'tree') return;
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
