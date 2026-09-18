export const DEFAULT_COMPARE_OPTIONS = Object.freeze({
  detectMoves: true,
  ignoreWhitespace: false,
  ignoreCase: false,
  groupNearbyDiffs: true,
});

export function normalizeCompareOptions(value = {}) {
  return {
    detectMoves: value.detectMoves !== false,
    ignoreWhitespace: value.ignoreWhitespace === true,
    ignoreCase: value.ignoreCase === true,
    groupNearbyDiffs: value.groupNearbyDiffs !== false,
  };
}

export function normalizeComparableText(value, options = {}) {
  const normalized = normalizeCompareOptions(options);
  let text = String(value ?? '');
  if (normalized.ignoreWhitespace) text = text.replace(/\s+/g, ' ').trim();
  if (normalized.ignoreCase) text = text.toLocaleLowerCase();
  return text;
}

export function annotateMovedLineDiffs(diffs, leftLines, rightLines, options = {}) {
  const normalized = normalizeCompareOptions(options);
  const source = Array.isArray(diffs) ? diffs : [];
  if (!normalized.detectMoves || !source.length) {
    return { diffs: source.map((diff) => ({ ...diff })), movedPairs: 0 };
  }

  const result = source.map((diff) => ({ ...diff }));
  const removedByText = new Map();
  const addedByText = new Map();
  const removedByLine = new Map();
  const addedByLine = new Map();

  const comparableLeft = (leftLines || []).map((line) => normalizeComparableText(line, normalized));
  const comparableRight = (rightLines || []).map((line) => normalizeComparableText(line, normalized));

  for (let index = 0; index < result.length; index += 1) {
    const diff = result[index];
    const leftLine = positiveLine(diff.leftLine);
    const rightLine = positiveLine(diff.rightLine);
    if (diff.type === 'removed' && leftLine) {
      const key = comparableLeft[leftLine - 1] ?? '';
      pushByKey(removedByText, key, index);
      removedByLine.set(leftLine, index);
    } else if (diff.type === 'added' && rightLine) {
      const key = comparableRight[rightLine - 1] ?? '';
      pushByKey(addedByText, key, index);
      addedByLine.set(rightLine, index);
    }
  }

  // ComparePlus-style move matching starts from unique changed lines, then
  // expands the match forward/backward. Repeated lines are deliberately not
  // paired on their own because that creates convincing but incorrect moves in
  // JSON arrays and XML documents containing many identical braces/tags.
  const paired = new Set();
  let movedPairs = 0;

  for (const [key, removedIndexes] of removedByText) {
    const addedIndexes = addedByText.get(key);
    if (!key || removedIndexes.length !== 1 || addedIndexes?.length !== 1) continue;

    const anchorRemovedIndex = removedIndexes[0];
    const anchorAddedIndex = addedIndexes[0];
    if (paired.has(anchorRemovedIndex) || paired.has(anchorAddedIndex)) continue;

    const anchorLeft = positiveLine(result[anchorRemovedIndex].leftLine);
    const anchorRight = positiveLine(result[anchorAddedIndex].rightLine);
    if (!anchorLeft || !anchorRight || anchorLeft === anchorRight) continue;

    let leftStart = anchorLeft;
    let rightStart = anchorRight;
    let leftEnd = anchorLeft;
    let rightEnd = anchorRight;

    while (leftStart > 1 && rightStart > 1) {
      const removedIndex = removedByLine.get(leftStart - 1);
      const addedIndex = addedByLine.get(rightStart - 1);
      if (removedIndex == null || addedIndex == null || paired.has(removedIndex) || paired.has(addedIndex)) break;
      if ((comparableLeft[leftStart - 2] ?? '') !== (comparableRight[rightStart - 2] ?? '')) break;
      leftStart -= 1;
      rightStart -= 1;
    }

    while (leftEnd < comparableLeft.length && rightEnd < comparableRight.length) {
      const removedIndex = removedByLine.get(leftEnd + 1);
      const addedIndex = addedByLine.get(rightEnd + 1);
      if (removedIndex == null || addedIndex == null || paired.has(removedIndex) || paired.has(addedIndex)) break;
      if ((comparableLeft[leftEnd] ?? '') !== (comparableRight[rightEnd] ?? '')) break;
      leftEnd += 1;
      rightEnd += 1;
    }

    const moveId = `move-${++movedPairs}`;
    const blockLength = Math.min(leftEnd - leftStart, rightEnd - rightStart) + 1;
    for (let offset = 0; offset < blockLength; offset += 1) {
      const leftLine = leftStart + offset;
      const rightLine = rightStart + offset;
      const removedIndex = removedByLine.get(leftLine);
      const addedIndex = addedByLine.get(rightLine);
      if (removedIndex == null || addedIndex == null) continue;
      if (paired.has(removedIndex) || paired.has(addedIndex)) continue;
      if ((comparableLeft[leftLine - 1] ?? '') !== (comparableRight[rightLine - 1] ?? '')) continue;

      paired.add(removedIndex);
      paired.add(addedIndex);
      result[removedIndex].move = {
        id: moveId,
        role: 'from',
        counterpartDiffIndex: addedIndex,
        counterpartLine: rightLine,
        multiple: false,
      };
      result[addedIndex].move = {
        id: moveId,
        role: 'to',
        counterpartDiffIndex: removedIndex,
        counterpartLine: leftLine,
        multiple: false,
      };
    }
  }

  return { diffs: result, movedPairs };
}

export function comparableJsonPrimitiveEqual(left, right, options = {}) {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const normalized = normalizeCompareOptions(options);
  if (!normalized.ignoreCase && !normalized.ignoreWhitespace) return false;
  return normalizeComparableText(left, normalized) === normalizeComparableText(right, normalized);
}

export function stableJsonSignature(value, options = {}) {
  const normalized = normalizeCompareOptions(options);
  return stableSerialize(value, normalized);
}

function stableSerialize(value, options) {
  if (value === null) return 'null';
  if (typeof value === 'string') return `s:${JSON.stringify(normalizeComparableText(value, options))}`;
  if (typeof value === 'number') return `n:${Object.is(value, -0) ? '-0' : String(value)}`;
  if (typeof value === 'boolean') return value ? 'b:1' : 'b:0';
  if (Array.isArray(value)) return `a:[${value.map((item) => stableSerialize(item, options)).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `o:{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key], options)}`).join(',')}}`;
  }
  return `${typeof value}:${String(value)}`;
}

function pushByKey(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function positiveLine(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
