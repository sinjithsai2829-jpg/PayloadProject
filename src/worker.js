import { searchJsonTree } from './search.js';
import { recoverJsonForFormatting } from './resilient-format.js';
import { formatJsonFast, formatXmlFast } from './fast-format.js';
import { detectPayloadIssues } from './syntax-issues.js';
import { compareTextPayloads } from './text-fallback-diff.js';
import { compareFormattedXml } from './xml-compare.js';
import { compareJsonValues, attachPrettyJsonLineNumbers } from './fast-engine.js';
import { annotateMovedLineDiffs, normalizeCompareOptions } from './compare-normalization.js';
import { jsonComparisonFidelityIssue } from './compare-fidelity.js';

const jsonCache = new Map();

self.onmessage = (event) => {
  const { id, task, payload } = event.data;
  try {
    let result;

    if (task === 'format') {
      result = payload.mode === 'xml'
        ? formatXmlFast(payload.text)
        : formatJsonFast(payload.text);

      if (payload.includeIssues !== false) {
        result.issues = detectPayloadIssues({ mode: payload.mode, text: result.formatted });
      }

      if (payload.mode === 'json' && Number.isInteger(payload.paneIndex)) {
        if (result.parsed != null) jsonCache.set(payload.paneIndex, result.parsed);
        else jsonCache.delete(payload.paneIndex);
      }

      if (payload.includeParsed === false) delete result.parsed;
    } else if (task === 'compare') {
      result = compareWithRecovery(payload);
    } else if (task === 'searchJson') {
      let parsed = jsonCache.get(payload.paneIndex);
      if (parsed == null) {
        const formatted = formatJsonFast(payload.text);
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
  const started = now();
  const options = normalizeCompareOptions(payload.options || {});
  const performanceMode = payload.performanceMode === true;

  if (payload.mode === 'xml') {
    const left = formatXmlFast(payload.left);
    const right = formatXmlFast(payload.right);
    if (!left.valid || !right.valid) {
      return {
        ...compareTextPayloads({
          mode: 'xml',
          left: payload.left,
          right: payload.right,
          reason: structuralReason('XML', left, right),
          options,
        }),
        leftFormatted: left.formatted,
        rightFormatted: right.formatted,
        elapsedMs: Math.round(now() - started),
      };
    }
    return {
      ...compareFormattedXml(left.formatted, right.formatted, options),
      leftFormatted: left.formatted,
      rightFormatted: right.formatted,
      comparisonKind: 'structural',
      fallback: false,
      elapsedMs: Math.round(now() - started),
    };
  }

  // Parse/format exactly once for ordinary valid JSON. Only repaired JSON pays
  // the additional recovery scan needed to preserve source-level fidelity.
  const left = formatJsonFast(payload.left);
  const right = formatJsonFast(payload.right);
  const fidelityLeft = left.repaired ? recoverJsonForFormatting(payload.left).text : payload.left;
  const fidelityRight = right.repaired ? recoverJsonForFormatting(payload.right).text : payload.right;
  const fidelityIssue = jsonComparisonFidelityIssue(fidelityLeft, fidelityRight);
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
      leftFormatted: left.formatted,
      rightFormatted: right.formatted,
      elapsedMs: Math.round(now() - started),
    };
  }

  if (left.parsed == null || right.parsed == null) {
    return {
      ...compareTextPayloads({
        mode: 'json',
        left: payload.left,
        right: payload.right,
        reason: structuralReason('JSON', left, right),
        options,
      }),
      leftFormatted: left.formatted,
      rightFormatted: right.formatted,
      elapsedMs: Math.round(now() - started),
    };
  }

  const compared = compareJsonValues(left.parsed, right.parsed, undefined, options);
  const ordered = attachPrettyJsonLineNumbers(left.parsed, right.parsed, compared.diffs);
  let diffs = ordered;
  let movedPairs = 0;
  if (!performanceMode) {
    const moved = annotateMovedLineDiffs(
      ordered,
      left.formatted.split('\n'),
      right.formatted.split('\n'),
      options,
    );
    diffs = moved.diffs;
    movedPairs = moved.movedPairs;
  }

  return {
    mode: 'json',
    diffs,
    ordered: diffs,
    summary: { ...compared.summary, moved: movedPairs },
    identical: compared.identical,
    compareOptions: options,
    movedPairs,
    comparisonKind: 'structural',
    fallback: false,
    leftFormatted: left.formatted,
    rightFormatted: right.formatted,
    elapsedMs: Math.round(now() - started),
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

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
