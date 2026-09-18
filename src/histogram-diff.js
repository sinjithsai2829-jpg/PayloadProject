const DEFAULT_MAX_OCCURRENCE = 64;

/**
 * Find unmatched line regions using Histogram-style rare-line anchors.
 *
 * This module deliberately returns regions instead of final add/remove events.
 * The shared line-diff engine can then run bounded Myers inside each unmatched
 * region for word-editor-quality replacement pairing. JSON and XML therefore
 * use the same line matching pipeline.
 */
export function findHistogramDifferenceRegions(leftLines, rightLines, {
  maxOccurrence = DEFAULT_MAX_OCCURRENCE,
} = {}) {
  const left = Array.isArray(leftLines) ? leftLines : [];
  const right = Array.isArray(rightLines) ? rightLines : [];
  const differences = [];
  const stack = [{ aLo: 0, aHi: left.length, bLo: 0, bHi: right.length }];

  while (stack.length) {
    const region = stack.pop();
    if (!region) continue;

    let { aLo, aHi, bLo, bHi } = region;

    while (aLo < aHi && bLo < bHi && left[aLo] === right[bLo]) {
      aLo += 1;
      bLo += 1;
    }
    while (aLo < aHi && bLo < bHi && left[aHi - 1] === right[bHi - 1]) {
      aHi -= 1;
      bHi -= 1;
    }

    if (aLo === aHi && bLo === bHi) continue;
    if (aLo === aHi || bLo === bHi) {
      differences.push({ aLo, aHi, bLo, bHi });
      continue;
    }

    const match = findBestMatchingRegion(left, right, aLo, aHi, bLo, bHi, maxOccurrence);
    if (!match) {
      differences.push({ aLo, aHi, bLo, bHi });
      continue;
    }

    // Stack is LIFO: push the later region first so the earlier region is
    // processed before it. Sorting at the end is still used as a safety net.
    if (match.aHi < aHi || match.bHi < bHi) {
      stack.push({ aLo: match.aHi, aHi, bLo: match.bHi, bHi });
    }
    if (aLo < match.aLo || bLo < match.bLo) {
      stack.push({ aLo, aHi: match.aLo, bLo, bHi: match.bLo });
    }
  }

  differences.sort((leftRegion, rightRegion) =>
    leftRegion.aLo - rightRegion.aLo
    || leftRegion.bLo - rightRegion.bLo
    || leftRegion.aHi - rightRegion.aHi
    || leftRegion.bHi - rightRegion.bHi);

  return differences;
}

function findBestMatchingRegion(left, right, aLo, aHi, bLo, bHi, maxOccurrence) {
  const positions = new Map();
  for (let index = aLo; index < aHi; index += 1) {
    const key = left[index];
    let bucket = positions.get(key);
    if (!bucket) {
      bucket = [];
      positions.set(key, bucket);
    }
    if (bucket.length <= maxOccurrence) bucket.push(index);
  }

  let best = null;
  let bestLength = 0;
  let bestRarity = Infinity;

  for (let bIndex = bLo; bIndex < bHi; bIndex += 1) {
    const candidates = positions.get(right[bIndex]);
    if (!candidates?.length || candidates.length > maxOccurrence) continue;

    let localBestEnd = bIndex + 1;

    for (const aIndex of candidates) {
      if (aIndex < aLo || aIndex >= aHi) continue;

      let matchALo = aIndex;
      let matchBLo = bIndex;
      let matchAHi = aIndex + 1;
      let matchBHi = bIndex + 1;
      let rarity = occurrenceCount(positions, left[aIndex], maxOccurrence);

      while (
        matchALo > aLo
        && matchBLo > bLo
        && left[matchALo - 1] === right[matchBLo - 1]
      ) {
        matchALo -= 1;
        matchBLo -= 1;
        rarity = Math.min(rarity, occurrenceCount(positions, left[matchALo], maxOccurrence));
      }

      while (
        matchAHi < aHi
        && matchBHi < bHi
        && left[matchAHi] === right[matchBHi]
      ) {
        rarity = Math.min(rarity, occurrenceCount(positions, left[matchAHi], maxOccurrence));
        matchAHi += 1;
        matchBHi += 1;
      }

      const length = matchAHi - matchALo;
      if (
        !best
        || length > bestLength
        || rarity < bestRarity
        || (length === bestLength && rarity === bestRarity && matchBLo < best.bLo)
      ) {
        best = {
          aLo: matchALo,
          aHi: matchAHi,
          bLo: matchBLo,
          bHi: matchBHi,
        };
        bestLength = length;
        bestRarity = rarity;
      }

      localBestEnd = Math.max(localBestEnd, matchBHi);
    }

    // Once a consecutive match has been examined, its interior B lines cannot
    // provide a more informative version of that same match. Skipping them
    // prevents unique long files from degenerating into quadratic rescans.
    if (localBestEnd > bIndex + 1) bIndex = localBestEnd - 1;
  }

  return best;
}

function occurrenceCount(positions, key, maxOccurrence) {
  const bucket = positions.get(key);
  if (!bucket) return Infinity;
  return bucket.length > maxOccurrence ? maxOccurrence + 1 : bucket.length;
}
