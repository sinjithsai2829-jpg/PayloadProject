import { compareJsonValues, attachPrettyJsonLineNumbers } from './fast-engine.js';

let revision = 0;

self.onmessage = ({ data }) => {
  const { id, task, payload } = data;
  try {
    if (task === 'compareJson') {
      const myRevision = ++revision;
      const started = performance.now();
      const left = JSON.parse(payload.left);
      const right = JSON.parse(payload.right);
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
    throw new Error(`Unknown task: ${task}`);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
};
