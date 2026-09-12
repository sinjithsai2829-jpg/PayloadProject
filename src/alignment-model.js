export function buildAlignedRows(leftText, rightText, diffs = []) {
  const leftLines = splitLines(leftText);
  const rightLines = splitLines(rightText);
  const rows = [];
  let leftCursor = 1;
  let rightCursor = 1;

  const ordered = (Array.isArray(diffs) ? diffs : [])
    .map((diff, index) => ({ ...diff, diffIndex: index }))
    .filter((diff) => positiveLine(diff.leftLine) || positiveLine(diff.rightLine));

  // Only one-sided events change vertical alignment. Modified rows consume one
  // physical line from each side, so they do not need spacer rows.
  const gaps = ordered.filter((diff) => !!positiveLine(diff.leftLine) !== !!positiveLine(diff.rightLine));

  for (const gap of gaps) {
    const leftLine = positiveLine(gap.leftLine);
    const rightLine = positiveLine(gap.rightLine);

    if (leftLine) {
      // Pair all unchanged rows leading up to the removed line. A previous
      // insertion/removal may have shifted the opposite cursor, which is why
      // cursors are advanced independently rather than pairing by line number.
      while (leftCursor < leftLine && leftCursor <= leftLines.length && rightCursor <= rightLines.length) {
        rows.push(makeRow(leftCursor, rightCursor));
        leftCursor += 1;
        rightCursor += 1;
      }
      while (leftCursor < leftLine && leftCursor <= leftLines.length) {
        rows.push(makeRow(leftCursor, null));
        leftCursor += 1;
      }
      if (leftLine >= leftCursor && leftLine <= leftLines.length) {
        rows.push(makeRow(leftLine, null, 'removed', gap.diffIndex));
        leftCursor = leftLine + 1;
      }
      continue;
    }

    while (rightCursor < rightLine && rightCursor <= rightLines.length && leftCursor <= leftLines.length) {
      rows.push(makeRow(leftCursor, rightCursor));
      leftCursor += 1;
      rightCursor += 1;
    }
    while (rightCursor < rightLine && rightCursor <= rightLines.length) {
      rows.push(makeRow(null, rightCursor));
      rightCursor += 1;
    }
    if (rightLine >= rightCursor && rightLine <= rightLines.length) {
      rows.push(makeRow(null, rightLine, 'added', gap.diffIndex));
      rightCursor = rightLine + 1;
    }
  }

  while (leftCursor <= leftLines.length && rightCursor <= rightLines.length) {
    rows.push(makeRow(leftCursor, rightCursor));
    leftCursor += 1;
    rightCursor += 1;
  }
  while (leftCursor <= leftLines.length) {
    rows.push(makeRow(leftCursor, null));
    leftCursor += 1;
  }
  while (rightCursor <= rightLines.length) {
    rows.push(makeRow(null, rightCursor));
    rightCursor += 1;
  }

  const rowByLeftLine = new Map();
  const rowByRightLine = new Map();
  rows.forEach((row, rowIndex) => {
    row.rowIndex = rowIndex;
    if (row.leftLine) rowByLeftLine.set(row.leftLine, rowIndex);
    if (row.rightLine) rowByRightLine.set(row.rightLine, rowIndex);
  });

  // Attach every logical diff (including modified rows) to the aligned row.
  for (const diff of ordered) {
    const leftLine = positiveLine(diff.leftLine);
    const rightLine = positiveLine(diff.rightLine);
    let rowIndex = null;

    if (leftLine && rightLine) {
      const leftRow = rowByLeftLine.get(leftLine);
      const rightRow = rowByRightLine.get(rightLine);
      if (leftRow === rightRow) rowIndex = leftRow;
      else rowIndex = leftRow ?? rightRow ?? null;
    } else if (leftLine) rowIndex = rowByLeftLine.get(leftLine) ?? null;
    else if (rightLine) rowIndex = rowByRightLine.get(rightLine) ?? null;

    if (rowIndex == null || !rows[rowIndex]) continue;
    const row = rows[rowIndex];
    row.diffIndexes.push(diff.diffIndex);
    row.type = mergeType(row.type, normalizeType(diff.type));
  }

  return {
    rows,
    leftLines,
    rightLines,
    placeholderCount: rows.reduce((count, row) => count + (row.leftLine == null || row.rightLine == null ? 1 : 0), 0),
    rowForDiff: buildRowForDiff(rows, ordered.length),
  };
}

export function changedTextRange(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  let prefix = 0;
  const limit = Math.min(a.length, b.length);
  while (prefix < limit && a[prefix] === b[prefix]) prefix += 1;

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

function makeRow(leftLine, rightLine, type = null, diffIndex = null) {
  return {
    rowIndex: -1,
    leftLine: positiveLine(leftLine),
    rightLine: positiveLine(rightLine),
    type: type ? normalizeType(type) : null,
    diffIndexes: Number.isInteger(diffIndex) ? [diffIndex] : [],
  };
}

function buildRowForDiff(rows, diffCount) {
  const result = new Array(diffCount).fill(-1);
  for (const row of rows) {
    for (const diffIndex of row.diffIndexes) {
      if (diffIndex >= 0 && diffIndex < result.length && result[diffIndex] < 0) result[diffIndex] = row.rowIndex;
    }
  }
  return result;
}

function mergeType(existing, incoming) {
  if (!existing) return incoming;
  if (existing === incoming) return existing;
  return 'modified';
}

function normalizeType(type) {
  if (type === 'added' || type === 'removed') return type;
  return 'modified';
}

function positiveLine(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function splitLines(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
}
