export const MAX_DIFFS = 20000;

export function formatPayload({ mode, text }) {
  const started = now();
  if (!text?.trim()) throw new Error('Nothing to format. Paste or upload a payload first.');

  if (mode === 'json') {
    const parsed = parseJsonFlexible(text);
    const formatted = JSON.stringify(parsed.value, null, 2);
    return {
      mode,
      formatted,
      parsed: parsed.value,
      repaired: parsed.repaired,
      repairNote: parsed.repairNote,
      lineCount: countLines(formatted),
      bytes: byteLength(formatted),
      elapsedMs: Math.round(now() - started),
    };
  }

  const cleaned = normalizeEscapedXml(text);
  validateXmlLight(cleaned);
  const formatted = prettyXml(cleaned);
  return {
    mode,
    formatted,
    repaired: cleaned !== text.trim(),
    repairNote: cleaned !== text.trim() ? 'Escaped XML quotes were normalized before formatting.' : '',
    lineCount: countLines(formatted),
    bytes: byteLength(formatted),
    elapsedMs: Math.round(now() - started),
  };
}

export function comparePayloads({ mode, left, right }) {
  const started = now();
  if (!left?.trim() || !right?.trim()) throw new Error('Both File 1 and File 2 are required for comparison.');

  if (mode === 'json') {
    const l = parseJsonFlexible(left).value;
    const r = parseJsonFlexible(right).value;
    const diffs = [];
    const summary = { added: 0, removed: 0, modified: 0, truncated: false };
    walkJsonDiff(l, r, '$', diffs, summary);
    return {
      mode,
      diffs,
      summary,
      identical: summary.added + summary.removed + summary.modified === 0,
      elapsedMs: Math.round(now() - started),
    };
  }

  const leftFormatted = formatPayload({ mode: 'xml', text: left }).formatted;
  const rightFormatted = formatPayload({ mode: 'xml', text: right }).formatted;
  const leftLines = leftFormatted.split('\n');
  const rightLines = rightFormatted.split('\n');
  const changed = myersChangedLines(leftLines, rightLines);
  const normalized = buildXmlDiffEvents(changed.leftChanged, changed.rightChanged);
  const truncated = changed.leftChanged.length > MAX_DIFFS
    || changed.rightChanged.length > MAX_DIFFS
    || changed.truncated
    || normalized.truncated;

  return {
    mode,
    leftFormatted,
    rightFormatted,
    leftChanged: changed.leftChanged.slice(0, MAX_DIFFS),
    rightChanged: changed.rightChanged.slice(0, MAX_DIFFS),
    diffs: normalized.diffs,
    summary: {
      ...normalized.summary,
      truncated,
    },
    identical: normalized.diffs.length === 0,
    elapsedMs: Math.round(now() - started),
  };
}

// XML comparison is line based, but the rest of the application should not
// have to understand separate left/right changed-line arrays. Normalize those
// arrays into the same ordered diff event contract used by JSON: every
// navigable difference has a type plus optional left/right line numbers.
export function buildXmlDiffEvents(leftChanged, rightChanged, maxDiffs = MAX_DIFFS) {
  const left = Array.isArray(leftChanged) ? leftChanged : [];
  const right = Array.isArray(rightChanged) ? rightChanged : [];
  const count = Math.min(Math.max(left.length, right.length), maxDiffs);
  const diffs = [];
  const summary = { added: 0, removed: 0, modified: 0 };

  for (let index = 0; index < count; index += 1) {
    const leftLine = left[index] || null;
    const rightLine = right[index] || null;
    const type = leftLine && rightLine ? 'modified' : leftLine ? 'removed' : 'added';
    diffs.push({
      path: `$xml[${index}]`,
      type,
      leftLine,
      rightLine,
    });
    summary[type] += 1;
  }

  return {
    diffs,
    summary,
    truncated: Math.max(left.length, right.length) > maxDiffs,
  };
}

export function parseJsonFlexible(input) {
  const original = input.trim();
  const attempts = [];
  const seen = new Set();

  const add = (value, note = '') => {
    if (typeof value !== 'string') return;
    const s = value.trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    attempts.push({ s, note });
  };

  add(original, '');

  try {
    const outer = JSON.parse(original);
    if (typeof outer === 'string') add(outer, 'Removed one outer JSON-string escaping layer.');
    else return { value: outer, repaired: false, repairNote: '' };
  } catch (_) {}

  let progressive = original;
  for (let i = 1; i <= 3; i += 1) {
    progressive = progressive.replace(/\\+"/g, '"');
    add(progressive, `Normalized escaped JSON quotes (${i} pass${i > 1 ? 'es' : ''}).`);
  }

  let lastError;
  for (const attempt of attempts) {
    try {
      let value = JSON.parse(attempt.s);
      let note = attempt.note;
      for (let depth = 0; depth < 2; depth += 1) {
        if (typeof value !== 'string') break;
        const t = value.trim();
        if (!(t.startsWith('{') || t.startsWith('['))) break;
        value = JSON.parse(t);
        note = note || 'Removed JSON string escaping.';
      }
      return { value, repaired: attempt.s !== original || !!note, repairNote: note };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Invalid JSON: ${lastError?.message || 'Unable to parse payload.'}`);
}

export function normalizeEscapedXml(input) {
  let s = input.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      const parsed = JSON.parse(s);
      if (typeof parsed === 'string' && parsed.includes('<')) s = parsed.trim();
    } catch (_) {}
  }
  s = s.replace(/\\+"/g, '"');
  return s;
}

export function prettyXml(xml) {
  const protectedBlocks = [];
  let s = xml
    .replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, (m) => `___PAYLOADDIFF_BLOCK_${protectedBlocks.push(m) - 1}___`)
    .replace(/>\s*</g, '><')
    .trim();

  const tokens = s.split(/(<[^>]+>)/g).filter(Boolean);
  const lines = [];
  let depth = 0;

  for (let token of tokens) {
    token = token.replace(/___PAYLOADDIFF_BLOCK_(\d+)___/g, (_, i) => protectedBlocks[Number(i)]);
    const t = token.trim();
    if (!t) continue;

    if (t.startsWith('</')) depth = Math.max(0, depth - 1);
    lines.push(`${'  '.repeat(depth)}${t}`);

    if (isOpeningXmlTag(t)) depth += 1;
  }
  return lines.join('\n');
}

export function validateXmlLight(xml) {
  const stripped = xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[^?]*\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  const tagRegex = /<\/?([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?\s*\/?>/g;
  const stack = [];
  let match;
  let found = 0;

  while ((match = tagRegex.exec(stripped))) {
    found += 1;
    const full = match[0];
    const name = match[1];
    if (full.startsWith('</')) {
      const expected = stack.pop();
      if (expected !== name) throw new Error(`Invalid XML: expected closing tag </${expected || '?'}> but found </${name}>.`);
    } else if (!full.endsWith('/>')) {
      stack.push(name);
    }
  }

  if (!found) throw new Error('Invalid XML: no XML elements were found.');
  if (stack.length) throw new Error(`Invalid XML: missing closing tag for <${stack[stack.length - 1]}>.`);
  return true;
}

function isOpeningXmlTag(t) {
  return t.startsWith('<') && !t.startsWith('</') && !t.startsWith('<?') && !t.startsWith('<!') && !t.endsWith('/>');
}

function walkJsonDiff(left, right, path, diffs, summary) {
  if (Object.is(left, right)) return;
  if (diffs.length >= MAX_DIFFS) { summary.truncated = true; return; }

  const lt = jsonType(left);
  const rt = jsonType(right);
  if (lt !== rt) {
    diffs.push({ path, type: 'modified' });
    summary.modified += 1;
    return;
  }

  if (lt === 'array') {
    const max = Math.max(left.length, right.length);
    for (let i = 0; i < max; i += 1) {
      if (diffs.length >= MAX_DIFFS) { summary.truncated = true; return; }
      const p = `${path}[${i}]`;
      if (i >= left.length) { diffs.push({ path: p, type: 'added' }); summary.added += 1; }
      else if (i >= right.length) { diffs.push({ path: p, type: 'removed' }); summary.removed += 1; }
      else walkJsonDiff(left[i], right[i], p, diffs, summary);
    }
    return;
  }

  if (lt === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    const rightSet = new Set(rightKeys);
    const leftSet = new Set(leftKeys);

    for (const key of leftKeys) {
      if (diffs.length >= MAX_DIFFS) { summary.truncated = true; return; }
      const p = joinJsonPath(path, key);
      if (!rightSet.has(key)) { diffs.push({ path: p, type: 'removed' }); summary.removed += 1; }
      else walkJsonDiff(left[key], right[key], p, diffs, summary);
    }
    for (const key of rightKeys) {
      if (diffs.length >= MAX_DIFFS) { summary.truncated = true; return; }
      if (!leftSet.has(key)) { diffs.push({ path: joinJsonPath(path, key), type: 'added' }); summary.added += 1; }
    }
    return;
  }

  diffs.push({ path, type: 'modified' });
  summary.modified += 1;
}

function myersChangedLines(a, b) {
  const n = a.length;
  const m = b.length;
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix += 1;

  const aa = a.slice(prefix, n - suffix);
  const bb = b.slice(prefix, m - suffix);
  if (!aa.length && !bb.length) return { leftChanged: [], rightChanged: [], added: 0, removed: 0, truncated: false };
  if (!aa.length) return { leftChanged: [], rightChanged: range(prefix + 1, bb.length), added: bb.length, removed: 0, truncated: false };
  if (!bb.length) return { leftChanged: range(prefix + 1, aa.length), rightChanged: [], added: 0, removed: aa.length, truncated: false };

  const max = aa.length + bb.length;
  const maxD = Math.min(max, 4000);
  const offset = maxD + 1;
  let v = new Int32Array(offset * 2 + 3);
  v.fill(-1);
  v[offset + 1] = 0;
  const trace = [];
  let endD = -1;

  outer: for (let d = 0; d <= maxD; d += 1) {
    const snapshot = new Int32Array(v);
    trace.push(snapshot);
    for (let k = -d; k <= d; k += 2) {
      const idx = offset + k;
      let x;
      if (k === -d || (k !== d && v[idx - 1] < v[idx + 1])) x = v[idx + 1];
      else x = v[idx - 1] + 1;
      let y = x - k;
      while (x < aa.length && y < bb.length && aa[x] === bb[y]) { x += 1; y += 1; }
      v[idx] = x;
      if (x >= aa.length && y >= bb.length) { endD = d; break outer; }
    }
  }

  if (endD < 0) {
    return {
      leftChanged: range(prefix + 1, aa.length),
      rightChanged: range(prefix + 1, bb.length),
      added: bb.length,
      removed: aa.length,
      truncated: true,
    };
  }

  let x = aa.length;
  let y = bb.length;
  const leftChanged = [];
  const rightChanged = [];
  let added = 0;
  let removed = 0;

  for (let d = endD; d > 0; d -= 1) {
    const prevV = trace[d - 1];
    const k = x - y;
    let prevK;
    if (k === -d || (k !== d && prevV[offset + k - 1] < prevV[offset + k + 1])) prevK = k + 1;
    else prevK = k - 1;
    const prevX = prevV[offset + prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) { x -= 1; y -= 1; }
    if (x === prevX) {
      y -= 1;
      rightChanged.push(prefix + y + 1);
      added += 1;
    } else {
      x -= 1;
      leftChanged.push(prefix + x + 1);
      removed += 1;
    }
  }

  leftChanged.reverse();
  rightChanged.reverse();
  return { leftChanged, rightChanged, added, removed, truncated: false };
}

function range(start, count) {
  const out = [];
  const cap = Math.min(count, MAX_DIFFS + 1);
  for (let i = 0; i < cap; i += 1) out.push(start + i);
  return out;
}

function joinJsonPath(path, key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}
function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' ? 'object' : typeof value;
}
function countLines(text) {
  if (!text) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) count += 1;
  return count;
}
function byteLength(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return Buffer.byteLength(text, 'utf8');
}
function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
