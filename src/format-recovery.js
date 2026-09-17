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
// The base formatter correctly unwraps normal JSON-string transports, but this
// shape can otherwise parse successfully as a *string* and be re-stringified as
// one giant line. Retry only when the parsed result is still a document-looking
// string with escaped structural quotes near its first key.
export function formatJsonBestEffort(input) {
  const first = baseFormatJsonBestEffort(input);
  if (typeof first.parsed !== 'string') return first;

  let candidate = first.parsed.trim();
  if (!looksLikeEscapedDocument(candidate)) return first;

  let decodedAny = false;
  for (let pass = 0; pass < 3 && looksLikeEscapedDocument(candidate); pass += 1) {
    const decoded = decodeOneTransportLayer(candidate);
    if (!decoded || decoded === candidate) break;
    candidate = decoded.trim();
    decodedAny = true;
  }
  if (!decodedAny) return first;

  const retried = baseFormatJsonBestEffort(candidate);
  if (retried.parsed == null || typeof retried.parsed === 'string') return first;

  const notes = [
    first.repairNote,
    'Normalized an additional escaped JSON transport layer before formatting.',
    retried.repairNote,
  ].filter(Boolean);

  return {
    ...retried,
    repaired: true,
    repairNote: notes.join(' '),
  };
}

// XML recovery already handles JSON-string wrappers and escaped attribute
// quotes. Keep it behind the same facade so JSON and XML formatting continue to
// share one user-facing recovery entry point.
export function formatXmlBestEffort(input) {
  return baseFormatXmlBestEffort(input);
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
