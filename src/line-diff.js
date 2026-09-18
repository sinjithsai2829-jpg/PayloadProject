import { findHistogramDifferenceRegions } from './histogram-diff.js';

export const DEFAULT_MAX_DIFFS = 20000;
export const DEFAULT_MAX_EDIT_DISTANCE = 4000;
export const HISTOGRAM_THRESHOLD_LINES = 256;

// Shared Histogram + bounded Myers line diff used by formatted JSON, formatted
// XML, and text fallback. Histogram finds stable rare-line anchors first;
// Myers is then applied only inside the unmatched regions for fine-grained
// replacement pairing. Line numbers in the result are always 1-based.
export function diffLines(
  leftLines,
  rightLines,
  {
    maxDiffs = DEFAULT_MAX_DIFFS,
    maxEditDistance = DEFAULT_MAX_EDIT_DISTANCE,
    pathPrefix = '$line',
  } = {},
) {
  const a = Array.isArray(leftLines) ? leftLines : [];
  const b = Array.isArray(rightLines) ? rightLines : [];
  const n = a.length;
  const m = b.length;

  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix += 1;

  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix += 1;

  const aEnd = suffix ? n - suffix : n;
  const bEnd = suffix ? m - suffix : m;
  const aa = a.slice(prefix, aEnd);
  const bb = b.slice(prefix, bEnd);

  if (!aa.length && !bb.length) return finalize([], false);
  if (!aa.length) {
    const operations = rangeOperationsAt('added', prefix, bb.length);
    return finalize(
      operations.slice(0, maxDiffs).map((operation, index) => makeDiff(operation, index, pathPrefix)),
      operations.length > maxDiffs,
    );
  }
  if (!bb.length) {
    const operations = rangeOperationsAt('removed', prefix, aa.length);
    return finalize(
      operations.slice(0, maxDiffs).map((operation, index) => makeDiff(operation, index, pathPrefix)),
      operations.length > maxDiffs,
    );
  }

  let operations;
  const useHistogram = aa.length + bb.length >= HISTOGRAM_THRESHOLD_LINES;

  if (useHistogram) {
    operations = histogramPartitionedOperations(aa, bb, prefix, maxEditDistance);
  }

  if (!operations) {
    operations = myersOperations(aa, bb, prefix, prefix, maxEditDistance);
  }

  if (!operations) {
    operations = coarseRegionOperations(prefix, prefix, aa.length, bb.length);
  }

  const diffs = normalizeOperations(operations, maxDiffs, pathPrefix);
  const editCount = operations.reduce((count, operation) => count + (operation.type === 'equal' ? 0 : 1), 0);
  return finalize(diffs, diffs.length >= maxDiffs && editCount > maxDiffs);
}

function histogramPartitionedOperations(a, b, base, maxEditDistance) {
  const regions = findHistogramDifferenceRegions(a, b);
  if (!regions.length) return [];

  const operations = [];
  for (const region of regions) {
    const leftCount = region.aHi - region.aLo;
    const rightCount = region.bHi - region.bLo;
    if (!leftCount && !rightCount) continue;

    const leftRegion = a.slice(region.aLo, region.aHi);
    const rightRegion = b.slice(region.bLo, region.bHi);
    const aBase = base + region.aLo;
    const bBase = base + region.bLo;

    const local = myersOperations(leftRegion, rightRegion, aBase, bBase, maxEditDistance)
      || coarseRegionOperations(aBase, bBase, leftCount, rightCount);

    // A Histogram match exists between adjacent unmatched regions. The sentinel
    // keeps normalizeOperations from pairing changes across that stable anchor.
    if (operations.length && local.length) operations.push({ type: 'equal', leftLine: null, rightLine: null });
    operations.push(...local);
  }
  return operations;
}

function myersOperations(a, b, aBase, bBase, maxEditDistance) {
  if (!a.length) return rangeOperationsAt('added', bBase, b.length);
  if (!b.length) return rangeOperationsAt('removed', aBase, a.length);

  const max = a.length + b.length;
  const maxD = Math.min(max, maxEditDistance);
  const offset = maxD + 1;
  let v = new Int32Array(offset * 2 + 3);
  v.fill(-1);
  v[offset + 1] = 0;

  // Each trace entry is captured after completing that edit-distance layer.
  // Backtracking needs the completed d-1 frontier.
  const trace = [];
  let endD = -1;

  for (let d = 0; d <= maxD; d += 1) {
    let completed = false;
    for (let k = -d; k <= d; k += 2) {
      const idx = offset + k;
      let x;
      if (k === -d || (k !== d && v[idx - 1] < v[idx + 1])) x = v[idx + 1];
      else x = v[idx - 1] + 1;

      let y = x - k;
      while (x < a.length && y < b.length && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[idx] = x;

      if (x >= a.length && y >= b.length) {
        endD = d;
        completed = true;
        break;
      }
    }

    trace.push(new Int32Array(v));
    if (completed) break;
  }

  if (endD < 0) return null;
  return backtrack(trace, endD, a.length, b.length, aBase, bBase, offset);
}

function backtrack(trace, endD, lengthA, lengthB, aBase, bBase, offset) {
  let x = lengthA;
  let y = lengthB;
  const reversed = [];

  for (let d = endD; d > 0; d -= 1) {
    const previous = trace[d - 1];
    const k = x - y;
    let previousK;
    if (k === -d || (k !== d && previous[offset + k - 1] < previous[offset + k + 1])) previousK = k + 1;
    else previousK = k - 1;

    const previousX = previous[offset + previousK];
    const previousY = previousX - previousK;

    while (x > previousX && y > previousY) {
      x -= 1;
      y -= 1;
      reversed.push({
        type: 'equal',
        leftLine: aBase + x + 1,
        rightLine: bBase + y + 1,
      });
    }

    if (x === previousX) {
      y -= 1;
      reversed.push({ type: 'added', leftLine: null, rightLine: bBase + y + 1 });
    } else {
      x -= 1;
      reversed.push({ type: 'removed', leftLine: aBase + x + 1, rightLine: null });
    }
  }

  while (x > 0 && y > 0) {
    x -= 1;
    y -= 1;
    reversed.push({
      type: 'equal',
      leftLine: aBase + x + 1,
      rightLine: bBase + y + 1,
    });
  }

  while (x > 0) {
    x -= 1;
    reversed.push({ type: 'removed', leftLine: aBase + x + 1, rightLine: null });
  }
  while (y > 0) {
    y -= 1;
    reversed.push({ type: 'added', leftLine: null, rightLine: bBase + y + 1 });
  }

  return reversed.reverse();
}

function normalizeOperations(operations, maxDiffs, pathPrefix) {
  const diffs = [];
  let group = [];

  const flush = () => {
    if (!group.length || diffs.length >= maxDiffs) {
      group = [];
      return;
    }

    const removed = group.filter((operation) => operation.type === 'removed');
    const added = group.filter((operation) => operation.type === 'added');
    const paired = Math.min(removed.length, added.length);

    for (let index = 0; index < paired && diffs.length < maxDiffs; index += 1) {
      diffs.push({
        path: `${pathPrefix}[${diffs.length}]`,
        type: 'modified',
        leftLine: removed[index].leftLine,
        rightLine: added[index].rightLine,
      });
    }
    for (let index = paired; index < removed.length && diffs.length < maxDiffs; index += 1) {
      diffs.push(makeDiff(removed[index], diffs.length, pathPrefix));
    }
    for (let index = paired; index < added.length && diffs.length < maxDiffs; index += 1) {
      diffs.push(makeDiff(added[index], diffs.length, pathPrefix));
    }
    group = [];
  };

  for (const operation of operations) {
    if (operation.type === 'equal') flush();
    else group.push(operation);
  }
  flush();
  return diffs;
}

function coarseRegionOperations(aBase, bBase, leftCount, rightCount) {
  const operations = [];
  for (let index = 0; index < leftCount; index += 1) {
    operations.push({ type: 'removed', leftLine: aBase + index + 1, rightLine: null });
  }
  for (let index = 0; index < rightCount; index += 1) {
    operations.push({ type: 'added', leftLine: null, rightLine: bBase + index + 1 });
  }
  return operations;
}

function rangeOperationsAt(type, base, count) {
  const operations = [];
  for (let index = 0; index < count; index += 1) {
    operations.push(type === 'added'
      ? { type, leftLine: null, rightLine: base + index + 1 }
      : { type, leftLine: base + index + 1, rightLine: null });
  }
  return operations;
}

function makeDiff(operation, index, pathPrefix) {
  return {
    path: `${pathPrefix}[${index}]`,
    type: operation.type,
    leftLine: operation.leftLine || null,
    rightLine: operation.rightLine || null,
  };
}

function finalize(diffs, truncated) {
  const summary = { added: 0, removed: 0, modified: 0, truncated: !!truncated };
  const leftChanged = [];
  const rightChanged = [];

  for (const diff of diffs) {
    summary[diff.type] += 1;
    if (diff.leftLine) leftChanged.push(diff.leftLine);
    if (diff.rightLine) rightChanged.push(diff.rightLine);
  }

  return {
    diffs,
    ordered: diffs,
    summary,
    leftChanged,
    rightChanged,
    identical: diffs.length === 0 && !summary.truncated,
  };
}
