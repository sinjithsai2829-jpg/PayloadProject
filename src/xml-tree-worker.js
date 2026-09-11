import { parseXmlTree, searchXmlTree } from './xml-tree.js';
import { formatXmlBestEffort } from './resilient-format.js';

const cache = new Map();

self.onmessage = ({ data }) => {
  const { id, task, paneIndex = 0, text = '', query = '', limit = 5000 } = data || {};
  try {
    if (task === 'clear') {
      cache.delete(paneIndex);
      self.postMessage({ id, ok: true, result: true });
      return;
    }
    if (task === 'clearAll') {
      cache.clear();
      self.postMessage({ id, ok: true, result: true });
      return;
    }

    let model = cache.get(paneIndex);
    if (task === 'build' || !model) {
      const formatted = formatXmlBestEffort(text);
      if (!formatted.valid) throw new Error(formatted.warning || 'XML is not structurally valid enough for Tree view.');
      model = parseXmlTree(formatted.formatted);
      cache.set(paneIndex, model);
    }

    if (task === 'build') {
      self.postMessage({ id, ok: true, result: { model } });
      return;
    }
    if (task === 'search') {
      self.postMessage({ id, ok: true, result: searchXmlTree(model, query, limit) });
      return;
    }

    throw new Error(`Unknown XML tree task: ${task}`);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
};
