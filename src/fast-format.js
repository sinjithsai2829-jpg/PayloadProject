import { formatJsonBestEffort, formatXmlBestEffort } from './resilient-format.js';

export function formatJsonFast(input) {
  const started = now();
  const original = String(input ?? '').trim();
  if (!original) throw new Error('Nothing to format. Paste or upload a payload first.');

  try {
    const parsed = JSON.parse(original);
    const formatted = JSON.stringify(parsed, null, 2);
    return {
      mode: 'json',
      formatted,
      parsed,
      valid: true,
      bestEffort: false,
      repaired: false,
      repairNote: '',
      warning: '',
      lineCount: countLines(formatted),
      bytes: byteLength(formatted),
      elapsedMs: Math.round(now() - started),
      fastPath: true,
    };
  } catch {
    const result = formatJsonBestEffort(original);
    return { ...result, fastPath: false };
  }
}

export function formatXmlFast(input) {
  return { ...formatXmlBestEffort(input), fastPath: true };
}

function countLines(text) {
  if (!text) return 0;
  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) lines += 1;
  }
  return lines;
}

function byteLength(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return String(text ?? '').length;
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
