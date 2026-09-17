import {
  formatJsonBestEffort as baseFormatJsonBestEffort,
  formatXmlBestEffort as baseFormatXmlBestEffort,
  recoverJsonForFormatting,
} from './resilient-format.js';
import { decodeOneTransportLayer } from './input-normalization.js';

export { recoverJsonForFormatting };

// Some logs/API clients serialize a JSON document twice in two different ways:
// the outer layer is a valid JSON string, but after decoding it the inner
// document still contains escaped structural quotes, e.g.
//   "{\\\"customer\\\":{\\\"id\\\":1}}"
// Detect that transport shape before the normal formatter tries to parse the
// inner document. Otherwise the base formatter can parse the outer string but
// reject the still-escaped inner object and fall back to one-line formatting.
export function formatJsonBestEffort(input) {
  const transported = recoverNestedEscapedDocument(input);
  if (transported) return transported;

  const first = baseFormatJsonBestEffort(input);
  if (typeof first.parsed !== 'string') return first;

  const recovered = recoverEscapedStringValue(first.parsed, first.repairNote);
  return recovered || first;
}

// XML recovery already handles JSON-string wrappers and escaped attribute
// quotes. Keep it behind the same facade so JSON and XML formatting continue to
// share one user-facing recovery entry point.
export function formatXmlBestEffort(input) {
  return baseFormatXmlBestEffort(input);
}

function recoverNestedEscapedDocument(input) {
  const source = String(input ?? '').trim();
  if (!source) return null;
  try {
    const outer = JSON.parse(source);
    if (typeof outer !== 'string') return null;
    return recoverEscapedStringValue(outer, 'Removed an outer JSON-string transport layer.');
  } catch (_) {
    return null;
  }
}

function recoverEscapedStringValue(value, existingNote = '') {
  let candidate = String(value ?? '').trim();
  if (!looksLikeEscapedDocument(candidate)) return null;

  let decodedAny = false;
  for (let pass = 0; pass < 3 && looksLikeEscapedDocument(candidate); pass += 1) {
    const decoded = decodeOneTransportLayer(candidate);
    if (!decoded || decoded === candidate) break;
    candidate = decoded.trim();
    decodedAny = true;
  }
  if (!decodedAny) return null;

  const retried = baseFormatJsonBestEffort(candidate);
  if (retried.parsed == null || typeof retried.parsed === 'string') return null;

  const notes = [
    existingNote,
    'Normalized an additional escaped JSON transport layer before formatting.',
    retried.repairNote,
  ].filter(Boolean);

  return {
    ...retried,
    repaired: true,
    repairNote: notes.join(' '),
  };
}

function looksLikeEscapedDocument(input) {
  const text = String(input ?? '').trimStart();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return false;
  const firstQuote = text.indexOf('"', 1);
  if (firstQuote < 0 || firstQuote > 128) return false;
  let slashCount = 0;
  for (let index = firstQuote - 1; index >= 0 && text[index] === '\\'; index -= 1) slashCount += 1;
  return slashCount > 0;
}
