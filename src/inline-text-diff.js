import { diffLines } from './line-diff.js';

const MAX_CHAR_REFINEMENT = 4096;

export function inlineDiffRanges(leftText, rightText) {
  const left = String(leftText ?? '');
  const right = String(rightText ?? '');
  if (left === right) return { left: [], right: [] };

  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (!leftTokens.length || !rightTokens.length) {
    return {
      left: left ? [{ start: 0, end: left.length }] : [],
      right: right ? [{ start: 0, end: right.length }] : [],
    };
  }

  const tokenDiff = diffLines(
    leftTokens.map((token) => token.text),
    rightTokens.map((token) => token.text),
    {
      maxDiffs: Math.max(128, leftTokens.length + rightTokens.length),
      maxEditDistance: Math.max(128, leftTokens.length + rightTokens.length),
      pathPrefix: '$word',
    },
  );

  const leftRanges = [];
  const rightRanges = [];

  for (const diff of tokenDiff.diffs) {
    const leftToken = positiveIndex(diff.leftLine) ? leftTokens[diff.leftLine - 1] : null;
    const rightToken = positiveIndex(diff.rightLine) ? rightTokens[diff.rightLine - 1] : null;

    if (diff.type === 'modified' && leftToken && rightToken) {
      const refined = refineToken(leftToken.text, rightToken.text);
      for (const range of refined.left) {
        leftRanges.push({ start: leftToken.start + range.start, end: leftToken.start + range.end });
      }
      for (const range of refined.right) {
        rightRanges.push({ start: rightToken.start + range.start, end: rightToken.start + range.end });
      }
      continue;
    }

    if (leftToken) leftRanges.push({ start: leftToken.start, end: leftToken.end });
    if (rightToken) rightRanges.push({ start: rightToken.start, end: rightToken.end });
  }

  return {
    left: mergeRanges(leftRanges),
    right: mergeRanges(rightRanges),
  };
}

function refineToken(left, right) {
  if (left === right) return { left: [], right: [] };
  if (left.length + right.length > MAX_CHAR_REFINEMENT) return prefixSuffixRanges(left, right);

  const leftChars = Array.from(left);
  const rightChars = Array.from(right);
  const charDiff = diffLines(leftChars, rightChars, {
    maxDiffs: Math.max(64, leftChars.length + rightChars.length),
    maxEditDistance: Math.max(64, leftChars.length + rightChars.length),
    pathPrefix: '$char',
  });
  const leftOffsets = codePointOffsets(left);
  const rightOffsets = codePointOffsets(right);
  const leftRanges = [];
  const rightRanges = [];

  for (const diff of charDiff.diffs) {
    const leftIndex = positiveIndex(diff.leftLine) ? diff.leftLine - 1 : -1;
    const rightIndex = positiveIndex(diff.rightLine) ? diff.rightLine - 1 : -1;
    if (leftIndex >= 0 && leftIndex + 1 < leftOffsets.length) {
      leftRanges.push({ start: leftOffsets[leftIndex], end: leftOffsets[leftIndex + 1] });
    }
    if (rightIndex >= 0 && rightIndex + 1 < rightOffsets.length) {
      rightRanges.push({ start: rightOffsets[rightIndex], end: rightOffsets[rightIndex + 1] });
    }
  }

  const mergedLeft = mergeRanges(leftRanges);
  const mergedRight = mergeRanges(rightRanges);
  if (!mergedLeft.length && !mergedRight.length) return prefixSuffixRanges(left, right);
  return { left: mergedLeft, right: mergedRight };
}

function tokenize(text) {
  const tokens = [];
  const pattern = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+/gu;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    tokens.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

function prefixSuffixRanges(left, right) {
  let prefix = 0;
  const limit = Math.min(left.length, right.length);
  while (prefix < limit && left[prefix] === right[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < left.length - prefix
    && suffix < right.length - prefix
    && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) suffix += 1;

  const leftEnd = Math.max(prefix, left.length - suffix);
  const rightEnd = Math.max(prefix, right.length - suffix);
  return {
    left: leftEnd > prefix ? [{ start: prefix, end: leftEnd }] : [],
    right: rightEnd > prefix ? [{ start: prefix, end: rightEnd }] : [],
  };
}

function codePointOffsets(text) {
  const offsets = [0];
  let offset = 0;
  for (const char of Array.from(text)) {
    offset += char.length;
    offsets.push(offset);
  }
  return offsets;
}

function mergeRanges(ranges) {
  const ordered = ranges
    .filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end) && range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (!ordered.length) return [];

  const merged = [{ ...ordered[0] }];
  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index];
    const previous = merged[merged.length - 1];
    if (current.start <= previous.end) previous.end = Math.max(previous.end, current.end);
    else merged.push({ ...current });
  }
  return merged;
}

function positiveIndex(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
