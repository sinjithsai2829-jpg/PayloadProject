import { formatPayload, comparePayloads } from './core.js';

self.onmessage = (event) => {
  const { id, task, payload } = event.data;
  try {
    let result;
    if (task === 'format') result = formatPayload(payload);
    else if (task === 'compare') result = comparePayloads(payload);
    else throw new Error(`Unknown task: ${task}`);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
};
