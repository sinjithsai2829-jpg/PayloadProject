export const SMART_WRAP_MAX_COLUMNS = 120;
export const SMART_WRAP_MIN_COLUMNS = 24;
export const SMART_WRAP_MAX_CONTINUATION = 44;

export function smartWrapLayout(text, availableColumns, tabSize = 2) {
  const value = String(text ?? '');
  const maxColumns = Math.max(
    SMART_WRAP_MIN_COLUMNS,
    Math.min(SMART_WRAP_MAX_COLUMNS, Math.floor(Number(availableColumns) || SMART_WRAP_MAX_COLUMNS)),
  );
  const leadingColumns = leadingIndentColumns(value, tabSize);
  const continuationColumn = continuationIndentColumn(value, maxColumns, tabSize);
  const segments = splitSmartWrappedLine(value, maxColumns, continuationColumn, tabSize);
  return {
    maxColumns,
    leadingColumns,
    continuationColumn,
    rows: Math.max(1, segments.length),
    segments,
  };
}

export function continuationIndentColumn(text, maxColumns, tabSize = 2) {
  const value = String(text ?? '');
  const leading = leadingIndentColumns(value, tabSize);
  const hardMax = Math.max(leading + 2, Math.min(SMART_WRAP_MAX_CONTINUATION, Math.floor(maxColumns * 0.48)));

  // JSON: continuation content lines up under the value after `key:` rather
  // than jumping back to the left edge of the editor.
  const jsonPrefix = value.match(/^\s*"(?:[^"\\]|\\.)*"\s*:\s*/);
  if (jsonPrefix) {
    const column = visualColumns(jsonPrefix[0], tabSize);
    return clamp(column, leading + 2, hardMax);
  }

  // XML: attributes/text continue just inside the element body. Long opening
  // tags therefore remain visibly associated with the element that owns them.
  const xmlPrefix = value.match(/^\s*<[!?/]?[A-Za-z_][\w:.-]*(?:\s+)?/);
  if (xmlPrefix) {
    const column = Math.max(leading + 2, visualColumns(xmlPrefix[0], tabSize));
    return clamp(column, leading + 2, hardMax);
  }

  // Plain structural/code lines keep a modest hanging indent relative to their
  // existing nesting depth.
  return clamp(leading + 2, 2, hardMax);
}

export function splitSmartWrappedLine(text, maxColumns, continuationColumn, tabSize = 2) {
  const value = String(text ?? '');
  const width = Math.max(SMART_WRAP_MIN_COLUMNS, Number(maxColumns) || SMART_WRAP_MAX_COLUMNS);
  const continuation = Math.max(0, Math.min(width - 8, Number(continuationColumn) || 0));
  if (!value || visualColumns(value, tabSize) <= width) return [{ text: value, start: 0, end: value.length, continuation: false }];

  const segments = [];
  let start = 0;
  let first = true;

  while (start < value.length) {
    const capacity = first ? width : Math.max(8, width - continuation);
    const end = findBreakOffset(value, start, capacity, tabSize);
    const safeEnd = Math.max(start + 1, end);
    segments.push({
      text: value.slice(start, safeEnd),
      start,
      end: safeEnd,
      continuation: !first,
    });
    start = safeEnd;
    first = false;
  }

  return segments.length ? segments : [{ text: value, start: 0, end: value.length, continuation: false }];
}

export function visualColumns(text, tabSize = 2) {
  let columns = 0;
  const safeTab = Math.max(1, Number(tabSize) || 2);
  for (const char of String(text ?? '')) {
    if (char === '\t') columns += safeTab - (columns % safeTab || 0);
    else columns += 1;
  }
  return columns;
}

export function leadingIndentColumns(text, tabSize = 2) {
  let columns = 0;
  const safeTab = Math.max(1, Number(tabSize) || 2);
  for (const char of String(text ?? '')) {
    if (char === ' ') columns += 1;
    else if (char === '\t') columns += safeTab - (columns % safeTab || 0);
    else break;
  }
  return columns;
}

function findBreakOffset(text, start, capacity, tabSize) {
  let columns = 0;
  let cursor = start;
  let preferred = -1;
  const preferAfter = Math.max(6, Math.floor(capacity * 0.55));

  while (cursor < text.length) {
    const char = text[cursor];
    const nextColumns = char === '\t'
      ? columns + (tabSize - (columns % tabSize || 0))
      : columns + 1;
    if (nextColumns > capacity) break;
    columns = nextColumns;
    cursor += 1;

    if (columns >= preferAfter && isFriendlyBreak(char, text[cursor])) preferred = cursor;
  }

  if (cursor >= text.length) return text.length;
  if (preferred > start) return preferred;
  return cursor > start ? cursor : Math.min(text.length, start + 1);
}

function isFriendlyBreak(current, next) {
  if (/\s/.test(current)) return true;
  if (current === ',' || current === ';') return true;
  if ((current === ':' || current === '=') && next !== '/') return true;
  if (current === '>' || current === ']' || current === '}') return true;
  return false;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
