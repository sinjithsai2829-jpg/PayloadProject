const MAX_ISSUES = 200;

export function detectPayloadIssues({ mode, text }) {
  return mode === 'xml' ? detectXmlIssues(text) : detectJsonIssues(text);
}

export function detectJsonIssues(input) {
  const text = String(input ?? '');
  if (!text.trim()) return [];

  try {
    JSON.parse(text);
    return [];
  } catch (error) {
    const issues = [jsonParserIssue(error, text), ...scanJsonIssues(text)];
    return normalizeIssues(issues, text);
  }
}

export function detectXmlIssues(input) {
  const text = String(input ?? '');
  if (!text.trim()) return [];

  const issues = [];
  const stack = [];
  let rootCount = 0;
  let index = 0;

  while (index < text.length && issues.length < MAX_ISSUES) {
    const open = text.indexOf('<', index);
    if (open < 0) break;

    if (text.startsWith('<!--', open)) {
      const end = text.indexOf('-->', open + 4);
      if (end < 0) {
        issues.push(issueAt(text, open, 'xml-unclosed-comment', 'XML comment is not closed.'));
        break;
      }
      index = end + 3;
      continue;
    }

    if (text.startsWith('<![CDATA[', open)) {
      const end = text.indexOf(']]>', open + 9);
      if (end < 0) {
        issues.push(issueAt(text, open, 'xml-unclosed-cdata', 'CDATA section is not closed.'));
        break;
      }
      index = end + 3;
      continue;
    }

    if (text.startsWith('<?', open)) {
      const end = text.indexOf('?>', open + 2);
      if (end < 0) {
        issues.push(issueAt(text, open, 'xml-unclosed-processing-instruction', 'XML processing instruction is not closed.'));
        break;
      }
      index = end + 2;
      continue;
    }

    if (/^<!DOCTYPE\b/i.test(text.slice(open, open + 10))) {
      const end = findDoctypeEnd(text, open + 2);
      if (end < 0) {
        issues.push(issueAt(text, open, 'xml-unclosed-doctype', 'DOCTYPE declaration is not closed.'));
        break;
      }
      index = end + 1;
      continue;
    }

    const end = findXmlTagEnd(text, open + 1);
    if (end < 0) {
      issues.push(issueAt(text, open, 'xml-unclosed-tag', 'XML tag is not closed with >.'));
      break;
    }

    const raw = text.slice(open, end + 1);
    if (/^<!/.test(raw)) {
      index = end + 1;
      continue;
    }

    const closing = /^<\s*\//.test(raw);
    const selfClosing = /\/\s*>$/.test(raw);
    const match = raw.match(/^<\s*\/?\s*([A-Za-z_][\w:.-]*)/);
    if (!match) {
      issues.push(issueAt(text, open, 'xml-malformed-tag', 'Malformed XML tag.'));
      index = end + 1;
      continue;
    }

    const name = match[1];
    const attributeIssue = findXmlAttributeQuoteIssue(raw);
    if (attributeIssue >= 0) {
      issues.push(issueAt(text, open + attributeIssue, 'xml-attribute-quote', `Attribute quote is not closed in <${name}>.`));
    }

    if (closing) {
      if (!stack.length) {
        issues.push(issueAt(text, open, 'xml-unexpected-close', `Unexpected closing tag </${name}>.`));
      } else if (stack[stack.length - 1].name === name) {
        stack.pop();
      } else {
        const matchingIndex = findLastStackIndex(stack, name);
        const expected = stack[stack.length - 1].name;
        issues.push(issueAt(text, open, 'xml-mismatched-close', `Expected </${expected}> but found </${name}>.`));

        if (matchingIndex >= 0) {
          while (stack.length - 1 > matchingIndex && issues.length < MAX_ISSUES) {
            const missing = stack.pop();
            issues.push(issueAt(text, missing.offset, 'xml-missing-close', `Missing closing tag </${missing.name}>.`));
          }
          stack.pop();
        }
      }
    } else if (!selfClosing) {
      if (!stack.length) rootCount += 1;
      stack.push({ name, offset: open });
    } else if (!stack.length) {
      rootCount += 1;
    }

    index = end + 1;
  }

  while (stack.length && issues.length < MAX_ISSUES) {
    const missing = stack.pop();
    issues.push(issueAt(text, missing.offset, 'xml-missing-close', `Missing closing tag </${missing.name}>.`));
  }

  if (rootCount > 1 && issues.length < MAX_ISSUES) {
    issues.push(issueAt(text, 0, 'xml-multiple-roots', 'XML must contain a single root element.'));
  }
  if (rootCount === 0 && !issues.length) {
    issues.push(issueAt(text, 0, 'xml-no-root', 'No XML root element was found.'));
  }

  return normalizeIssues(issues, text);
}

export function issueAt(text, offset, code, message, severity = 'error') {
  const safeOffset = Math.max(0, Math.min(Number(offset) || 0, String(text ?? '').length));
  const position = lineColumnFromOffset(String(text ?? ''), safeOffset);
  return {
    severity,
    code,
    message,
    offset: safeOffset,
    line: position.line,
    column: position.column,
  };
}

export function lineColumnFromOffset(text, offset) {
  const safeOffset = Math.max(0, Math.min(Number(offset) || 0, text.length));
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < safeOffset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: safeOffset - lineStart + 1 };
}

function jsonParserIssue(error, text) {
  const message = error?.message || 'Invalid JSON.';
  let line = null;
  let column = null;
  let offset = null;

  const lineColumnMatch = message.match(/(?:line\s+)(\d+)(?:\s+column\s+)(\d+)/i);
  if (lineColumnMatch) {
    line = Number(lineColumnMatch[1]);
    column = Number(lineColumnMatch[2]);
    offset = offsetFromLineColumn(text, line, column);
  }

  if (offset == null) {
    const positionMatch = message.match(/position\s+(\d+)/i);
    if (positionMatch) {
      offset = Number(positionMatch[1]);
      const position = lineColumnFromOffset(text, offset);
      line = position.line;
      column = position.column;
    }
  }

  if (offset == null) {
    offset = 0;
    line = 1;
    column = 1;
  }

  return {
    severity: 'error',
    code: 'json-parse',
    message: cleanJsonErrorMessage(message),
    offset,
    line,
    column,
  };
}

function scanJsonIssues(text) {
  const issues = [];
  const stack = [];
  let inString = false;
  let escaped = false;
  let stringStart = 0;

  for (let index = 0; index < text.length && issues.length < MAX_ISSUES; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        if (char === 'u') {
          const hex = text.slice(index + 1, index + 5);
          if (!/^[0-9A-Fa-f]{4}$/.test(hex)) {
            issues.push(issueAt(text, index - 1, 'json-invalid-unicode-escape', 'Invalid JSON Unicode escape. Expected four hexadecimal digits after \\u.'));
          } else {
            index += 4;
          }
        } else if (!'"\\/bfnrt'.includes(char)) {
          issues.push(issueAt(text, index - 1, 'json-invalid-escape', `Invalid JSON escape \\${char}.`));
        }
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
        continue;
      }
      if (char === '\n' || char === '\r') {
        issues.push(issueAt(text, index, 'json-newline-in-string', 'A JSON string cannot contain an unescaped newline.'));
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      stringStart = index;
      continue;
    }

    if (char === "'") {
      issues.push(issueAt(text, index, 'json-single-quote', 'JSON strings and property names must use double quotes.'));
      continue;
    }

    if (char === '/' && (text[index + 1] === '/' || text[index + 1] === '*')) {
      issues.push(issueAt(text, index, 'json-comment', 'Comments are not valid in JSON.'));
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push({ char, offset: index });
      continue;
    }

    if (char === '}' || char === ']') {
      const expectedOpen = char === '}' ? '{' : '[';
      const top = stack[stack.length - 1];
      if (!top) {
        issues.push(issueAt(text, index, 'json-unexpected-close', `Unexpected ${char}.`));
      } else if (top.char !== expectedOpen) {
        issues.push(issueAt(text, index, 'json-mismatched-close', `Mismatched ${char}; the open container uses ${top.char}.`));
        stack.pop();
      } else {
        stack.pop();
      }
      continue;
    }

    if (char === ',') {
      let cursor = index + 1;
      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
      if (text[cursor] === '}' || text[cursor] === ']') {
        issues.push(issueAt(text, index, 'json-trailing-comma', 'Trailing commas are not valid JSON.'));
      }
    }
  }

  if (inString && issues.length < MAX_ISSUES) {
    issues.push(issueAt(text, stringStart, 'json-unclosed-string', 'JSON string is not closed.'));
  }
  while (stack.length && issues.length < MAX_ISSUES) {
    const open = stack.pop();
    const close = open.char === '{' ? '}' : ']';
    issues.push(issueAt(text, open.offset, 'json-missing-close', `Missing closing ${close}.`));
  }

  return issues;
}

function findXmlTagEnd(text, start) {
  let quote = '';
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return index;
    if (char === '<') return -1;
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

function findXmlAttributeQuoteIssue(raw) {
  let quote = '';
  let quoteOffset = -1;
  for (let index = 1; index < raw.length - 1; index += 1) {
    const char = raw[index];
    if (!quote && (char === '"' || char === "'")) {
      quote = char;
      quoteOffset = index;
    } else if (quote && char === quote) {
      quote = '';
      quoteOffset = -1;
    }
  }
  return quote ? quoteOffset : -1;
}

function findLastStackIndex(stack, name) {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].name === name) return index;
  }
  return -1;
}

function offsetFromLineColumn(text, line, column) {
  const targetLine = Math.max(1, Number(line) || 1);
  const targetColumn = Math.max(1, Number(column) || 1);
  let currentLine = 1;
  let offset = 0;
  while (offset < text.length && currentLine < targetLine) {
    if (text.charCodeAt(offset) === 10) currentLine += 1;
    offset += 1;
  }
  return Math.min(text.length, offset + targetColumn - 1);
}

function cleanJsonErrorMessage(message) {
  return String(message)
    .replace(/\s+at position\s+\d+(?:\s*\(line\s+\d+\s+column\s+\d+\))?/i, '')
    .trim();
}

function normalizeIssues(issues, text) {
  const seen = new Set();
  const result = [];

  for (const raw of issues) {
    if (!raw || result.length >= MAX_ISSUES) break;
    const line = Math.max(1, Number(raw.line) || 1);
    const column = Math.max(1, Number(raw.column) || 1);
    const key = `${raw.code || 'syntax'}:${line}:${column}:${raw.message || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      severity: raw.severity || 'error',
      code: raw.code || 'syntax',
      message: raw.message || 'Syntax issue.',
      offset: Math.max(0, Math.min(Number(raw.offset) || 0, text.length)),
      line,
      column,
    });
  }

  return result.sort((a, b) => a.line - b.line || a.column - b.column);
}
