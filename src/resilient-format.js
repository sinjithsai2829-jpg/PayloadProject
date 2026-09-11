import {
  normalizeJsonTransportInput,
  decodeOneTransportLayer,
  extractJsonDocumentWithWrapperTail,
} from './input-normalization.js';
import { normalizeEscapedXml, prettyXml, validateXmlLight } from './core.js';

export function formatJsonBestEffort(input) {
  const started = now();
  const original = String(input ?? '').trim();
  if (!original) throw new Error('Nothing to format. Paste or upload a payload first.');

  const recovered = recoverJsonForFormatting(original);
  const attempts = [];
  addAttempt(attempts, recovered.text, recovered.notes);

  const invalidEscapes = repairKnownInvalidJsonEscapes(recovered.text);
  addAttempt(attempts, invalidEscapes.text, [
    ...recovered.notes,
    ...(invalidEscapes.changed ? ['removed non-JSON escape markers inside strings'] : []),
  ]);

  const trailingCommas = removeTrailingJsonCommas(invalidEscapes.text);
  addAttempt(attempts, trailingCommas.text, [
    ...recovered.notes,
    ...(invalidEscapes.changed ? ['removed non-JSON escape markers inside strings'] : []),
    ...(trailingCommas.changed ? ['removed trailing commas'] : []),
  ]);

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt.text);
      const formatted = JSON.stringify(parsed, null, 2);
      return {
        mode: 'json',
        formatted,
        parsed,
        valid: true,
        bestEffort: false,
        repaired: attempt.text !== original,
        repairNote: attempt.notes.length
          ? `Normalized pasted JSON: ${unique(attempt.notes).join('; ')}.`
          : '',
        warning: '',
        lineCount: countLines(formatted),
        bytes: byteLength(formatted),
        elapsedMs: Math.round(now() - started),
      };
    } catch (error) {
      lastError = error;
    }
  }

  const displayText = attempts[attempts.length - 1]?.text || recovered.text || original;
  const formatted = prettyJsonLoose(displayText);
  const issue = lastError?.message || 'JSON syntax could not be validated.';

  return {
    mode: 'json',
    formatted,
    parsed: null,
    valid: false,
    bestEffort: true,
    repaired: formatted !== original || recovered.repaired,
    repairNote: `Best-effort formatted JSON. The payload still has a syntax issue: ${issue}`,
    warning: issue,
    lineCount: countLines(formatted),
    bytes: byteLength(formatted),
    elapsedMs: Math.round(now() - started),
  };
}

export function formatXmlBestEffort(input) {
  const started = now();
  const original = String(input ?? '').trim();
  if (!original) throw new Error('Nothing to format. Paste or upload a payload first.');

  const cleaned = normalizeEscapedXml(original);
  let valid = true;
  let warning = '';
  try {
    validateXmlLight(cleaned);
  } catch (error) {
    valid = false;
    warning = error?.message || 'XML syntax could not be validated.';
  }

  const formatted = prettyXml(cleaned);
  return {
    mode: 'xml',
    formatted,
    parsed: null,
    valid,
    bestEffort: !valid,
    repaired: cleaned !== original || formatted !== original,
    repairNote: valid
      ? (cleaned !== original ? 'Normalized escaped XML before formatting.' : '')
      : `Best-effort formatted XML. The payload still has a syntax issue: ${warning}`,
    warning,
    lineCount: countLines(formatted),
    bytes: byteLength(formatted),
    elapsedMs: Math.round(now() - started),
  };
}

export function recoverJsonForFormatting(input) {
  const original = String(input ?? '').trim();
  const strict = normalizeJsonTransportInput(original);
  if (strict.repaired) {
    return {
      text: strict.text,
      repaired: true,
      notes: [strict.repairNote || 'normalized escaped JSON transport data'],
    };
  }

  let candidate = original;
  const notes = [];

  for (let pass = 1; pass <= 3 && looksLikeTransportEscapedJson(candidate); pass += 1) {
    const decoded = decodeOneTransportLayer(candidate);
    if (decoded === candidate) break;
    candidate = decoded;
    notes.push(`removed escaped JSON transport layer ${pass}`);

    const extracted = extractJsonDocumentWithWrapperTail(candidate);
    if (extracted) {
      candidate = extracted.document;
      if (extracted.removedTail) notes.push('removed surrounding wrapper punctuation');
    }
  }

  const extracted = extractJsonDocumentWithWrapperTail(candidate);
  if (extracted && extracted.removedTail) {
    candidate = extracted.document;
    notes.push('removed surrounding wrapper punctuation');
  }

  return {
    text: candidate,
    repaired: candidate !== original,
    notes,
  };
}

export function repairKnownInvalidJsonEscapes(input) {
  const text = String(input ?? '');
  const out = [];
  let inString = false;
  let escaped = false;
  let changed = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (!inString) {
      out.push(char);
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      out.push(char);
      escaped = false;
      continue;
    }

    if (char === '"') {
      out.push(char);
      inString = false;
      continue;
    }

    if (char === '\\' && index + 1 < text.length) {
      const next = text[index + 1];
      if (next === "'" || next === '&') {
        out.push(next);
        index += 1;
        changed = true;
        continue;
      }
      out.push(char);
      escaped = true;
      continue;
    }

    out.push(char);
  }

  return { text: out.join(''), changed };
}

export function removeTrailingJsonCommas(input) {
  const text = String(input ?? '');
  const out = [];
  let inString = false;
  let escaped = false;
  let changed = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      out.push(char);
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      out.push(char);
      continue;
    }

    if (char === ',') {
      let cursor = index + 1;
      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
      if (text[cursor] === '}' || text[cursor] === ']') {
        changed = true;
        continue;
      }
    }

    out.push(char);
  }

  return { text: out.join(''), changed };
}

export function prettyJsonLoose(input) {
  const text = String(input ?? '').trim();
  if (!text) return '';

  const lines = [];
  let current = '';
  let depth = 0;
  let stringQuote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  const write = (value) => { current += value; };
  const trimRight = () => { current = current.replace(/[ \t]+$/g, ''); };
  const newline = () => {
    trimRight();
    if (current.trim()) lines.push(`${'  '.repeat(Math.max(0, depth))}${current.trimStart()}`);
    current = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1] || '';

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
        newline();
      } else {
        write(char);
      }
      continue;
    }

    if (blockComment) {
      write(char);
      if (char === '*' && next === '/') {
        write('/');
        index += 1;
        blockComment = false;
      }
      continue;
    }

    if (stringQuote) {
      write(char);
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === stringQuote) stringQuote = '';
      continue;
    }

    if (char === '"' || char === "'") {
      stringQuote = char;
      write(char);
      continue;
    }

    if (char === '/' && next === '/') {
      write('//');
      index += 1;
      lineComment = true;
      continue;
    }

    if (char === '/' && next === '*') {
      write('/*');
      index += 1;
      blockComment = true;
      continue;
    }

    if (char === '{' || char === '[') {
      trimRight();
      write(char);
      newline();
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      if (current.trim()) newline();
      depth = Math.max(0, depth - 1);
      write(char);
      continue;
    }

    if (char === ',') {
      trimRight();
      write(',');
      newline();
      continue;
    }

    if (char === ':') {
      trimRight();
      write(': ');
      continue;
    }

    if (/\s/.test(char)) {
      if (current && !/[ \t]$/.test(current)) write(' ');
      continue;
    }

    write(char);
  }

  if (current.trim()) newline();
  return lines.join('\n');
}

function looksLikeTransportEscapedJson(input) {
  const text = String(input ?? '').trimStart();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return false;
  const firstQuote = text.indexOf('"', 1);
  if (firstQuote < 0 || firstQuote > 96) return false;
  let slashCount = 0;
  for (let index = firstQuote - 1; index >= 0 && text[index] === '\\'; index -= 1) slashCount += 1;
  return slashCount > 0;
}

function addAttempt(attempts, text, notes) {
  if (!text || attempts.some((attempt) => attempt.text === text)) return;
  attempts.push({ text, notes: unique(notes.filter(Boolean)) });
}

function unique(values) {
  return [...new Set(values)];
}

function countLines(text) {
  if (!text) return 0;
  let count = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) count += 1;
  }
  return count;
}

function byteLength(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return Buffer.byteLength(text, 'utf8');
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
