export function pausedComparisonPresentation(invalidSides = []) {
  const normalized = [...new Set(invalidSides.filter((side) => side === 'left' || side === 'right'))];
  const labels = normalized.map((side) => side === 'left' ? 'File 1' : 'File 2');
  return {
    paused: true,
    showDiffHighlights: false,
    navigationEnabled: false,
    invalidSides: normalized,
    status: labels.length
      ? `${labels.join(' and ')} invalid JSON — comparison paused until the JSON is valid.`
      : 'Editing — checking JSON…',
  };
}

export function activeComparisonPresentation(diffCount) {
  return {
    paused: false,
    showDiffHighlights: true,
    navigationEnabled: diffCount > 0,
    invalidSides: [],
  };
}
