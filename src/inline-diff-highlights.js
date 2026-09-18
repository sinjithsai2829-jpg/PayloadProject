import { inlineDiffRanges } from './inline-text-diff.js';

const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const layers = [];
const frames = [0, 0];

let diffs = [];
let currentDiffIndex = -1;
let lineCache = [[], []];
let visualSegments = [[], []];

installStyles();
for (let index = 0; index < editors.length; index += 1) installPane(index);

window.addEventListener('payloaddiff:live-compare-updated', (event) => {
  const detail = event.detail || {};
  diffs = Array.isArray(detail.diffs) ? detail.diffs : [];
  currentDiffIndex = Number.isInteger(detail.currentDiffIndex) ? detail.currentDiffIndex : -1;
  rebuildVisualSegments();
  scheduleAll();
});

window.addEventListener('payloaddiff:diff-selection-changed', (event) => {
  const nextIndex = Number(event.detail?.currentDiffIndex);
  if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex === currentDiffIndex) return;
  currentDiffIndex = nextIndex;
  refreshCurrentSegments();
  scheduleAll();
});

window.addEventListener('payloaddiff:comparison-reset', clearAll);
document.querySelector('#clearBtn')?.addEventListener('click', () => requestAnimationFrame(clearAll));
document.querySelectorAll('.mode-btn').forEach((button) => button.addEventListener('click', () => requestAnimationFrame(clearAll)));

function installPane(index) {
  const editor = editors[index];
  const wrap = editor?.closest('.editor-wrap');
  if (!editor || !wrap) return;

  const layer = document.createElement('div');
  layer.className = 'inline-diff-layer';
  layer.setAttribute('aria-hidden', 'true');
  wrap.insertBefore(layer, editor);
  layers[index] = layer;

  editor.addEventListener('scroll', () => scheduleRender(index), { passive: true });
  editor.addEventListener('input', () => {
    lineCache[index] = splitLines(editor.value);
    rebuildVisualSegments();
    scheduleAll();
  });
  paneTabs(index)?.addEventListener('click', () => requestAnimationFrame(() => scheduleRender(index)));

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => scheduleRender(index));
    observer.observe(editor);
  } else {
    window.addEventListener('resize', () => scheduleRender(index), { passive: true });
  }
}

function rebuildVisualSegments() {
  lineCache = editors.map((editor) => splitLines(editor?.value || ''));
  visualSegments = [[], []];
  if (!diffs.length) return;

  const consumed = new Set();
  const removedByLine = new Map();
  const addedByLine = new Map();

  for (let index = 0; index < diffs.length; index += 1) {
    const diff = diffs[index];
    if (diff?.type === 'removed' && diff.leftLine) pushMap(removedByLine, diff.leftLine, index);
    if (diff?.type === 'added' && diff.rightLine) pushMap(addedByLine, diff.rightLine, index);
  }

  // A structural key rename is often reported as one remove plus one add even
  // though the formatted code occupies the same line on both sides. Pair those
  // events visually so users can see the exact replacement instead of two
  // unrelated full-line blocks.
  for (const [line, removedIndexes] of removedByLine) {
    const addedIndexes = addedByLine.get(line) || [];
    const count = Math.min(removedIndexes.length, addedIndexes.length);
    for (let offset = 0; offset < count; offset += 1) {
      const removedIndex = removedIndexes[offset];
      const addedIndex = addedIndexes[offset];
      consumed.add(removedIndex);
      consumed.add(addedIndex);
      addPairedSegments(removedIndex, addedIndex, line, line, 'replacement');
    }
  }

  for (let index = 0; index < diffs.length; index += 1) {
    if (consumed.has(index)) continue;
    const diff = diffs[index];
    if (!diff) continue;

    if (diff.leftLine && diff.rightLine) {
      addPairedSegments(index, index, diff.leftLine, diff.rightLine, 'modified');
      continue;
    }

    if (diff.leftLine) addWholeContentSegment(0, diff.leftLine, 'removed', index);
    if (diff.rightLine) addWholeContentSegment(1, diff.rightLine, 'added', index);
  }

  visualSegments[0].sort((a, b) => a.line - b.line || a.start - b.start);
  visualSegments[1].sort((a, b) => a.line - b.line || a.start - b.start);
}

function addPairedSegments(leftIndex, rightIndex, leftLine, rightLine, kind) {
  const leftText = lineCache[0][leftLine - 1] ?? '';
  const rightText = lineCache[1][rightLine - 1] ?? '';
  const ranges = inlineDiffRanges(leftText, rightText);
  const diffIndexes = leftIndex === rightIndex ? [leftIndex] : [leftIndex, rightIndex];
  const current = diffIndexes.includes(currentDiffIndex);

  for (const range of ranges.left) {
    visualSegments[0].push({
      line: leftLine,
      start: range.start,
      end: range.end,
      type: kind === 'replacement' ? 'removed' : 'modified',
      diffIndexes,
      current,
    });
  }
  for (const range of ranges.right) {
    visualSegments[1].push({
      line: rightLine,
      start: range.start,
      end: range.end,
      type: kind === 'replacement' ? 'added' : 'modified',
      diffIndexes,
      current,
    });
  }
}

function addWholeContentSegment(side, line, type, diffIndex) {
  const text = lineCache[side][line - 1] ?? '';
  const first = firstNonWhitespace(text);
  const end = Math.max(first + 1, text.length);
  visualSegments[side].push({
    line,
    start: first,
    end,
    type,
    diffIndexes: [diffIndex],
    current: currentDiffIndex === diffIndex,
  });
}

function refreshCurrentSegments() {
  for (const side of visualSegments) {
    for (const segment of side) {
      segment.current = Array.isArray(segment.diffIndexes) && segment.diffIndexes.includes(currentDiffIndex);
    }
  }
}

export function changedRange(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  let prefix = 0;
  const commonLimit = Math.min(a.length, b.length);
  while (prefix < commonLimit && a[prefix] === b[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < a.length - prefix
    && suffix < b.length - prefix
    && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) suffix += 1;

  return {
    leftStart: prefix,
    leftEnd: Math.max(prefix, a.length - suffix),
    rightStart: prefix,
    rightEnd: Math.max(prefix, b.length - suffix),
  };
}

function scheduleAll() {
  scheduleRender(0);
  scheduleRender(1);
}

function scheduleRender(index) {
  if (frames[index]) return;
  frames[index] = requestAnimationFrame(() => {
    frames[index] = 0;
    render(index);
  });
}

function render(index) {
  const editor = editors[index];
  const layer = layers[index];
  if (!editor || !layer) return;

  const treeActive = panes[index]?.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
  const segments = visualSegments[index];
  layer.classList.toggle('hidden', !!treeActive || !segments.length || editor.classList.contains('hidden'));
  if (layer.classList.contains('hidden')) {
    layer.replaceChildren();
    return;
  }

  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const charWidth = measureCharacterWidth(editor, style);
  const firstVisible = Math.max(1, Math.floor((editor.scrollTop - paddingTop) / lineHeight) + 1);
  const lastVisible = Math.ceil((editor.scrollTop + editor.clientHeight - paddingTop) / lineHeight) + 1;
  const fragment = document.createDocumentFragment();

  const startIndex = lowerBoundLine(segments, firstVisible - 1);
  for (let position = startIndex; position < segments.length; position += 1) {
    const segment = segments[position];
    if (segment.line > lastVisible + 1) break;

    const marker = document.createElement('div');
    marker.className = `inline-diff-segment ${segment.type}${segment.current ? ' current' : ''}`;
    marker.style.top = `${paddingTop + (segment.line - 1) * lineHeight - editor.scrollTop}px`;
    marker.style.left = `${paddingLeft + segment.start * charWidth - editor.scrollLeft}px`;
    marker.style.width = `${Math.max(charWidth * .8, (segment.end - segment.start) * charWidth)}px`;
    marker.style.height = `${lineHeight}px`;
    fragment.appendChild(marker);
  }

  layer.replaceChildren(fragment);
}

function measureCharacterWidth(editor, style) {
  const canvas = measureCharacterWidth.canvas || (measureCharacterWidth.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  if (!context) return (parseFloat(style.fontSize) || 13) * .62;
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return context.measureText('M').width || (parseFloat(style.fontSize) || 13) * .62;
}

function lowerBoundLine(segments, line) {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (segments[middle].line < line) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstNonWhitespace(text) {
  const match = String(text ?? '').match(/\S/);
  return match ? match.index : 0;
}

function pushMap(map, key, value) {
  const values = map.get(key) || [];
  values.push(value);
  map.set(key, values);
}

function splitLines(text) {
  return String(text ?? '').split('\n');
}

function paneTabs(index) {
  return panes[index]?.querySelector('.view-tabs') || null;
}

function clearAll() {
  diffs = [];
  currentDiffIndex = -1;
  visualSegments = [[], []];
  layers.forEach((layer) => {
    layer?.replaceChildren();
    layer?.classList.add('hidden');
  });
}

function installStyles() {
  if (document.querySelector('#inline-diff-highlight-styles')) return;
  const style = document.createElement('style');
  style.id = 'inline-diff-highlight-styles';
  style.textContent = `
    .inline-diff-layer {
      position: absolute;
      z-index: 1;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }

    .inline-diff-segment {
      position: absolute;
      border-radius: 2px;
      pointer-events: none;
    }

    .inline-diff-segment.removed {
      background: rgba(248,113,113,.38);
      box-shadow: inset 0 -2px 0 rgba(248,113,113,.9);
    }

    .inline-diff-segment.added {
      background: rgba(74,222,128,.34);
      box-shadow: inset 0 -2px 0 rgba(74,222,128,.9);
    }

    .inline-diff-segment.modified {
      background: rgba(251,191,36,.34);
      box-shadow: inset 0 -2px 0 rgba(251,191,36,.9);
    }

    .inline-diff-segment.current {
      box-shadow: inset 0 -2px 0 currentColor, 0 0 0 1px rgba(147,197,253,.7);
    }

    .inline-diff-segment.removed.current { color: #f87171; }
    .inline-diff-segment.added.current { color: #4ade80; }
    .inline-diff-segment.modified.current { color: #fbbf24; }
  `;
  document.head.appendChild(style);
}
