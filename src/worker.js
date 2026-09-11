import { formatPayload, comparePayloads } from './core.js';
import { searchJsonTree } from './search.js';
import { normalizeJsonTransportInput } from './input-normalization.js';

const jsonCache = new Map();

self.onmessage = (event) => {
  const { id, task, payload } = event.data;
  try {
    let result;
    if (task === 'format') {
      const normalizedPayload = normalizePayloadForMode(payload);
      result = formatPayload(normalizedPayload);
      if (payload.mode === 'json' && Number.isInteger(payload.paneIndex)) {
        jsonCache.set(payload.paneIndex, result.parsed);
      }
      if (payload.mode === 'json' && normalizedPayload.__normalization?.repaired) {
        result.repaired = true;
        result.repairNote = normalizedPayload.__normalization.repairNote;
      }
    } else if (task === 'compare') {
      result = comparePayloads(normalizeComparisonPayload(payload));
    } else if (task === 'searchJson') {
      let parsed = jsonCache.get(payload.paneIndex);
      if (parsed == null) {
        const normalized = normalizeJsonTransportInput(payload.text);
        const formatted = formatPayload({ mode: 'json', text: normalized.text });
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

function normalizePayloadForMode(payload) {
  if (payload.mode !== 'json') return payload;
  const normalized = normalizeJsonTransportInput(payload.text);
  return {
    ...payload,
    text: normalized.text,
    __normalization: normalized,
  };
}

function normalizeComparisonPayload(payload) {
  if (payload.mode !== 'json') return payload;
  const left = normalizeJsonTransportInput(payload.left);
  const right = normalizeJsonTransportInput(payload.right);
  return {
    ...payload,
    left: left.text,
    right: right.text,
  };
}
