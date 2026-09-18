export function nearestStructuralDiff(structuralDiffs, codeDiff, paneIndex) {
  const source = Array.isArray(structuralDiffs) ? structuralDiffs : [];
  if (!source.length || !codeDiff) return null;

  const primary = paneIndex === 0 ? positiveLine(codeDiff.leftLine) : positiveLine(codeDiff.rightLine);
  const fallback = paneIndex === 0 ? positiveLine(codeDiff.rightLine) : positiveLine(codeDiff.leftLine);
  const target = primary || fallback;
  if (!target) return source[0] || null;

  let best = null;
  let bestDistance = Infinity;
  for (const diff of source) {
    const own = paneIndex === 0 ? positiveLine(diff.leftLine) : positiveLine(diff.rightLine);
    const other = paneIndex === 0 ? positiveLine(diff.rightLine) : positiveLine(diff.leftLine);
    const line = own || other;
    if (!line) continue;
    const distance = Math.abs(line - target);
    if (distance < bestDistance) {
      best = diff;
      bestDistance = distance;
      if (distance === 0) break;
    }
  }
  return best || source[0] || null;
}

function positiveLine(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
