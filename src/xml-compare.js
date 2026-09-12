import { MAX_DIFFS } from './core.js';
import { diffLines } from './line-diff.js';
import { annotateMovedLineDiffs, normalizeComparableText, normalizeCompareOptions } from './compare-normalization.js';

export function compareFormattedXml(leftFormatted, rightFormatted, options = {}) {
  const started = now();
  const left = String(leftFormatted ?? '');
  const right = String(rightFormatted ?? '');
  const compareOptions = normalizeCompareOptions(options);
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const comparableLeft = leftLines.map((line) => normalizeComparableText(line, compareOptions));
  const comparableRight = rightLines.map((line) => normalizeComparableText(line, compareOptions));
  const result = diffLines(comparableLeft, comparableRight, {
    maxDiffs: MAX_DIFFS,
    pathPrefix: '$xml',
  });
  const moved = annotateMovedLineDiffs(result.diffs, leftLines, rightLines, compareOptions);

  return {
    mode: 'xml',
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
