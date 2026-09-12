export const TEXT_FALLBACK_MAX_DIFFS = 20000;
const MAX_EDIT_DISTANCE = 4000;

export function compareTextPayloads({ mode, left, right, reason = '' }, maxDiffs = TEXT_FALLBACK_MAX_DIFFS) {
  const started = now();
  const leftFormatted = normalizeText(left);
  const rightFormatted = normalizeText(right);
  const leftLines = splitLines(leftFormatted);
  const rightLines = splitLines(rightFormatted);
  const result = diffLineEvents(leftLines, rightLines, maxDiffs);

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
    identical: result.diffs.length === 0 && !result.summary.truncated,
    elapsedMs: Math.round(now() - started),
  };
}

export function diffLineEvents(leftLines, rightLines, maxDiffs = TEXT_FALLBACK_MAX_DIFFS) {
  const a = Array.isArray(leftLines) ? leftLines : [];
  const b = Array.isArray(rightLines) ? rightLines : [];
  const n = a.length;
  const m = b.length;

  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix += 1;

  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix += 1;

  const aa = a.slice(prefix, n - suffix);
  const bb = b.slice(prefix, m - suffix);
  if (!aa.length && !bb.length) return emptyResult();
  if (!aa.length) return onlyAdded(prefix, bb.length, maxDiffs);
  if (!bb.length) return onlyRemoved(prefix, aa.length, maxDiffs);

  const max = aa.length + bb.length;
  const maxD = Math.min(max, MAX_EDIT_DISTANCE);
  const offset = maxD + 1;
  let v = new Int32Array(offset * 2 + 3);
  v.fill(-1);
  v[offset + 1] = 0;
  const trace = [];
  let endD = -1;

  outer: for (let d = 0; d <= maxD; d += 1) {
    trace.push(new Int32Array(v));
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
        break outer;
      }
    }
  }

  if (endD < 0) return coarseFallback(prefix, aa.length, bb.length, maxDiffs);

  let x = aa.length;
  let y = bb.length;
  const reverseOps = [];

  for (let d = endD; d > 0; d -= 1) {
    const prevV = trace[d - 1];
    const k = x - y;
    let prevK;
    if (k === -d || (k !== d && prevV[offset + k - 1] < prevV[offset + k + 1])) prevK = k + 1;
    else prevK = k - 1;

    const prevX = prevV[offset + prevK];
    const prevY = prevX - prevK;
    let matchedAfter = 0;
    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
      matchedAfter += 1;
    }

    if (x === prevX) {
      y -= 1;
      reverseOps.push({ type: 'added', rightLine: prefix + y + 1, breakAfter: matchedAfter > 0 });
    } else {
      x -= 1;
      reverseOps.push({ type: 'removed', leftLine: prefix + x + 1, breakAfter: matchedAfter > 0 });
    }
  }

  const ops = reverseOps.reverse();
  // breakAfter was recorded while walking backwards. A match encountered after
  // an edit in backtracking becomes a boundary before the next edit in forward
  // order, so move the marker to the preceding forward operation.
  const groups = [];
  let group = [];
  for (let index = 0; index < ops.length; index += 1) {
    group.push(ops[index]);
    const next = ops[index + 1];
    if (!next || next.breakAfter) {
      groups.push(group);
      group = [];
    }
  }
  if (group.length) groups.push(group);

  const diffs = [];
  let truncated = false;
  for (const changeGroup of groups) {
    appendNormalizedGroup(diffs, changeGroup, maxDiffs);
    if (diffs.length >= maxDiffs) {
      truncated = groups.length > 1 || changeGroup !== groups[groups.length - 1] || ops.length > maxDiffs;
      break;
    }
  }

  return finalize(diffs, truncated);
}

function appendNormalizedGroup(diffs, operations, maxDiffs) {
  const removed = operations.filter((item) => item.type === 'removed');
  const added = operations.filter((item) => item.type === 'added');
  const paired = Math.min(removed.length, added.length);

  for (let index = 0; index < paired && diffs.length < maxDiffs; index += 1) {
    diffs.push(makeDiff('modified', removed[index].leftLine, added[index].rightLine, diffs.length));
  }
  for (let index = paired; index < removed.length && diffs.length < maxDiffs; index += 1) {
    diffs.push(makeDiff('removed', removed[index].leftLine, null, diffs.length));
  }
  for (let index = paired; index < added.length && diffs.length < maxDiffs; index += 1) {
    diffs.push(makeDiff('added', null, added[index].rightLine, diffs.length));
  }
}

function coarseFallback(prefix, leftCount, rightCount, maxDiffs) {
  const diffs = [];
  const paired = Math.min(leftCount, rightCount);
  for (let index = 0; index < paired && diffs.length < maxDiffs; index += 1) {
    diffs.push(makeDiff('modified', prefix + index + 1, prefix + index + 1, diffs.length));
  }
  for (let index = paired; index < leftCount && diffs.length < maxDiffs; index += 1) {
    diffs.push(makeDiff('removed', prefix + index + 1, null, diffs.length));
  }
  for (let index = paired; index < rightCount && diffs.length < maxDiffs; index += 1) {
    diffs.push(makeDiff('added', null, prefix + index + 1, diffs.length));
  }
  return finalize(diffs, leftCount + rightCount > maxDiffs || leftCount + rightCount > MAX_EDIT_DISTANCE);
}

function onlyAdded(prefix, count, maxDiffs) {
  const diffs = [];
  const limit = Math.min(count, maxDiffs);
  for (let index = 0; index < limit; index += 1) {
    diffs.push(makeDiff('added', null, prefix + index + 1, diffs.length));
  }
  return finalize(diffs, count > maxDiffs);
}

function onlyRemoved(prefix, count, maxDiffs) {
  const diffs = [];
  const limit = Math.min(count, maxDiffs);
  for (let index = 0; index < limit; index += 1) {
    diffs.push(makeDiff('removed', prefix + index + 1, null, diffs.length));
  }
  return finalize(diffs, count > maxDiffs);
}

function makeDiff(type, leftLine, rightLine, index) {
  return {
    path: `$text[${index}]`,
    type,
    leftLine: leftLine || null,
    rightLine: rightLine || null,
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
  return { diffs, summary, leftChanged, rightChanged };
}

function emptyResult() {
  return {
    diffs: [],
    summary: { added: 0, removed: 0, modified: 0, truncated: false },
    leftChanged: [],
    rightChanged: [],
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
