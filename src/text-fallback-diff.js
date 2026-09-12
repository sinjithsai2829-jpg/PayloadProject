import { DEFAULT_MAX_DIFFS, diffLines } from './line-diff.js';
import { annotateMovedLineDiffs, normalizeComparableText, normalizeCompareOptions } from './compare-normalization.js';

export const TEXT_FALLBACK_MAX_DIFFS = DEFAULT_MAX_DIFFS;

export function compareTextPayloads({ mode, left, right, reason = '', options = {} }, maxDiffs = TEXT_FALLBACK_MAX_DIFFS) {
  const started = now();
  const compareOptions = normalizeCompareOptions(options);
  const leftFormatted = normalizeText(left);
  const rightFormatted = normalizeText(right);
  const leftLines = splitLines(leftFormatted);
  const rightLines = splitLines(rightFormatted);
  const comparableLeft = leftLines.map((line) => normalizeComparableText(line, compareOptions));
  const comparableRight = rightLines.map((line) => normalizeComparableText(line, compareOptions));
  const result = diffLines(comparableLeft, comparableRight, {
    maxDiffs,
    pathPrefix: '$text',
  });
  const moved = annotateMovedLineDiffs(result.diffs, leftLines, rightLines, compareOptions);

  return {
    mode: mode === 'xml' ? 'xml' : 'json',
    comparisonKind: 'text',
    fallback: true,
    fallbackReason: String(reason || 'Structural parsing was unavailable, so a text comparison was used.'),
    leftFormatted,
    rightFormatted,
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

export function diffLineEvents(leftLines, rightLines, maxDiffs = TEXT_FALLBACK_MAX_DIFFS, options = {}) {
  const compareOptions = normalizeCompareOptions(options);
  const comparableLeft = leftLines.map((line) => normalizeComparableText(line, compareOptions));
  const comparableRight = rightLines.map((line) => normalizeComparableText(line, compareOptions));
  const result = diffLines(comparableLeft, comparableRight, {
    maxDiffs,
    pathPrefix: '$text',
  });
  return {
    ...result,
    diffs: annotateMovedLineDiffs(result.diffs, leftLines, rightLines, compareOptions).diffs,
  };
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

function splitLines(text) {
  return text === '' ? [] : text.split('\n');
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
