export const COMPARISON_FILE_SCHEMA = 'payloaddiff.comparison';
export const COMPARISON_FILE_VERSION = 1;

export function createComparisonSnapshot({ mode, left, right, ui = {} }) {
  if (mode !== 'json' && mode !== 'xml') throw new Error('Comparison mode must be JSON or XML.');
  if (typeof left !== 'string' || typeof right !== 'string' || !left.trim() || !right.trim()) {
    throw new Error('Both payloads are required to save a comparison.');
  }

  return {
    schema: COMPARISON_FILE_SCHEMA,
    version: COMPARISON_FILE_VERSION,
    createdAt: new Date().toISOString(),
    mode,
    payloads: { left, right },
    ui: normalizeUi(ui),
  };
}

export function serializeComparisonSnapshot(snapshot) {
  validateComparisonSnapshot(snapshot);
  return JSON.stringify(snapshot);
}

export function parseComparisonSnapshot(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid PayloadDiff comparison file: ${error?.message || 'invalid JSON'}`);
  }
  validateComparisonSnapshot(parsed);
  return {
    ...parsed,
    ui: normalizeUi(parsed.ui || {}),
  };
}

export function validateComparisonSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Invalid PayloadDiff comparison file.');
  }
  if (snapshot.schema !== COMPARISON_FILE_SCHEMA) {
    throw new Error('This is not a PayloadDiff comparison file.');
  }
  if (snapshot.version !== COMPARISON_FILE_VERSION) {
    throw new Error(`Unsupported PayloadDiff comparison version: ${snapshot.version}.`);
  }
  if (snapshot.mode !== 'json' && snapshot.mode !== 'xml') {
    throw new Error('Saved comparison has an invalid payload mode.');
  }
  if (!snapshot.payloads || typeof snapshot.payloads.left !== 'string' || typeof snapshot.payloads.right !== 'string') {
    throw new Error('Saved comparison is missing one or both payloads.');
  }
  if (!snapshot.payloads.left.trim() || !snapshot.payloads.right.trim()) {
    throw new Error('Saved comparison contains an empty payload.');
  }
  return true;
}

export function comparisonDownloadName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `payloaddiff-comparison-${stamp}.payloaddiff`;
}

function normalizeUi(ui) {
  const views = Array.isArray(ui.views) ? ui.views.slice(0, 2) : [];
  while (views.length < 2) views.push('code');

  return {
    views: views.map((view) => view === 'tree' ? 'tree' : 'code'),
    syncEnabled: ui.syncEnabled !== false,
    currentDiffIndex: Number.isInteger(ui.currentDiffIndex) && ui.currentDiffIndex >= 0 ? ui.currentDiffIndex : 0,
    codeScroll: normalizeScrollPair(ui.codeScroll),
    treeScroll: normalizeScrollPair(ui.treeScroll),
  };
}

function normalizeScrollPair(value) {
  const pair = Array.isArray(value) ? value.slice(0, 2) : [];
  while (pair.length < 2) pair.push({ top: 0, left: 0 });
  return pair.map((item) => ({
    top: finiteNonNegative(item?.top),
    left: finiteNonNegative(item?.left),
  }));
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
