import { buildLineIndex } from './large-payload-model.js';

self.onmessage = async ({ data }) => {
  const { id, task, payload = {} } = data || {};
  try {
    if (task === 'index') {
      const text = String(payload.text ?? '');
      postIndex(id, text, buildLineIndex(text));
      return;
    }

    if (task === 'readFile') {
      const file = payload.file;
      if (!file || typeof file.text !== 'function') throw new Error('A readable file is required.');
      const text = await file.text();
      postIndex(id, text, buildLineIndex(text));
      return;
    }

    throw new Error(`Unknown large-payload task: ${task}`);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
};

function postIndex(id, text, index) {
  const lineStarts = index.lineStarts;
  self.postMessage({
    id,
    ok: true,
    result: {
      text,
      lineStarts,
      lineCount: index.lineCount,
      maxLineLength: index.maxLineLength,
      textLength: index.textLength,
    },
  }, [lineStarts.buffer]);
}
