import { DEFAULT_MAX_DIFFS, diffLines } from './line-diff.js';

export const TEXT_FALLBACK_MAX_DIFFS = DEFAULT_MAX_DIFFS;

export function compareTextPayloads({ mode, left, right, reason = '' }, maxDiffs = TEXT_FALLBACK_MAX_DIFFS) {
  const started = now();
  const leftFormatted = normalizeText(left);
  const rightFormatted = normalizeText(right);
  const leftLines = splitLines(leftFormatted);
  const rightLines = splitLines(rightFormatted);
  const result = diffLines(leftLines, rightLines, {
    maxDiffs,
    pathPrefix: '$text',
  });

  return {
    mode: mode === 'xml' ? 'xml' : 'json',
    comparisonKind: 'text',
    fallback: true,
    fallbackReason: String(reason || 'Structural parsing was unavailable, so a text comparison was used.'),
    leftFormatted,
    rightFormatted,
    leftChanged: result.leftChanged,
    rightChanged: result.rightChanged,
    diffs: result.diffs,
    ordered: result.diffs,
    summary: result.summary,
    identical: result.identical,
    elapsedMs: Math.round(now() - started),
  };
}

export function diffLineEvents(leftLines, rightLines, maxDiffs = TEXT_FALLBACK_MAX_DIFFS) {
  return diffLines(leftLines, rightLines, {
    maxDiffs,
    pathPrefix: '$text',
  });
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
