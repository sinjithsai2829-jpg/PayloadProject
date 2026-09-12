export const COMPARISON_FILE_SCHEMA = 'payloaddiff.comparison';
export const COMPARISON_FILE_VERSION = 1;
const MAX_SAVED_DIFFS = 20000;

export function createComparisonSnapshot({ mode, left, right, ui = {}, comparison = null }) {
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
    comparison: normalizeComparison(comparison, mode),
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
    comparison: normalizeComparison(parsed.comparison, parsed.mode),
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

function normalizeComparison(value, mode) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const rawDiffs = Array.isArray(value.diffs)
    ? value.diffs
    : Array.isArray(value.ordered)
      ? value.ordered
      : [];
  const diffs = [];
  for (const raw of rawDiffs.slice(0, MAX_SAVED_DIFFS)) {
    if (!raw || typeof raw !== 'object') continue;
    const type = raw.type === 'added' || raw.type === 'removed' ? raw.type : 'modified';
    const leftLine = positiveIntegerOrNull(raw.leftLine);
    const rightLine = positiveIntegerOrNull(raw.rightLine);
    diffs.push({
      path: typeof raw.path === 'string' ? raw.path.slice(0, 2048) : `$saved[${diffs.length}]`,
      type,
      leftLine,
      rightLine,
    });
  }

  const counted = countDiffTypes(diffs);
  const sourceSummary = value.summary && typeof value.summary === 'object' ? value.summary : {};
  const summary = {
    added: nonNegativeInteger(sourceSummary.added, counted.added),
    removed: nonNegativeInteger(sourceSummary.removed, counted.removed),
    modified: nonNegativeInteger(sourceSummary.modified, counted.modified),
    truncated: sourceSummary.truncated === true || rawDiffs.length > MAX_SAVED_DIFFS,
  };

  const comparisonKind = value.comparisonKind === 'text'
    || value.fallback === true
    || diffs.some((diff) => diff.path.startsWith('$text['))
    ? 'text'
    : 'structural';

  return {
    mode: mode === 'xml' ? 'xml' : 'json',
    comparisonKind,
    fallback: comparisonKind === 'text',
    fallbackReason: typeof value.fallbackReason === 'string' ? value.fallbackReason.slice(0, 1000) : '',
    diffs,
    summary,
    identical: summary.added + summary.removed + summary.modified === 0,
    elapsedMs: finiteNonNegative(value.elapsedMs),
  };
}

function countDiffTypes(diffs) {
  const summary = { added: 0, removed: 0, modified: 0 };
  for (const diff of diffs) summary[diff.type] += 1;
  return summary;
}

function normalizeUi(ui) {
  const views = Array.isArray(ui.views) ? ui.views.slice(0, 2) : [];
  while (views.length < 2) views.push('code');

  return {
    views: views.map((view) => view === 'tree' ? 'tree' : 'code'),
    theme: ui.theme === 'light' ? 'light' : 'dark',
    panelNames: normalizePanelNames(ui.panelNames),
    syncEnabled: ui.syncEnabled !== false,
    wordWrap: normalizeBooleanPair(ui.wordWrap),
    currentDiffIndex: Number.isInteger(ui.currentDiffIndex) && ui.currentDiffIndex >= 0 ? ui.currentDiffIndex : 0,
    selectedLines: normalizeSelectedLines(ui.selectedLines),
    foldedRanges: normalizeFoldedRanges(ui.foldedRanges),
    codeScroll: normalizeScrollPair(ui.codeScroll),
    treeScroll: normalizeScrollPair(ui.treeScroll),
  };
}

function normalizeBooleanPair(value) {
  const pair = Array.isArray(value) ? value.slice(0, 2) : [];
  while (pair.length < 2) pair.push(false);
  return pair.map(Boolean);
}

function normalizePanelNames(value) {
  const names = Array.isArray(value) ? value.slice(0, 2) : [];
  while (names.length < 2) names.push('');
  return names.map((name, index) => {
    const text = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return text || `File ${index + 1}`;
  });
}

function normalizeSelectedLines(value) {
  const pair = Array.isArray(value) ? value.slice(0, 2) : [];
  while (pair.length < 2) pair.push(null);
  return pair.map((line) => {
    const number = Number(line);
    return Number.isInteger(number) && number > 0 ? number : null;
  });
}

function normalizeFoldedRanges(value) {
  const pair = Array.isArray(value) ? value.slice(0, 2) : [];
  while (pair.length < 2) pair.push([]);
  return pair.map((lines) => {
    if (!Array.isArray(lines)) return [];
    return [...new Set(lines
      .map((line) => Number(line))
      .filter((line) => Number.isInteger(line) && line > 0))]
      .sort((a, b) => a - b)
      .slice(0, 10000);
  });
}

function normalizeScrollPair(value) {
  const pair = Array.isArray(value) ? value.slice(0, 2) : [];
  while (pair.length < 2) pair.push({ top: 0, left: 0 });
  return pair.map((item) => ({
    top: finiteNonNegative(item?.top),
    left: finiteNonNegative(item?.left),
  }));
}

function positiveIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
