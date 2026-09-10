export const FAST_MAX_DIFFS = 20000;

export function compareJsonValues(left, right, maxDiffs = FAST_MAX_DIFFS) {
  const diffs = [];
  const summary = { added: 0, removed: 0, modified: 0, truncated: false };
  walk(left, right, '$', diffs, summary, maxDiffs);
  return {
    diffs,
    summary,
    identical: summary.added === 0 && summary.removed === 0 && summary.modified === 0,
  };
}

export function attachPrettyJsonLineNumbers(left, right, diffs) {
  const leftTargets = new Set();
  const rightTargets = new Set();

  for (const diff of diffs) {
    if (diff.type !== 'added') leftTargets.add(diff.path);
    if (diff.type !== 'removed') rightTargets.add(diff.path);
  }

  const leftLines = findPrettyJsonLines(left, leftTargets);
  const rightLines = findPrettyJsonLines(right, rightTargets);

  return diffs.map((diff) => ({
    ...diff,
    leftLine: leftLines.get(diff.path) || null,
    rightLine: rightLines.get(diff.path) || null,
  }));
}

export function findPrettyJsonLines(value, targetPaths) {
  const found = new Map();
  const line = { value: 1 };
  visitLines(value, '$', targetPaths, found, line);
  return found;
}

export function jsonPathAncestors(path) {
  const out = ['$'];
  if (!path || path === '$') return out;
  const tokens = path.slice(1).match(/\.[A-Za-z_$][\w$]*|\[(?:\d+|"(?:\\.|[^"])*")\]/g) || [];
  let current = '$';
  for (const token of tokens) {
    current += token;
    out.push(current);
  }
  return out;
}

export function getJsonValueAtPath(root, path) {
  if (path === '$') return root;
  const tokens = parsePathTokens(path);
  let value = root;
  for (const token of tokens) {
    if (value == null) return undefined;
    value = value[token];
  }
  return value;
}

export function childJsonPath(parent, key, isArray = false) {
  if (isArray) return `${parent}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(String(key))}]`;
}

function walk(left, right, path, diffs, summary, maxDiffs) {
  if (Object.is(left, right)) return;
  if (diffs.length >= maxDiffs) {
    summary.truncated = true;
    return;
  }

  const lt = jsonType(left);
  const rt = jsonType(right);
  if (lt !== rt) {
    diffs.push({ path, type: 'modified' });
    summary.modified += 1;
    return;
  }

  if (lt === 'array') {
    const max = Math.max(left.length, right.length);
    for (let index = 0; index < max; index += 1) {
      if (diffs.length >= maxDiffs) {
        summary.truncated = true;
        return;
      }
      const childPath = `${path}[${index}]`;
      if (index >= left.length) {
        diffs.push({ path: childPath, type: 'added' });
        summary.added += 1;
      } else if (index >= right.length) {
        diffs.push({ path: childPath, type: 'removed' });
        summary.removed += 1;
      } else {
        walk(left[index], right[index], childPath, diffs, summary, maxDiffs);
      }
    }
    return;
  }

  if (lt === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    const leftSet = new Set(leftKeys);
    const rightSet = new Set(rightKeys);

    for (const key of leftKeys) {
      if (diffs.length >= maxDiffs) {
        summary.truncated = true;
        return;
      }
      const childPath = childJsonPath(path, key);
      if (!rightSet.has(key)) {
        diffs.push({ path: childPath, type: 'removed' });
        summary.removed += 1;
      } else {
        walk(left[key], right[key], childPath, diffs, summary, maxDiffs);
      }
    }

    for (const key of rightKeys) {
      if (diffs.length >= maxDiffs) {
        summary.truncated = true;
        return;
      }
      if (!leftSet.has(key)) {
        diffs.push({ path: childJsonPath(path, key), type: 'added' });
        summary.added += 1;
      }
    }
    return;
  }

  diffs.push({ path, type: 'modified' });
  summary.modified += 1;
}

function visitLines(value, path, targets, found, line) {
  if (targets.has(path)) found.set(path, line.value);

  const type = jsonType(value);
  if (type !== 'object' && type !== 'array') {
    line.value += 1;
    return;
  }

  if (type === 'array') {
    if (value.length === 0) {
      line.value += 1;
      return;
    }
    line.value += 1; // opening [
    for (let index = 0; index < value.length; index += 1) {
      visitLines(value[index], `${path}[${index}]`, targets, found, line);
    }
    line.value += 1; // closing ]
    return;
  }

  const keys = Object.keys(value);
  if (keys.length === 0) {
    line.value += 1;
    return;
  }

  line.value += 1; // opening {
  for (const key of keys) {
    visitLines(value[key], childJsonPath(path, key), targets, found, line);
  }
  line.value += 1; // closing }
}

function parsePathTokens(path) {
  const tokens = [];
  const regex = /\.([A-Za-z_$][\w$]*)|\[(\d+)\]|\["((?:\\.|[^"])*)"\]/g;
  let match;
  while ((match = regex.exec(path))) {
    if (match[1] != null) tokens.push(match[1]);
    else if (match[2] != null) tokens.push(Number(match[2]));
    else tokens.push(JSON.parse(`"${match[3]}"`));
  }
  return tokens;
}

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' ? 'object' : typeof value;
}
