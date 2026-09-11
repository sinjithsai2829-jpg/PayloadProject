import { detectPayloadIssues } from './syntax-issues.js';

self.onmessage = ({ data }) => {
  const { id, mode, text } = data;
  try {
    const issues = detectPayloadIssues({ mode, text });
    self.postMessage({ id, ok: true, issues });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error), issues: [] });
  }
};
