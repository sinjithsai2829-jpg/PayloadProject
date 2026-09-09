import { searchJsonTree } from './search.js';

self.onmessage = ({ data }) => {
  const { id, text, query, limit = 5000 } = data;
  try {
    const parsed = JSON.parse(text);
    const result = searchJsonTree(parsed, query, limit);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
};
