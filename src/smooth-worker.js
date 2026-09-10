import { compareJsonValues, attachPrettyJsonLineNumbers } from './fast-engine.js';

let revision = 0;

self.onmessage = ({ data }) => {
  const { id, task, payload } = data;
  try {
    if (task !== 'compareJson') throw new Error(`Unknown task: ${task}`);

    const myRevision = ++revision;
    const started = performance.now();
    const invalidSides = [];
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
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error), invalidSides: [] });
  }
};
