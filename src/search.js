export const MAX_SEARCH_RESULTS = 5000;

export function searchJsonTree(value, query, limit = MAX_SEARCH_RESULTS) {
  const started = now();
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return { paths: [], truncated: false, visited: 0, elapsedMs: 0 };

  const paths = [];
  const stack = [{ value, path: '$', key: '$' }];
  let visited = 0;
  let truncated = false;

  while (stack.length) {
    const node = stack.pop();
    visited += 1;
    const { value: current, path, key } = node;
    const type = jsonType(current);
    const keyText = String(key).toLowerCase();
    const pathText = path.toLowerCase();
    const looksLikePath = needle.startsWith('$') || needle.includes('.') || needle.includes('[');
    let match = keyText.includes(needle) || (looksLikePath && pathText.includes(needle));

    if (!match && type !== 'object' && type !== 'array') {
      const valueText = current === null ? 'null' : String(current).toLowerCase();
      match = valueText.includes(needle);
    }

    if (match) {
      if (paths.length < limit) paths.push(path);
      else truncated = true;
    }

    if (type === 'array') {
      for (let i = current.length - 1; i >= 0; i -= 1) {
        stack.push({ value: current[i], path: `${path}[${i}]`, key: `[${i}]` });
      }
    } else if (type === 'object') {
      const keys = Object.keys(current);
      for (let i = keys.length - 1; i >= 0; i -= 1) {
        const childKey = keys[i];
        stack.push({ value: current[childKey], path: joinJsonPath(path, childKey), key: childKey });
      }
    }
  }

  return {
    paths,
    truncated,
    visited,
    elapsedMs: Math.round(now() - started),
  };
}

function joinJsonPath(path, key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' ? 'object' : typeof value;
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
