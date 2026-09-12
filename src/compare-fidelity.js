const DEFAULT_LIMIT = 50;

export function findDuplicateJsonKeys(input, limit = DEFAULT_LIMIT) {
  const text = String(input ?? '');
  const max = Math.max(1, Number(limit) || DEFAULT_LIMIT);
  const stack = [];
  const duplicates = [];

  for (let index = 0; index < text.length && duplicates.length < max; index += 1) {
    const char = text[index];

    if (char === '"') {
      const token = readJsonString(text, index);
      if (!token) break;

      const context = stack[stack.length - 1];
      let cursor = token.end + 1;
      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;

      if (context?.type === 'object' && text[cursor] === ':') {
        const key = decodeJsonString(token.raw);
        if (key != null) {
          if (context.keys.has(key)) {
            duplicates.push({
              offset: index,
              ...lineColumnFromOffset(text, index),
            });
          } else {
            context.keys.add(key);
          }
        }
      }

      index = token.end;
      continue;
    }

    if (char === '{') {
      stack.push({ type: 'object', keys: new Set() });
      continue;
    }
    if (char === '[') {
      stack.push({ type: 'array' });
      continue;
    }
    if (char === '}' || char === ']') {
      stack.pop();
    }
  }

  return duplicates;
}

export function jsonComparisonFidelityIssue(left, right) {
  const leftDuplicates = findDuplicateJsonKeys(left);
  const rightDuplicates = findDuplicateJsonKeys(right);
  const total = leftDuplicates.length + rightDuplicates.length;
  if (!total) return null;

  return {
    kind: 'duplicate-json-key',
    leftCount: leftDuplicates.length,
    rightCount: rightDuplicates.length,
    total,
    reason: 'JSON contains duplicate object keys. Structural parsing would discard earlier occurrences, so a source-preserving text comparison was used.',
  };
}

function readJsonString(text, start) {
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      return { end: index, raw: text.slice(start, index + 1) };
    }
  }
  return null;
}

function decodeJsonString(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function lineColumnFromOffset(text, offset) {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}
