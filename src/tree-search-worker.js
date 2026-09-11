import { searchJsonTree } from './search.js';
import { formatJsonBestEffort, formatXmlBestEffort } from './resilient-format.js';
import { parseXmlTree, searchXmlTree } from './xml-tree.js';

self.onmessage = ({ data }) => {
  const { id, mode = 'json', text, query, limit = 5000 } = data;
  try {
    let result;
    if (mode === 'xml') {
      const formatted = formatXmlBestEffort(text);
      if (!formatted.valid) {
        throw new Error(`Tree search requires structurally valid XML after recovery. ${formatted.warning || ''}`.trim());
      }
      const model = parseXmlTree(formatted.formatted);
      result = searchXmlTree(model, query, limit);
    } else {
      const formatted = formatJsonBestEffort(text);
      if (formatted.parsed == null) {
        throw new Error(`Tree search requires structurally valid JSON after recovery. ${formatted.warning || ''}`.trim());
      }
      result = searchJsonTree(formatted.parsed, query, limit);
    }
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
};
