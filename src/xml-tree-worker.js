import { parseXmlTree, searchXmlTree } from './xml-tree.js';
import { normalizeEscapedXml } from './core.js';

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
      // Tree parsing does not need a second pretty-format pass. The editor
      // already contains readable XML in normal usage, and parseXmlTree itself
      // performs structural validation. Avoiding formatXmlBestEffort here saves
      // another full traversal/allocation of multi-megabyte XML documents.
      const cleaned = normalizeEscapedXml(text);
      model = parseXmlTree(cleaned);
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
