export const DEFAULT_MAX_DIFFS = 20000;
export const DEFAULT_MAX_EDIT_DISTANCE = 4000;

// Shared bounded Myers line diff used by structural XML comparison and the
// JSON/XML text fallback. Line numbers in the result are always 1-based.
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
  if (!aa.length) return finalize(
    rangeOperations('added', prefix, bb.length).slice(0, maxDiffs)
      .map((operation, index) => makeDiff(operation, index, pathPrefix)),
    bb.length > maxDiffs,
  );
  if (!bb.length) return finalize(
    rangeOperations('removed', prefix, aa.length).slice(0, maxDiffs)
      .map((operation, index) => makeDiff(operation, index, pathPrefix)),
    aa.length > maxDiffs,
  );

  const max = aa.length + bb.length;
  const maxD = Math.min(max, maxEditDistance);
  const offset = maxD + 1;
  let v = new Int32Array(offset * 2 + 3);
  v.fill(-1);
  v[offset + 1] = 0;

  // IMPORTANT: each trace entry is captured AFTER completing that edit-distance
  // layer. Backtracking needs the completed d-1 frontier. Capturing before the
  // layer causes an off-by-one line bug (e.g. a change on line 7 reports line 6).
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
      while (x < aa.length && y < bb.length && aa[x] === bb[y]) {
        x += 1;
        y += 1;
      }
      v[idx] = x;

      if (x >= aa.length && y >= bb.length) {
        endD = d;
        completed = true;
        break;
      }
    }

    trace.push(new Int32Array(v));
    if (completed) break;
  }

  if (endD < 0) return coarseFallback(prefix, aa.length, bb.length, maxDiffs, pathPrefix);

  const operations = backtrack(trace, endD, aa.length, bb.length, prefix, offset);
  const diffs = normalizeOperations(operations, maxDiffs, pathPrefix);
  const editCount = operations.reduce((count, operation) => count + (operation.type === 'equal' ? 0 : 1), 0);
  return finalize(diffs, diffs.length >= maxDiffs && editCount > maxDiffs);
}

function backtrack(trace, endD, lengthA, lengthB, prefix, offset) {
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
        leftLine: prefix + x + 1,
        rightLine: prefix + y + 1,
      });
    }

    if (x === previousX) {
      y -= 1;
      reversed.push({ type: 'added', leftLine: null, rightLine: prefix + y + 1 });
    } else {
      x -= 1;
      reversed.push({ type: 'removed', leftLine: prefix + x + 1, rightLine: null });
    }
  }

  // Consume the d=0 leading snake in the trimmed middle section.
  while (x > 0 && y > 0) {
    x -= 1;
    y -= 1;
    reversed.push({
      type: 'equal',
      leftLine: prefix + x + 1,
      rightLine: prefix + y + 1,
    });
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

function coarseFallback(prefix, leftCount, rightCount, maxDiffs, pathPrefix) {
  const diffs = [];
  const paired = Math.min(leftCount, rightCount);

  for (let index = 0; index < paired && diffs.length < maxDiffs; index += 1) {
    diffs.push({
      path: `${pathPrefix}[${diffs.length}]`,
      type: 'modified',
      leftLine: prefix + index + 1,
      rightLine: prefix + index + 1,
    });
  }
  for (let index = paired; index < leftCount && diffs.length < maxDiffs; index += 1) {
    diffs.push({
      path: `${pathPrefix}[${diffs.length}]`,
      type: 'removed',
      leftLine: prefix + index + 1,
      rightLine: null,
    });
  }
  for (let index = paired; index < rightCount && diffs.length < maxDiffs; index += 1) {
    diffs.push({
      path: `${pathPrefix}[${diffs.length}]`,
      type: 'added',
      leftLine: null,
      rightLine: prefix + index + 1,
    });
  }

  return finalize(diffs, leftCount + rightCount > maxDiffs || leftCount + rightCount > DEFAULT_MAX_EDIT_DISTANCE);
}

function rangeOperations(type, prefix, count) {
  const operations = [];
  for (let index = 0; index < count; index += 1) {
    operations.push(type === 'added'
      ? { type, leftLine: null, rightLine: prefix + index + 1 }
      : { type, leftLine: prefix + index + 1, rightLine: null });
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
