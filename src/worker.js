import { searchJsonTree } from './search.js';
import { formatJsonBestEffort, formatXmlBestEffort, recoverJsonForFormatting } from './format-recovery.js';
import { detectPayloadIssues } from './syntax-issues.js';
import { compareTextPayloads } from './text-fallback-diff.js';
import { compareFormattedCode } from './formatted-code-compare.js';
import { compareJsonValues, attachPrettyJsonLineNumbers } from './fast-engine.js';
import { normalizeCompareOptions } from './compare-normalization.js';
import { jsonComparisonFidelityIssue } from './compare-fidelity.js';

const jsonCache = new Map();

self.onmessage = (event) => {
  const { id, task, payload } = event.data;
  try {
    let result;

    if (task === 'format') {
      result = payload.mode === 'xml'
        ? formatXmlBestEffort(payload.text)
        : formatJsonBestEffort(payload.text);

      result.issues = detectPayloadIssues({ mode: payload.mode, text: result.formatted });

      if (payload.mode === 'json' && Number.isInteger(payload.paneIndex)) {
        if (result.parsed != null) jsonCache.set(payload.paneIndex, result.parsed);
        else jsonCache.delete(payload.paneIndex);
      }
    } else if (task === 'compare') {
      result = compareWithRecovery(payload);
    } else if (task === 'searchJson') {
      let parsed = jsonCache.get(payload.paneIndex);
      if (parsed == null) {
        const formatted = formatJsonBestEffort(payload.text);
        if (formatted.parsed == null) {
          throw new Error(`Tree/search requires structurally valid JSON after recovery. ${formatted.warning || ''}`.trim());
        }
        parsed = formatted.parsed;
        jsonCache.set(payload.paneIndex, parsed);
      }
      result = searchJsonTree(parsed, payload.query, payload.limit);
    } else if (task === 'validate') {
      result = {
        mode: payload.mode,
        issues: detectPayloadIssues({ mode: payload.mode, text: payload.text }),
      };
    } else if (task === 'clearPaneCache') {
      jsonCache.delete(payload.paneIndex);
      result = true;
    } else if (task === 'clearCache') {
      jsonCache.clear();
      result = true;
    } else {
      throw new Error(`Unknown task: ${task}`);
    }

    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
};

function compareWithRecovery(payload) {
  const options = normalizeCompareOptions(payload.options || {});
  if (payload.mode === 'xml') {
    const left = formatXmlBestEffort(payload.left);
    const right = formatXmlBestEffort(payload.right);
    if (!left.valid || !right.valid) {
      return compareTextPayloads({
        mode: 'xml',
        left: payload.left,
        right: payload.right,
        reason: structuralReason('XML', left, right),
        options,
      });
    }
    return {
      ...compareFormattedCode('xml', left.formatted, right.formatted, options),
      comparisonKind: 'structural',
      codeComparisonKind: 'formatted-lines',
      fallback: false,
    };
  }

  // JSON.parse silently keeps only the last occurrence of duplicate object keys.
  // Comparing that parsed object would therefore hide source lines the user can
  // clearly see in the editor. Detect this before structural parsing and switch
  // to the same lossless line comparison used for malformed payloads.
  const recoveredLeft = recoverJsonForFormatting(payload.left).text;
  const recoveredRight = recoverJsonForFormatting(payload.right).text;
  const fidelityIssue = jsonComparisonFidelityIssue(recoveredLeft, recoveredRight);
  if (fidelityIssue) {
    return {
      ...compareTextPayloads({
        mode: 'json',
        left: payload.left,
        right: payload.right,
        reason: fidelityIssue.reason,
        options,
      }),
      fidelityIssue,
    };
  }

  const left = formatJsonBestEffort(payload.left);
  const right = formatJsonBestEffort(payload.right);
  if (left.parsed == null || right.parsed == null) {
    return compareTextPayloads({
      mode: 'json',
      left: payload.left,
      right: payload.right,
      reason: structuralReason('JSON', left, right),
      options,
    });
  }

  const structural = compareJsonValues(left.parsed, right.parsed, undefined, options);
  const structuralDiffs = attachPrettyJsonLineNumbers(left.parsed, right.parsed, structural.diffs);
  const codeCompared = compareFormattedCode('json', left.formatted, right.formatted, options);
  return {
    ...codeCompared,
    structuralDiffs,
    structuralSummary: structural.summary,
    comparisonKind: 'structural',
    codeComparisonKind: 'formatted-lines',
    fallback: false,
    elapsedMs: codeCompared.elapsedMs,
  };
}

function structuralReason(label, left, right) {
  const issues = [];
  if (label === 'JSON') {
    if (left.parsed == null) issues.push(`File 1: ${left.warning || 'invalid JSON'}`);
    if (right.parsed == null) issues.push(`File 2: ${right.warning || 'invalid JSON'}`);
  } else {
    if (!left.valid) issues.push(`File 1: ${left.warning || 'invalid XML'}`);
    if (!right.valid) issues.push(`File 2: ${right.warning || 'invalid XML'}`);
  }
  return `${label} structural parsing unavailable. ${issues.join(' · ')}`.trim();
}
