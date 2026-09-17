import { MAX_DIFFS } from './core.js';
import { diffLines } from './line-diff.js';
import {
  annotateMovedLineDiffs,
  normalizeComparableText,
  normalizeCompareOptions,
} from './compare-normalization.js';

// Code view should behave like a traditional side-by-side diff: compare the
// formatted lines the user actually sees, align insertions/removals, pair nearby
// replacements as modifications, and then add moved-line metadata. Structural
// JSON diffs are still useful for Tree view, but they must not drive Code view
// because renamed keys or shifted records otherwise look like whole branches
// were removed and added.
export function compareFormattedCode(mode, leftFormatted, rightFormatted, options = {}) {
  const started = now();
  const normalizedMode = mode === 'xml' ? 'xml' : 'json';
  const left = String(leftFormatted ?? '');
  const right = String(rightFormatted ?? '');
  const compareOptions = normalizeCompareOptions(options);
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const comparableLeft = leftLines.map((line) => normalizeComparableText(line, compareOptions));
  const comparableRight = rightLines.map((line) => normalizeComparableText(line, compareOptions));
  const result = diffLines(comparableLeft, comparableRight, {
    maxDiffs: MAX_DIFFS,
    pathPrefix: normalizedMode === 'xml' ? '$xml' : '$jsonline',
  });
  const moved = annotateMovedLineDiffs(result.diffs, leftLines, rightLines, compareOptions);

  return {
    mode: normalizedMode,
    leftFormatted: left,
    rightFormatted: right,
    leftChanged: result.leftChanged,
    rightChanged: result.rightChanged,
    diffs: moved.diffs,
    ordered: moved.diffs,
    summary: { ...result.summary, moved: moved.movedPairs },
    identical: result.identical,
    compareOptions,
    movedPairs: moved.movedPairs,
    elapsedMs: Math.round(now() - started),
  };
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
