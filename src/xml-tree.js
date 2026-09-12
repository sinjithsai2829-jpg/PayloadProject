export function parseXmlTree(input) {
  const text = String(input ?? '');
  const lineStarts = buildLineStarts(text);
  const documentNode = {
    kind: 'xml-document',
    name: '#document',
    path: '$',
    lineStart: 1,
    lineEnd: Math.max(1, lineStarts.length),
    children: [],
  };
  const stack = [{ node: documentNode, childCounts: new Map(), textCount: 0 }];
  let index = 0;

  while (index < text.length) {
    const lt = text.indexOf('<', index);
    if (lt < 0) {
      appendText(text.slice(index), index, stack[stack.length - 1], lineStarts);
      break;
    }

    if (lt > index) appendText(text.slice(index, lt), index, stack[stack.length - 1], lineStarts);

    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end < 0) throw xmlError(text, lineStarts, lt, 'XML comment is not closed.');
      appendSpecial('comment', text.slice(lt + 4, end), lt, end + 3, stack[stack.length - 1], lineStarts);
      index = end + 3;
      continue;
    }

    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      if (end < 0) throw xmlError(text, lineStarts, lt, 'CDATA section is not closed.');
      appendSpecial('cdata', text.slice(lt + 9, end), lt, end + 3, stack[stack.length - 1], lineStarts);
      index = end + 3;
      continue;
    }

    if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2);
      if (end < 0) throw xmlError(text, lineStarts, lt, 'XML processing instruction is not closed.');
      index = end + 2;
      continue;
    }

    if (/^<!DOCTYPE\b/i.test(text.slice(lt, lt + 10))) {
      const end = findDoctypeEnd(text, lt + 2);
      if (end < 0) throw xmlError(text, lineStarts, lt, 'DOCTYPE declaration is not closed.');
      index = end + 1;
      continue;
    }

    const gt = findTagEnd(text, lt + 1);
    if (gt < 0) throw xmlError(text, lineStarts, lt, 'XML tag is not closed with >.');
    const raw = text.slice(lt, gt + 1);

    if (/^<!/.test(raw)) {
      index = gt + 1;
      continue;
    }

    if (/^<\s*\//.test(raw)) {
      const match = raw.match(/^<\s*\/\s*([A-Za-z_][\w:.-]*)\s*>$/);
      if (!match) throw xmlError(text, lineStarts, lt, 'Malformed XML closing tag.');
      const name = match[1];
      if (stack.length === 1) throw xmlError(text, lineStarts, lt, `Unexpected closing tag </${name}>.`);
      const current = stack[stack.length - 1];
      if (current.node.name !== name) {
        throw xmlError(text, lineStarts, lt, `Expected </${current.node.name}> but found </${name}>.`);
      }
      current.node.lineEnd = lineAt(lineStarts, gt);
      stack.pop();
      index = gt + 1;
      continue;
    }

    const open = parseOpeningTag(raw, text, lineStarts, lt);
    const parent = stack[stack.length - 1];
    const ordinal = parent.childCounts.get(open.name) || 0;
    parent.childCounts.set(open.name, ordinal + 1);
    const path = `${parent.node.path}/${open.name}[${ordinal}]`;
    const node = {
      kind: 'element',
      name: open.name,
      path,
      attributes: open.attributes.map((attribute) => ({
        ...attribute,
        path: `${path}/@${attribute.name}`,
      })),
      children: [],
      lineStart: lineAt(lineStarts, lt),
      lineEnd: lineAt(lineStarts, gt),
    };
    parent.node.children.push(node);

    if (!open.selfClosing) stack.push({ node, childCounts: new Map(), textCount: 0 });
    index = gt + 1;
  }

  if (stack.length > 1) {
    const current = stack[stack.length - 1].node;
    throw xmlError(text, lineStarts, offsetForLine(lineStarts, current.lineStart, text.length), `Missing closing tag </${current.name}>.`);
  }

  const roots = documentNode.children.filter((node) => node.kind === 'element');
  if (!roots.length) throw xmlError(text, lineStarts, 0, 'No XML root element was found.');
  if (roots.length > 1) {
    throw xmlError(text, lineStarts, offsetForLine(lineStarts, roots[1].lineStart, text.length), 'XML must contain a single root element.');
  }

  return documentNode;
}

export function searchXmlTree(documentNode, query, limit = 5000) {
  const started = now();
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return { paths: [], truncated: false, visited: 0, elapsedMs: 0 };

  const paths = [];
  const stack = [...(documentNode?.children || [])].reverse();
  let visited = 0;
  let truncated = false;

  while (stack.length) {
    const node = stack.pop();
    visited += 1;
    const pathText = String(node.path || '').toLowerCase();
    const nameText = String(node.name || node.kind || '').toLowerCase();
    const valueText = node.kind === 'text' || node.kind === 'cdata' || node.kind === 'comment'
      ? String(node.value || '').toLowerCase()
      : '';
    const looksLikePath = needle.startsWith('$') || needle.includes('/') || needle.startsWith('@');

    if (nameText.includes(needle) || valueText.includes(needle) || (looksLikePath && pathText.includes(needle))) {
      pushPath(paths, node.path, limit, () => { truncated = true; });
    }

    if (node.kind === 'element') {
      for (const attribute of node.attributes || []) {
        visited += 1;
        const attributeText = `${attribute.name} ${attribute.value} ${attribute.path}`.toLowerCase();
        if (attributeText.includes(needle)) pushPath(paths, attribute.path, limit, () => { truncated = true; });
      }
      for (let childIndex = node.children.length - 1; childIndex >= 0; childIndex -= 1) stack.push(node.children[childIndex]);
    }
  }

  return { paths, truncated, visited, elapsedMs: Math.round(now() - started) };
}

export function xmlNodeLabel(node) {
  if (!node) return '';
  if (node.kind === 'xml-document') return '#document';
  if (node.kind === 'text') return '#text';
  if (node.kind === 'cdata') return '#cdata';
  if (node.kind === 'comment') return '#comment';
  return node.name || '';
}

export function buildLineStarts(text) {
  const source = String(text ?? '');
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

export function lineAt(lineStarts, offset) {
  const starts = Array.isArray(lineStarts) ? lineStarts : [0];
  const target = Math.max(0, Number(offset) || 0);
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (starts[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return Math.max(1, low);
}

function parseOpeningTag(raw, source, lineStarts, sourceOffset) {
  const match = raw.match(/^<\s*([A-Za-z_][\w:.-]*)/);
  if (!match) throw xmlError(source, lineStarts, sourceOffset, 'Malformed XML opening tag.');
  const name = match[1];
  const selfClosing = /\/\s*>$/.test(raw);
  const attributes = [];
  const bodyEnd = selfClosing ? raw.lastIndexOf('/') : raw.lastIndexOf('>');
  let index = match[0].length;

  while (index < bodyEnd) {
    while (index < bodyEnd && /\s/.test(raw[index])) index += 1;
    if (index >= bodyEnd) break;

    const nameStart = index;
    while (index < bodyEnd && /[^\s=/>]/.test(raw[index])) index += 1;
    const attributeName = raw.slice(nameStart, index);
    if (!attributeName) break;
    while (index < bodyEnd && /\s/.test(raw[index])) index += 1;
    if (raw[index] !== '=') throw xmlError(source, lineStarts, sourceOffset + index, `Attribute ${attributeName} is missing =.`);
    index += 1;
    while (index < bodyEnd && /\s/.test(raw[index])) index += 1;
    const quote = raw[index];
    if (quote !== '"' && quote !== "'") {
      throw xmlError(source, lineStarts, sourceOffset + index, `Attribute ${attributeName} must use quotes.`);
    }
    index += 1;
    const valueStart = index;
    while (index < bodyEnd && raw[index] !== quote) index += 1;
    if (index >= bodyEnd) {
      throw xmlError(source, lineStarts, sourceOffset + valueStart - 1, `Attribute ${attributeName} quote is not closed.`);
    }
    const value = raw.slice(valueStart, index);
    attributes.push({ name: attributeName, value });
    index += 1;
  }

  return { name, attributes, selfClosing };
}

function appendText(raw, offset, parent, lineStarts) {
  if (!raw || !raw.trim()) return;
  const value = raw.trim();
  const ordinal = parent.textCount++;
  parent.node.children.push({
    kind: 'text',
    name: '#text',
    value,
    path: `${parent.node.path}/#text[${ordinal}]`,
    lineStart: lineAt(lineStarts, offset + Math.max(0, raw.indexOf(value))),
    lineEnd: lineAt(lineStarts, offset + Math.max(0, raw.length - 1)),
  });
}

function appendSpecial(kind, value, start, end, parent, lineStarts) {
  const ordinal = parent.textCount++;
  parent.node.children.push({
    kind,
    name: `#${kind}`,
    value: value.trim(),
    path: `${parent.node.path}/#${kind}[${ordinal}]`,
    lineStart: lineAt(lineStarts, start),
    lineEnd: lineAt(lineStarts, Math.max(start, end - 1)),
  });
}

function findTagEnd(text, start) {
  let quote = '';
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '>') return index;
    else if (char === '<') return -1;
  }
  return -1;
}

function findDoctypeEnd(text, start) {
  let quote = '';
  let subsetDepth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[') subsetDepth += 1;
    else if (char === ']') subsetDepth = Math.max(0, subsetDepth - 1);
    else if (char === '>' && subsetDepth === 0) return index;
  }
  return -1;
}

function offsetForLine(lineStarts, line, textLength) {
  if (!Array.isArray(lineStarts) || !lineStarts.length) return 0;
  const index = Math.min(Math.max(0, (Number(line) || 1) - 1), lineStarts.length - 1);
  return Math.min(lineStarts[index], textLength);
}

function xmlError(text, lineStarts, offset, message) {
  const line = lineAt(lineStarts, offset);
  const lineStart = lineStarts[Math.max(0, line - 1)] || 0;
  const column = Math.max(1, offset - lineStart + 1);
  return new Error(`${message} (line ${line}, column ${column})`);
}

function pushPath(paths, path, limit, onTruncated) {
  if (paths.length < limit) paths.push(path);
  else onTruncated();
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
