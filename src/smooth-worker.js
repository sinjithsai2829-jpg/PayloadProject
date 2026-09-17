import { compareJsonValues, attachPrettyJsonLineNumbers } from './fast-engine.js';
import { formatJsonBestEffort, formatXmlBestEffort, recoverJsonForFormatting } from './format-recovery.js';
import { compareTextPayloads } from './text-fallback-diff.js';
import { compareFormattedCode } from './formatted-code-compare.js';
import { normalizeCompareOptions } from './compare-normalization.js';
import { jsonComparisonFidelityIssue } from './compare-fidelity.js';

let revision = 0;

self.onmessage = ({ data }) => {
  const { id, task, payload } = data;
  try {
    if (task !== 'compareLive') throw new Error(`Unknown task: ${task}`);

    const myRevision = ++revision;
    const started = performance.now();
    const mode = payload.mode === 'xml' ? 'xml' : 'json';
    const options = normalizeCompareOptions(payload.options || {});
    const invalidSides = [];

    if (mode === 'json') {
      const recoveredLeft = recoverJsonForFormatting(payload.left).text;
      const recoveredRight = recoverJsonForFormatting(payload.right).text;
      const fidelityIssue = jsonComparisonFidelityIssue(recoveredLeft, recoveredRight);
      if (fidelityIssue) {
        const fallback = compareTextPayloads({
          mode,
          left: payload.left,
          right: payload.right,
          reason: fidelityIssue.reason,
          options,
        });
        self.postMessage({
          id,
          ok: true,
          result: {
            ...fallback,
            fidelityIssue,
            structuralIssues: [],
            recovered: false,
            revision: myRevision,
            elapsedMs: Math.round(performance.now() - started),
          },
        });
        return;
      }

      const leftFormatted = formatJsonBestEffort(payload.left);
      const rightFormatted = formatJsonBestEffort(payload.right);

      if (leftFormatted.parsed == null) invalidSides.push({ side: 'left', message: leftFormatted.warning || 'JSON could not be structurally recovered' });
      if (rightFormatted.parsed == null) invalidSides.push({ side: 'right', message: rightFormatted.warning || 'JSON could not be structurally recovered' });

      if (invalidSides.length) {
        const reason = invalidSides.map((item) => `${item.side === 'left' ? 'File 1' : 'File 2'}: ${item.message}`).join(' · ');
        const fallback = compareTextPayloads({
          mode,
          left: payload.left,
          right: payload.right,
          reason,
          options,
        });
        self.postMessage({
          id,
          ok: true,
          result: {
            ...fallback,
            structuralIssues: invalidSides,
            recovered: leftFormatted.repaired || rightFormatted.repaired,
            revision: myRevision,
            elapsedMs: Math.round(performance.now() - started),
          },
        });
        return;
      }

      // Keep a structural JSON result for Tree view, but drive Code view from a
      // formatted line/block diff. This mirrors the way a user expects a normal
      // side-by-side editor comparison to behave: insertions make alignment gaps
      // and nearby replacements become modifications instead of unrelated
      // removed/added JSON paths.
      const structural = compareJsonValues(leftFormatted.parsed, rightFormatted.parsed, undefined, options);
      const structuralDiffs = attachPrettyJsonLineNumbers(
        leftFormatted.parsed,
        rightFormatted.parsed,
        structural.diffs,
      );
      const codeCompared = compareFormattedCode(
        'json',
        leftFormatted.formatted,
        rightFormatted.formatted,
        options,
      );

      self.postMessage({
        id,
        ok: true,
        result: {
          ...codeCompared,
          structuralDiffs,
          structuralSummary: structural.summary,
          comparisonKind: 'structural',
          codeComparisonKind: 'formatted-lines',
          fallback: false,
          structuralIssues: [],
          recovered: leftFormatted.repaired || rightFormatted.repaired,
          revision: myRevision,
          elapsedMs: Math.round(performance.now() - started),
        },
      });
      return;
    }

    const leftFormatted = formatXmlBestEffort(payload.left);
    const rightFormatted = formatXmlBestEffort(payload.right);
    if (!leftFormatted.valid) invalidSides.push({ side: 'left', message: leftFormatted.warning || 'XML could not be structurally recovered' });
    if (!rightFormatted.valid) invalidSides.push({ side: 'right', message: rightFormatted.warning || 'XML could not be structurally recovered' });

    if (invalidSides.length) {
      const reason = invalidSides.map((item) => `${item.side === 'left' ? 'File 1' : 'File 2'}: ${item.message}`).join(' · ');
      const fallback = compareTextPayloads({
        mode,
        left: payload.left,
        right: payload.right,
        reason,
        options,
      });
      self.postMessage({
        id,
        ok: true,
        result: {
          ...fallback,
          structuralIssues: invalidSides,
          recovered: leftFormatted.repaired || rightFormatted.repaired,
          revision: myRevision,
          elapsedMs: Math.round(performance.now() - started),
        },
      });
      return;
    }

    const compared = compareFormattedCode('xml', leftFormatted.formatted, rightFormatted.formatted, options);
    self.postMessage({
      id,
      ok: true,
      result: {
        ...compared,
        ordered: compared.diffs || [],
        comparisonKind: 'structural',
        codeComparisonKind: 'formatted-lines',
        fallback: false,
        structuralIssues: [],
        recovered: leftFormatted.repaired || rightFormatted.repaired,
        revision: myRevision,
        elapsedMs: Math.round(performance.now() - started),
      },
    });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error), invalidSides: [] });
  }
};
