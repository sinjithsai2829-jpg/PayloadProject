export function buildDiffLineIndex(orderedDiffs, paneIndex) {
  const entries = [];
  for (let index = 0; index < orderedDiffs.length; index += 1) {
    const diff = orderedDiffs[index];
    const primary = paneIndex === 0 ? diff.leftLine : diff.rightLine;
    const fallback = paneIndex === 0 ? diff.rightLine : diff.leftLine;
    const line = primary || fallback;
    if (!line) continue;
    entries.push({ line, index });
  }
  entries.sort((a, b) => a.line - b.line || a.index - b.index);
  return entries;
}

export function nearestDiffIndexForLine(entries, targetLine) {
  if (!entries?.length) return -1;
  if (targetLine <= entries[0].line) return entries[0].index;
  const last = entries[entries.length - 1];
  if (targetLine >= last.line) return last.index;

  let lo = 0;
  let hi = entries.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].line < targetLine) lo = mid + 1;
    else hi = mid;
  }

  const after = entries[lo];
  const before = entries[Math.max(0, lo - 1)];
  const beforeDistance = Math.abs(targetLine - before.line);
  const afterDistance = Math.abs(after.line - targetLine);
  return beforeDistance <= afterDistance ? before.index : after.index;
}

export function visibleCenterLine({ scrollTop, clientHeight, lineHeight, paddingTop = 0 }) {
  const safeHeight = Math.max(1, lineHeight || 1);
  const centerY = scrollTop + clientHeight / 2 - paddingTop;
  return Math.max(1, Math.round(centerY / safeHeight) + 1);
}
