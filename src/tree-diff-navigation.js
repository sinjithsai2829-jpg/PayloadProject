const panes = [...document.querySelectorAll('.pane')];
const trees = [document.querySelector('#tree0'), document.querySelector('#tree1')];

let revealRevision = 0;

window.addEventListener('payloaddiff:live-compare-updated', (event) => {
  const detail = event.detail || {};
  if (detail.mode !== 'json' || !Array.isArray(detail.diffs)) return;
  const index = Number.isInteger(detail.currentDiffIndex) ? detail.currentDiffIndex : -1;
  const diff = index >= 0 ? detail.diffs[index] : null;
  const revision = ++revealRevision;

  clearCurrentRows();
  if (!diff?.path) return;

  for (let paneIndex = 0; paneIndex < panes.length; paneIndex += 1) {
    if (!treeIsActive(paneIndex)) continue;
    revealJsonTreePath(paneIndex, diff.path, revision);
  }
});

window.addEventListener('payloaddiff:comparison-reset', () => {
  revealRevision += 1;
  clearCurrentRows();
});

async function revealJsonTreePath(paneIndex, path, revision) {
  const tree = trees[paneIndex];
  if (!tree) return;

  const ancestors = pathAncestors(path);
  for (let position = 0; position < ancestors.length - 1; position += 1) {
    if (revision !== revealRevision || !treeIsActive(paneIndex)) return;
    const ancestor = ancestors[position];
    await ensurePathRendered(paneIndex, ancestor, revision);
    const row = findRow(tree, ancestor);
    const toggle = row?.querySelector('.tree-toggle');
    if (toggle && !toggle.disabled && toggle.textContent === '▸') {
      toggle.click();
      await nextFrame();
    }
  }

  if (revision !== revealRevision || !treeIsActive(paneIndex)) return;
  await ensurePathRendered(paneIndex, path, revision);

  // Added/removed nodes legitimately exist on only one side. If the exact path
  // is absent in this pane, highlight the deepest rendered ancestor instead.
  let target = findRow(tree, path);
  if (!target) {
    for (let position = ancestors.length - 2; position >= 0 && !target; position -= 1) {
      target = findRow(tree, ancestors[position]);
    }
  }
  if (!target) return;

  tree.querySelectorAll('.tree-diff-current').forEach((row) => row.classList.remove('tree-diff-current'));
  target.classList.add('tree-diff-current');
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

async function ensurePathRendered(paneIndex, path, revision) {
  const tree = trees[paneIndex];
  if (!tree) return;
  if (findRow(tree, path)) return;

  // Tree rendering is lazy in groups of 250. Expand the relevant ancestor and
  // progressively request more rows until the path appears or no more button
  // remains. This keeps navigator behavior correct for very large arrays.
  const parent = parentPath(path);
  if (parent && parent !== path) {
    const parentAncestors = pathAncestors(parent);
    for (const ancestor of parentAncestors) {
      if (revision !== revealRevision) return;
      const row = findRow(tree, ancestor);
      const toggle = row?.querySelector('.tree-toggle');
      if (toggle && !toggle.disabled && toggle.textContent === '▸') {
        toggle.click();
        await nextFrame();
      }
    }
  }

  for (let guard = 0; guard < 250 && !findRow(tree, path); guard += 1) {
    if (revision !== revealRevision || !treeIsActive(paneIndex)) return;
    const moreButtons = [...tree.querySelectorAll('.tree-more')];
    if (!moreButtons.length) break;
    moreButtons[moreButtons.length - 1].click();
    await nextFrame();
  }
}

function treeIsActive(index) {
  return !!panes[index]?.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
}

function findRow(tree, path) {
  for (const row of tree.querySelectorAll('.tree-row[data-path]')) {
    if (row.dataset.path === path) return row;
  }
  return null;
}

function pathAncestors(path) {
  const out = ['$'];
  if (!path || path === '$') return out;
  let current = '$';
  let index = 1;

  while (index < path.length) {
    const start = index;
    if (path[index] === '.') {
      index += 1;
      while (index < path.length && path[index] !== '.' && path[index] !== '[') index += 1;
    } else if (path[index] === '[') {
      index += 1;
      let quoted = false;
      let escaped = false;
      while (index < path.length) {
        const char = path[index++];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          quoted = !quoted;
          continue;
        }
        if (char === ']' && !quoted) break;
      }
    } else {
      index += 1;
      continue;
    }
    current += path.slice(start, index);
    out.push(current);
  }
  return out;
}

function parentPath(path) {
  const ancestors = pathAncestors(path);
  return ancestors.length > 1 ? ancestors[ancestors.length - 2] : null;
}

function clearCurrentRows() {
  trees.forEach((tree) => tree?.querySelectorAll('.tree-diff-current').forEach((row) => row.classList.remove('tree-diff-current')));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

const style = document.createElement('style');
style.id = 'tree-diff-navigation-styles';
style.textContent = `
  .tree-row.tree-diff-current {
    outline: 2px solid rgba(96,165,250,.95);
    outline-offset: -2px;
    position: relative;
    z-index: 2;
  }
`;
document.head.appendChild(style);
