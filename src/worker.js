import { formatPayload, comparePayloads } from './core.js';
import { searchJsonTree } from './search.js';

const jsonCache = new Map();

self.onmessage = (event) => {
  const { id, task, payload } = event.data;
  try {
    let result;
    if (task === 'format') {
      result = formatPayload(payload);
      if (payload.mode === 'json' && Number.isInteger(payload.paneIndex)) {
        jsonCache.set(payload.paneIndex, result.parsed);
      }
    } else if (task === 'compare') {
      result = comparePayloads(payload);
    } else if (task === 'searchJson') {
      let parsed = jsonCache.get(payload.paneIndex);
      if (parsed == null) {
        const formatted = formatPayload({ mode: 'json', text: payload.text });
        parsed = formatted.parsed;
        jsonCache.set(payload.paneIndex, parsed);
      }
      result = searchJsonTree(parsed, payload.query, payload.limit);
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
