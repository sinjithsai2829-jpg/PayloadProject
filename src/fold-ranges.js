export function findFoldRanges(mode, text) {
  return mode === 'xml' ? findXmlFoldRanges(text) : findJsonFoldRanges(text);
}

export function findJsonFoldRanges(input) {
  const text = String(input ?? '');
  const ranges = [];
  const stack = [];
  let line = 1;
  let string = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1] || '';

    if (char === '\n') {
      line += 1;
      lineComment = false;
      continue;
    }
    if (lineComment) continue;
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (string) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') string = false;
      continue;
    }
    if (char === '"') {
      string = true;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push({ char, line });
      continue;
    }
    if (char !== '}' && char !== ']') continue;

    const openChar = char === '}' ? '{' : '[';
    let stackIndex = stack.length - 1;
    while (stackIndex >= 0 && stack[stackIndex].char !== openChar) stackIndex -= 1;
    if (stackIndex < 0) continue;
    const open = stack[stackIndex];
    stack.length = stackIndex;
    if (line > open.line) {
      ranges.push({
        startLine: open.line,
        endLine: line,
        kind: openChar === '{' ? 'object' : 'array',
      });
    }
  }

  return normalizeRanges(ranges);
}

export function findXmlFoldRanges(input) {
  const text = String(input ?? '');
  const ranges = [];
  const stack = [];
  let index = 0;
  let line = 1;

  while (index < text.length) {
    const lt = text.indexOf('<', index);
    if (lt < 0) break;
    line += countNewlines(text, index, lt);

    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end < 0) break;
      const endLine = line + countNewlines(text, lt, end + 3);
      if (endLine > line) ranges.push({ startLine: line, endLine, kind: 'comment' });
      line = endLine;
      index = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      if (end < 0) break;
      const endLine = line + countNewlines(text, lt, end + 3);
      if (endLine > line) ranges.push({ startLine: line, endLine, kind: 'cdata' });
      line = endLine;
      index = end + 3;
      continue;
    }
    if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2);
      if (end < 0) break;
      line += countNewlines(text, lt, end + 2);
      index = end + 2;
      continue;
    }
    if (/^<!DOCTYPE\b/i.test(text.slice(lt, lt + 10))) {
      const end = findDoctypeEnd(text, lt + 2);
      if (end < 0) break;
      line += countNewlines(text, lt, end + 1);
      index = end + 1;
      continue;
    }

    const gt = findXmlTagEnd(text, lt + 1);
    if (gt < 0) break;
    const raw = text.slice(lt, gt + 1);
    const startLine = line;
    const endTagLine = line + countNewlines(text, lt, gt + 1);
    const closing = /^<\s*\//.test(raw);
    const selfClosing = /\/\s*>$/.test(raw);
    const match = raw.match(/^<\s*\/?\s*([A-Za-z_][\w:.-]*)/);

    if (match && !/^<!/.test(raw)) {
      const name = match[1];
      if (closing) {
        let stackIndex = stack.length - 1;
        while (stackIndex >= 0 && stack[stackIndex].name !== name) stackIndex -= 1;
        if (stackIndex >= 0) {
          const open = stack[stackIndex];
          stack.length = stackIndex;
          if (endTagLine > open.startLine) {
            ranges.push({ startLine: open.startLine, endLine: endTagLine, kind: 'element', name });
          }
        }
      } else if (!selfClosing) {
        stack.push({ name, startLine });
      }
    }

    line = endTagLine;
    index = gt + 1;
  }

  return normalizeRanges(ranges);
}

function normalizeRanges(ranges) {
  const byStart = new Map();
  for (const range of ranges) {
    if (!range || range.endLine <= range.startLine) continue;
    const existing = byStart.get(range.startLine);
    if (!existing || range.endLine > existing.endLine) byStart.set(range.startLine, range);
  }
  return [...byStart.values()].sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);
}

function countNewlines(text, start, end) {
  let count = 0;
  for (let index = start; index < end && index < text.length; index += 1) if (text.charCodeAt(index) === 10) count += 1;
  return count;
}

function findXmlTagEnd(text, start) {
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
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[') depth += 1;
    else if (char === ']') depth = Math.max(0, depth - 1);
    else if (char === '>' && depth === 0) return index;
  }
  return -1;
}
