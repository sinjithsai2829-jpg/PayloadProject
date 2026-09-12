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

  for (let index = 0; index < result.length; index += 1) {
    const diff = result[index];
    if (diff.type === 'removed' && positiveLine(diff.leftLine)) {
      const line = String(leftLines?.[diff.leftLine - 1] ?? '');
      pushByKey(removedByText, normalizeComparableText(line, normalized), index);
    } else if (diff.type === 'added' && positiveLine(diff.rightLine)) {
      const line = String(rightLines?.[diff.rightLine - 1] ?? '');
      pushByKey(addedByText, normalizeComparableText(line, normalized), index);
    }
  }

  let movedPairs = 0;
  for (const [key, removedIndexes] of removedByText) {
    if (!key) continue;
    const addedIndexes = addedByText.get(key);
    if (!addedIndexes?.length) continue;
    const count = Math.min(removedIndexes.length, addedIndexes.length);
    const multiple = removedIndexes.length > 1 || addedIndexes.length > 1;

    for (let offset = 0; offset < count; offset += 1) {
      const removedIndex = removedIndexes[offset];
      const addedIndex = addedIndexes[offset];
      const moveId = `move-${++movedPairs}`;
      const removed = result[removedIndex];
      const added = result[addedIndex];
      removed.move = {
        id: moveId,
        role: 'from',
        counterpartDiffIndex: addedIndex,
        counterpartLine: added.rightLine || null,
        multiple,
      };
      added.move = {
        id: moveId,
        role: 'to',
        counterpartDiffIndex: removedIndex,
        counterpartLine: removed.leftLine || null,
        multiple,
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
