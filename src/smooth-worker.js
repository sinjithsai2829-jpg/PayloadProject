import { compareJsonValues, attachPrettyJsonLineNumbers } from './fast-engine.js';
import { formatJsonBestEffort, formatXmlBestEffort } from './resilient-format.js';
import { compareTextPayloads } from './text-fallback-diff.js';
import { compareFormattedXml } from './xml-compare.js';
import { annotateMovedLineDiffs, normalizeCompareOptions } from './compare-normalization.js';

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
      const leftFormatted = formatJsonBestEffort(payload.left);
      const rightFormatted = formatJsonBestEffort(payload.right);

      if (leftFormatted.parsed == null) invalidSides.push({ side: 'left', message: leftFormatted.warning || 'JSON could not be structurally recovered' });
      if (rightFormatted.parsed == null) invalidSides.push({ side: 'right', message: rightFormatted.warning || 'JSON could not be structurally recovered' });

      if (invalidSides.length) {
        const reason = invalidSides.map((item) => `${item.side === 'left' ? 'File 1' : 'File 2'}: ${item.message}`).join(' · ');
        const fallback = compareTextPayloads({
          mode,
          left: leftFormatted.formatted,
          right: rightFormatted.formatted,
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

      const left = leftFormatted.parsed;
      const right = rightFormatted.parsed;
      const compared = compareJsonValues(left, right, undefined, options);
      const ordered = attachPrettyJsonLineNumbers(left, right, compared.diffs);
      const leftLines = JSON.stringify(left, null, 2).split('\n');
      const rightLines = JSON.stringify(right, null, 2).split('\n');
      const moved = annotateMovedLineDiffs(ordered, leftLines, rightLines, options);
      self.postMessage({
        id,
        ok: true,
        result: {
          ...compared,
          ordered: moved.diffs,
          summary: { ...compared.summary, moved: moved.movedPairs },
          movedPairs: moved.movedPairs,
          compareOptions: options,
          comparisonKind: 'structural',
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
        left: leftFormatted.formatted,
        right: rightFormatted.formatted,
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

    const compared = compareFormattedXml(leftFormatted.formatted, rightFormatted.formatted, options);
    self.postMessage({
      id,
      ok: true,
      result: {
        ...compared,
        ordered: compared.diffs || [],
        comparisonKind: 'structural',
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
