export const DIAGNOSTICS_SCHEMA_VERSION = 2;
export const MAX_DIAGNOSTIC_EVENTS = 1200;
export const MAX_DIAGNOSTIC_STRING = 1200;

export function sanitizeDiagnosticValue(value, depth = 0) {
  if (depth > 5) return '[max-depth]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'string') return sanitizeDiagnosticString(value);

  if (value instanceof Error || looksLikeError(value)) {
    return {
      name: sanitizeDiagnosticString(value.name || 'Error'),
      message: sanitizeDiagnosticString(value.message || String(value)),
      stack: sanitizeStack(value.stack),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 60).map((item) => sanitizeDiagnosticValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      if (isSensitiveKey(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = sanitizeDiagnosticValue(item, depth + 1);
      }
    }
    return out;
  }

  return sanitizeDiagnosticString(String(value));
}

export function sanitizeDiagnosticString(input) {
  const text = String(input ?? '');
  if (!text) return '';

  // Diagnostics must never become an accidental payload archive. Long JSON,
  // XML, escaped JSON/XML, and strings that look like whole payloads are
  // replaced by metadata only.
  if (looksLikePayload(text)) return `[payload-redacted length=${text.length}]`;

  return text.length > MAX_DIAGNOSTIC_STRING
    ? `${text.slice(0, MAX_DIAGNOSTIC_STRING)}…[truncated ${text.length - MAX_DIAGNOSTIC_STRING} chars]`
    : text;
}

export function sanitizeStack(stack) {
  if (!stack) return '';
  return String(stack)
    .split('\n')
    .slice(0, 24)
    .map((line) => sanitizeDiagnosticString(line))
    .join('\n');
}

export function trimDiagnosticEvents(events, max = MAX_DIAGNOSTIC_EVENTS) {
  if (!Array.isArray(events)) return [];
  return events.length > max ? events.slice(events.length - max) : events;
}

export function createDiagnosticEvent({ level = 'info', type, data = {}, now = new Date() }) {
  return {
    timestamp: now.toISOString(),
    level,
    type: sanitizeDiagnosticString(type || 'event'),
    data: sanitizeDiagnosticValue(data),
  };
}

export function countNewlinesFast(text) {
  if (!text) return 0;
  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) lines += 1;
  }
  return lines;
}

export function summarizeDiagnosticEvents(events) {
  const summary = {
    total: 0,
    levels: { debug: 0, info: 0, warn: 0, error: 0 },
    types: {},
  };
  for (const event of Array.isArray(events) ? events : []) {
    summary.total += 1;
    const level = typeof event?.level === 'string' ? event.level : 'debug';
    summary.levels[level] = (summary.levels[level] || 0) + 1;
    const type = typeof event?.type === 'string' ? event.type : 'unknown';
    summary.types[type] = (summary.types[type] || 0) + 1;
  }
  return summary;
}

function looksLikePayload(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const jsonLike = (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    trimmed.startsWith('{\\"') || trimmed.startsWith('[\\"');
  const xmlLike = trimmed.startsWith('<') && trimmed.includes('>') && /<\/?[A-Za-z_][\w:.-]*/.test(trimmed);

  if ((jsonLike || xmlLike) && trimmed.length > 80) return true;

  // Also redact suspicious multi-line structured content even if it is only a
  // fragment copied into an error/console message.
  if (trimmed.length > 200 && (trimmed.includes('\n{') || trimmed.includes('\n  "') || trimmed.includes('</'))) return true;

  return false;
}

function isSensitiveKey(key) {
  return /^(payload|payloads|content|body|raw|formatted|parsed|left|right|text|value|editorValue|fileContent|query|searchText|clipboard|selectionText|innerHTML|outerHTML)$/i.test(String(key));
}

function looksLikeError(value) {
  return value && typeof value === 'object' && typeof value.message === 'string' && ('stack' in value || 'name' in value);
}
