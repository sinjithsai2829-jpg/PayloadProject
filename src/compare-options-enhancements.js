import { annotateMovedLineDiffs } from './compare-normalization.js';
import { buildAlignedRows } from './alignment-model.js';

const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
let latestDetail = null;
let decorateFrame = 0;
let recompareTimer = 0;

installStyles();

window.addEventListener('payloaddiff:live-compare-updated', (event) => {
  latestDetail = event.detail || null;
  scheduleDecorate();
});

window.addEventListener('payloaddiff:compare-options-changed', () => {
  clearTimeout(recompareTimer);
  recompareTimer = window.setTimeout(() => {
    if (!window.PayloadDiffCompareSession?.isActive?.()) return;
    const left = editors[0]?.value || '';
    const right = editors[1]?.value || '';
    if (!left.trim() || !right.trim()) return;
    document.querySelector('#compareBtn')?.click();
  }, 80);
});

window.addEventListener('payloaddiff:word-wrap-layout', scheduleDecorate);
window.addEventListener('payloaddiff:view-surface-synced', scheduleDecorate);

function scheduleDecorate() {
  if (decorateFrame) return;
  decorateFrame = requestAnimationFrame(() => {
    decorateFrame = 0;
    decorate();
  });
}

function decorate() {
  const detail = latestDetail;
  if (!detail || !Array.isArray(detail.diffs)) return;
  const options = window.PayloadDiffCompareOptions?.get?.() || {};
  const leftText = editors[0]?.value || '';
  const rightText = editors[1]?.value || '';
  const leftLines = leftText.replace(/\r\n?/g, '\n').split('\n');
  const rightLines = rightText.replace(/\r\n?/g, '\n').split('\n');
  const moved = annotateMovedLineDiffs(detail.diffs, leftLines, rightLines, options);
  const aligned = buildAlignedRows(leftText, rightText, detail.diffs);

  document.querySelectorAll('.aligned-compare-row').forEach((row) => {
    row.classList.remove('diff-block-start', 'diff-block-end', 'moved-from', 'moved-to', 'moved-multiple');
    delete row.dataset.moveCounterpartLine;
  });

  if (options.groupNearbyDiffs !== false) decorateBlocks(aligned);
  if (options.detectMoves !== false) decorateMoves(aligned, moved.diffs);

  try {
    window.PayloadDiffDiagnostics?.log?.('debug', 'comparison.notepad-features-decorated', {
      movedPairs: moved.movedPairs,
      grouped: options.groupNearbyDiffs !== false,
      ignoreWhitespace: options.ignoreWhitespace === true,
      ignoreCase: options.ignoreCase === true,
    });
  } catch (_) {}
}

function decorateBlocks(aligned) {
  const changedRows = aligned.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.diffIndexes.length > 0);
  if (!changedRows.length) return;

  let blockStart = 0;
  for (let position = 1; position <= changedRows.length; position += 1) {
    const previous = changedRows[position - 1];
    const current = changedRows[position];
    const continues = current && current.index <= previous.index + 2;
    if (continues) continue;

    const first = changedRows[blockStart].index;
    const last = previous.index;
    for (const surface of document.querySelectorAll('.aligned-compare-view')) {
      surface.querySelector(`.aligned-compare-row[data-row-index="${first}"]`)?.classList.add('diff-block-start');
      surface.querySelector(`.aligned-compare-row[data-row-index="${last}"]`)?.classList.add('diff-block-end');
    }
    blockStart = position;
  }
}

function decorateMoves(aligned, diffs) {
  for (let diffIndex = 0; diffIndex < diffs.length; diffIndex += 1) {
    const move = diffs[diffIndex]?.move;
    if (!move) continue;
    const rowIndex = aligned.rowForDiff?.[diffIndex];
    if (!Number.isInteger(rowIndex) || rowIndex < 0) continue;

    const side = move.role === 'from' ? 0 : 1;
    const surface = document.querySelector(`.aligned-compare-view[data-pane="${side}"]`);
    const row = surface?.querySelector(`.aligned-compare-row[data-row-index="${rowIndex}"]`);
    if (!row) continue;
    row.classList.add(move.role === 'from' ? 'moved-from' : 'moved-to');
    if (move.multiple) row.classList.add('moved-multiple');
    row.dataset.moveCounterpartLine = String(move.counterpartLine || '');

    const placeholder = row.querySelector('.aligned-compare-text.placeholder');
    if (placeholder) {
      placeholder.textContent = move.role === 'from'
        ? `moved — appears at line ${move.counterpartLine || '?'} in File 2`
        : `moved — came from line ${move.counterpartLine || '?'} in File 1`;
    }
  }
}

function installStyles() {
  if (document.querySelector('#compare-options-enhancement-styles')) return;
  const style = document.createElement('style');
  style.id = 'compare-options-enhancement-styles';
  style.textContent = `
    .aligned-compare-row.diff-block-start { box-shadow: inset 0 1px 0 rgba(148,163,184,.42); }
    .aligned-compare-row.diff-block-end { box-shadow: inset 0 -1px 0 rgba(148,163,184,.42); }
    .aligned-compare-row.diff-block-start.diff-block-end { box-shadow: inset 0 1px 0 rgba(148,163,184,.42), inset 0 -1px 0 rgba(148,163,184,.42); }

    .aligned-compare-row.moved-from,
    .aligned-compare-row.moved-to {
      background-color: rgba(168,85,247,.18) !important;
      border-left-color: #c084fc !important;
    }
    .aligned-compare-row.moved-from .aligned-compare-gutter::before,
    .aligned-compare-row.moved-to .aligned-compare-gutter::before {
      content: '↕';
      position: absolute;
      left: 7px;
      color: #c084fc;
      font-weight: 800;
    }
    .aligned-compare-row.moved-multiple .aligned-compare-gutter::before { content: '⇅'; }
    .aligned-compare-row.moved-from .aligned-compare-text::after,
    .aligned-compare-row.moved-to .aligned-compare-text::after {
      content: ' moved';
      margin-left: 10px;
      padding: 1px 5px;
      border: 1px solid rgba(192,132,252,.55);
      border-radius: 999px;
      color: #d8b4fe;
      font: 600 10px/1.4 Inter, ui-sans-serif, system-ui, sans-serif;
      vertical-align: 1px;
    }
    html[data-theme="light"] .aligned-compare-row.moved-from,
    html[data-theme="light"] .aligned-compare-row.moved-to { background-color: rgba(147,51,234,.10) !important; border-left-color:#9333ea !important; }
    html[data-theme="light"] .aligned-compare-row.moved-from .aligned-compare-gutter::before,
    html[data-theme="light"] .aligned-compare-row.moved-to .aligned-compare-gutter::before,
    html[data-theme="light"] .aligned-compare-row.moved-from .aligned-compare-text::after,
    html[data-theme="light"] .aligned-compare-row.moved-to .aligned-compare-text::after { color:#7e22ce; }
  `;
  document.head.appendChild(style);
}
