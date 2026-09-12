import { MAX_DIFFS } from './core.js';
import { diffLines } from './line-diff.js';

export function compareFormattedXml(leftFormatted, rightFormatted) {
  const started = now();
  const left = String(leftFormatted ?? '');
  const right = String(rightFormatted ?? '');
  const result = diffLines(left.split('\n'), right.split('\n'), {
    maxDiffs: MAX_DIFFS,
    pathPrefix: '$xml',
  });

  return {
    mode: 'xml',
    leftFormatted: left,
    rightFormatted: right,
    leftChanged: result.leftChanged,
    rightChanged: result.rightChanged,
    diffs: result.diffs,
    ordered: result.diffs,
    summary: result.summary,
    identical: result.identical,
    elapsedMs: Math.round(now() - started),
  };
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
