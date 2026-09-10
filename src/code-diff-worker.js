const MAX_DIFFS = 20000;

self.onmessage = ({ data }) => {
  const { id, left, right } = data;
  try {
    const leftValue = JSON.parse(left);
    const rightValue = JSON.parse(right);
    const leftMap = buildLineMap(leftValue);
    const rightMap = buildLineMap(rightValue);
    const diffs = [];
    walkDiff(leftValue, rightValue, '$', diffs);

    const result = {
      left: { added: [], removed: [], modified: [] },
      right: { added: [], removed: [], modified: [] },
      truncated: diffs.length >= MAX_DIFFS,
    };

    const seen = {
      leftAdded: new Set(), leftRemoved: new Set(), leftModified: new Set(),
      rightAdded: new Set(), rightRemoved: new Set(), rightModified: new Set(),
    };

    for (const diff of diffs) {
      const leftLine = leftMap.get(diff.path);
      const rightLine = rightMap.get(diff.path);

      if (diff.type === 'added') {
        if (rightLine && !seen.rightAdded.has(rightLine)) {
          seen.rightAdded.add(rightLine);
          result.right.added.push(rightLine);
        }
      } else if (diff.type === 'removed') {
        if (leftLine && !seen.leftRemoved.has(leftLine)) {
          seen.leftRemoved.add(leftLine);
          result.left.removed.push(leftLine);
        }
      } else {
        if (leftLine && !seen.leftModified.has(leftLine)) {
          seen.leftModified.add(leftLine);
          result.left.modified.push(leftLine);
        }
        if (rightLine && !seen.rightModified.has(rightLine)) {
          seen.rightModified.add(rightLine);
          result.right.modified.push(rightLine);
        }
      }
    }

    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
};

function walkDiff(left, right, path, diffs) {
  if (diffs.length >= MAX_DIFFS || Object.is(left, right)) return;

  const lt = typeOf(left);
  const rt = typeOf(right);
  if (lt !== rt) {
    diffs.push({ path, type: 'modified' });
    return;
  }

  if (lt === 'array') {
    const max = Math.max(left.length, right.length);
    for (let i = 0; i < max && diffs.length < MAX_DIFFS; i += 1) {
      const childPath = `${path}[${i}]`;
      if (i >= left.length) diffs.push({ path: childPath, type: 'added' });
      else if (i >= right.length) diffs.push({ path: childPath, type: 'removed' });
      else walkDiff(left[i], right[i], childPath, diffs);
    }
    return;
  }

  if (lt === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    const leftSet = new Set(leftKeys);
    const rightSet = new Set(rightKeys);

    for (const key of leftKeys) {
      if (diffs.length >= MAX_DIFFS) return;
      const childPath = joinPath(path, key);
      if (!rightSet.has(key)) diffs.push({ path: childPath, type: 'removed' });
      else walkDiff(left[key], right[key], childPath, diffs);
    }
    for (const key of rightKeys) {
      if (diffs.length >= MAX_DIFFS) return;
      if (!leftSet.has(key)) diffs.push({ path: joinPath(path, key), type: 'added' });
    }
    return;
  }

  diffs.push({ path, type: 'modified' });
}

function buildLineMap(value) {
  const lines = [];
  const map = new Map();
  emit(value, '$', 0, '', false, lines, map);
  return map;
}

function emit(value, path, depth, prefix, comma, lines, map) {
  const indent = '  '.repeat(depth);
  map.set(path, lines.length + 1);
  const suffix = comma ? ',' : '';
  const type = typeOf(value);

  if (type !== 'object' && type !== 'array') {
    lines.push(`${indent}${prefix}${JSON.stringify(value)}${suffix}`);
    return;
  }

  if (type === 'array') {
    if (!value.length) {
      lines.push(`${indent}${prefix}[]${suffix}`);
      return;
    }
    lines.push(`${indent}${prefix}[`);
    for (let i = 0; i < value.length; i += 1) {
      emit(value[i], `${path}[${i}]`, depth + 1, '', i < value.length - 1, lines, map);
    }
    lines.push(`${indent}]${suffix}`);
    return;
  }

  const keys = Object.keys(value);
  if (!keys.length) {
    lines.push(`${indent}${prefix}{}${suffix}`);
    return;
  }

  lines.push(`${indent}${prefix}{`);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    emit(value[key], joinPath(path, key), depth + 1, `${JSON.stringify(key)}: `, i < keys.length - 1, lines, map);
  }
  lines.push(`${indent}}${suffix}`);
}

function joinPath(path, key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' ? 'object' : typeof value;
}
