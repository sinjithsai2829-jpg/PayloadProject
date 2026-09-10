import { compareJsonValues, attachPrettyJsonLineNumbers } from './fast-engine.js';
import { comparePayloads, formatPayload } from './core.js';

let revision = 0;

self.onmessage = ({ data }) => {
  const { id, task, payload } = data;
  try {
    if (task !== 'compareLive') throw new Error(`Unknown task: ${task}`);

    const myRevision = ++revision;
    const started = performance.now();
    const mode = payload.mode === 'xml' ? 'xml' : 'json';
    const invalidSides = [];

    if (mode === 'json') {
      let left;
      let right;

      try {
        left = JSON.parse(payload.left);
      } catch (error) {
        invalidSides.push({ side: 'left', message: error?.message || 'Invalid JSON' });
      }

      try {
        right = JSON.parse(payload.right);
      } catch (error) {
        invalidSides.push({ side: 'right', message: error?.message || 'Invalid JSON' });
      }

      if (invalidSides.length) {
        self.postMessage({
          id,
          ok: false,
          error: 'Invalid JSON',
          invalidSides,
          revision: myRevision,
          elapsedMs: Math.round(performance.now() - started),
        });
        return;
      }

      const compared = compareJsonValues(left, right);
      const ordered = attachPrettyJsonLineNumbers(left, right, compared.diffs);
      self.postMessage({
        id,
        ok: true,
        result: {
          ...compared,
          ordered,
          revision: myRevision,
          elapsedMs: Math.round(performance.now() - started),
        },
      });
      return;
    }

    for (const [side, text] of [['left', payload.left], ['right', payload.right]]) {
      try {
        formatPayload({ mode: 'xml', text });
      } catch (error) {
        invalidSides.push({ side, message: error?.message || 'Invalid XML' });
      }
    }

    if (invalidSides.length) {
      self.postMessage({
        id,
        ok: false,
        error: 'Invalid XML',
        invalidSides,
        revision: myRevision,
        elapsedMs: Math.round(performance.now() - started),
      });
      return;
    }

    const compared = comparePayloads({ mode: 'xml', left: payload.left, right: payload.right });
    self.postMessage({
      id,
      ok: true,
      result: {
        ...compared,
        ordered: compared.diffs || [],
        revision: myRevision,
        elapsedMs: Math.round(performance.now() - started),
      },
    });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error), invalidSides: [] });
  }
};
