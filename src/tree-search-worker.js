import { searchJsonTree } from './search.js';
import { formatJsonBestEffort } from './resilient-format.js';

self.onmessage = ({ data }) => {
  const { id, text, query, limit = 5000 } = data;
  try {
    const formatted = formatJsonBestEffort(text);
    if (formatted.parsed == null) {
      throw new Error(`Tree search requires structurally valid JSON after recovery. ${formatted.warning || ''}`.trim());
    }
    const result = searchJsonTree(formatted.parsed, query, limit);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
};
