export function normalizeJsonTransportInput(input) {
  const original = String(input ?? '').trim();
  if (!original) return { text: original, repaired: false, repairNote: '' };

  // Never touch already-valid JSON. This keeps ordinary payloads and legitimate
  // JSON escape sequences byte-for-byte intact until the normal formatter runs.
  if (parsesAsJson(original)) {
    return { text: original, repaired: false, repairNote: '' };
  }

  let candidate = original;
  const notes = [];

  for (let pass = 1; pass <= 3; pass += 1) {
    if (!looksLikeEscapedJsonDocument(candidate)) break;

    const decoded = decodeOneTransportLayer(candidate);
    if (decoded === candidate) break;
    candidate = decoded;
    notes.push(`removed escaped JSON transport layer ${pass}`);

    const extracted = extractJsonDocumentWithWrapperTail(candidate);
    if (extracted) {
      candidate = extracted.document;
      if (extracted.removedTail) notes.push('removed surrounding log wrapper punctuation');
    }

    if (parsesAsJson(candidate)) {
      return {
        text: candidate,
        repaired: true,
        repairNote: `Normalized pasted JSON: ${notes.join('; ')}.`,
      };
    }
  }

  // If normalization cannot prove that the result is valid JSON, return the
  // original input. We do not want a best-effort repair to silently corrupt a
  // payload that has a genuine syntax error.
  return { text: original, repaired: false, repairNote: '' };
}

export function decodeOneTransportLayer(input) {
  const text = String(input ?? '');
  const out = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '\\' || index + 1 >= text.length) {
      out.push(char);
      continue;
    }

    const next = text[index + 1];

    // One escaped transport layer doubles literal backslashes and escapes JSON
    // quotes. Decode exactly one layer so an embedded JSON quote such as
    // \\\" becomes \" rather than becoming an unescaped quote inside a value.
    if (next === '\\') {
      // Source-language/log serializers sometimes produce an invalid inner JSON
      // escape such as \\' or \\&. After removing the transport layer that would
      // become \' / \&, which JSON.parse correctly rejects. Because apostrophes
      // and ampersands do not need JSON escaping, normalize the entire artifact
      // in the same transport pass. A legitimate literal backslash remains
      // represented by additional escaped backslashes and is handled normally.
      const afterPair = text[index + 2];
      if (afterPair === "'" || afterPair === '&') {
        out.push(afterPair);
        index += 2;
        continue;
      }
      out.push('\\');
      index += 1;
      continue;
    }
    if (next === '"') {
      out.push('"');
      index += 1;
      continue;
    }

    // These are common log/source-language artifacts but are not legal JSON
    // escapes. Removing only the transport backslash preserves the actual value.
    if (next === "'" || next === '&') {
      out.push(next);
      index += 1;
      continue;
    }

    // Preserve every other sequence. If it is a legitimate inner JSON escape
    // (\n, \t, \uXXXX, etc.), JSON.parse will validate it after transport decode.
    out.push(char);
  }

  return out.join('');
}

export function extractJsonDocumentWithWrapperTail(input) {
  const text = String(input ?? '').trim();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return null;

  const stack = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if (char === '}' || char === ']') {
      if (!stack.length || stack[stack.length - 1] !== char) return null;
      stack.pop();
      if (!stack.length) {
        const document = text.slice(0, index + 1);
        const tail = text.slice(index + 1);
        if (!tail.trim()) return { document, removedTail: false };
        if (!isIgnorableWrapperTail(tail)) return null;
        return { document, removedTail: true };
      }
    }
  }

  return null;
}

function looksLikeEscapedJsonDocument(input) {
  const text = String(input ?? '').trimStart();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return false;

  // Look only at the first property/string delimiter. Valid JSON has an
  // unescaped opening quote here; transported JSON commonly has \" instead.
  const firstQuote = text.indexOf('"', 1);
  if (firstQuote < 0 || firstQuote > 96) return false;

  let slashCount = 0;
  for (let index = firstQuote - 1; index >= 0 && text[index] === '\\'; index -= 1) slashCount += 1;
  return slashCount > 0;
}

function isIgnorableWrapperTail(tail) {
  let trimmed = String(tail ?? '').trim();
  if (!trimmed || trimmed.length > 64) return false;

  // Loggers frequently serialize the whitespace between a copied JSON value and
  // its containing punctuation, leaving literal "\\n", "\\r" or "\\t" in the
  // clipboard. Treat those transport-only whitespace escapes exactly like real
  // whitespace, then keep the strict punctuation-only safety check below.
  trimmed = trimmed.replace(/\\[nrt]/g, '').trim();
  if (!trimmed) return false;

  // Accept only closing punctuation left behind when a user copies the value
  // portion of a larger log/JSON wrapper. Any letters, digits, '<', etc. make
  // the tail non-ignorable and the original payload is left untouched.
  for (const char of trimmed) {
    if (!'"\'`;,:}])'.includes(char)) return false;
  }
  return true;
}

function parsesAsJson(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
