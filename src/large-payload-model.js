export const LARGE_PAYLOAD_THRESHOLD_CHARS = 256 * 1024;
export const LARGE_PAYLOAD_THRESHOLD_BYTES = 320 * 1024;
export const LARGE_PAYLOAD_MAX_PHYSICAL_SCROLL = 8_000_000;
export const LARGE_PAYLOAD_RENDER_OVERSCAN_LINES = 10;
export const LARGE_PAYLOAD_RENDER_OVERSCAN_CHARS = 180;
export const LARGE_PAYLOAD_MAX_RENDER_CHARS = 6000;

export function shouldUseLargePayloadMode(value) {
  if (typeof value === 'number') return value >= LARGE_PAYLOAD_THRESHOLD_CHARS;
  return String(value ?? '').length >= LARGE_PAYLOAD_THRESHOLD_CHARS;
}

export function shouldUseLargePayloadModeForFile(size) {
  return Math.max(0, Number(size) || 0) >= LARGE_PAYLOAD_THRESHOLD_BYTES;
}

export function buildLineIndex(input) {
  const text = String(input ?? '');
  if (text.length > 0xffffffff) throw new Error('Payload is too large for browser line indexing.');

  let lineCount = 1;
  let currentLength = 0;
  let maxLineLength = 0;
  for (let offset = 0; offset < text.length; offset += 1) {
    if (text.charCodeAt(offset) === 10) {
      lineCount += 1;
      if (currentLength > maxLineLength) maxLineLength = currentLength;
      currentLength = 0;
    } else {
      currentLength += 1;
    }
  }
  if (currentLength > maxLineLength) maxLineLength = currentLength;

  const lineStarts = new Uint32Array(lineCount);
  let lineIndex = 1;
  for (let offset = 0; offset < text.length && lineIndex < lineCount; offset += 1) {
    if (text.charCodeAt(offset) === 10) lineStarts[lineIndex++] = offset + 1;
  }

  return {
    lineStarts,
    lineCount,
    maxLineLength,
    textLength: text.length,
  };
}

export function lineBounds(lineStarts, textLength, lineIndex) {
  const starts = lineStarts instanceof Uint32Array ? lineStarts : Uint32Array.from(lineStarts || [0]);
  if (!starts.length) return { start: 0, end: 0 };
  const safeIndex = Math.max(0, Math.min(starts.length - 1, Number(lineIndex) || 0));
  const start = starts[safeIndex] || 0;
  const next = safeIndex + 1 < starts.length ? starts[safeIndex + 1] : Math.max(start, Number(textLength) || 0);
  return {
    start,
    end: safeIndex + 1 < starts.length ? Math.max(start, next - 1) : next,
  };
}

export function physicalExtent(logicalExtent, viewportExtent, maxPhysical = LARGE_PAYLOAD_MAX_PHYSICAL_SCROLL) {
  const logical = Math.max(0, Number(logicalExtent) || 0);
  const viewport = Math.max(0, Number(viewportExtent) || 0);
  return Math.max(viewport, Math.min(Math.max(viewport, logical), Math.max(viewport, maxPhysical)));
}

export function logicalOffsetFromPhysical({
  physicalOffset,
  physicalExtent: totalPhysical,
  viewportExtent,
  logicalExtent,
}) {
  const viewport = Math.max(0, Number(viewportExtent) || 0);
  const maxPhysical = Math.max(0, (Number(totalPhysical) || 0) - viewport);
  const maxLogical = Math.max(0, (Number(logicalExtent) || 0) - viewport);
  if (!maxPhysical || !maxLogical) return 0;
  const progress = clamp((Number(physicalOffset) || 0) / maxPhysical, 0, 1);
  return progress * maxLogical;
}

export function physicalOffsetFromLogical({
  logicalOffset,
  physicalExtent: totalPhysical,
  viewportExtent,
  logicalExtent,
}) {
  const viewport = Math.max(0, Number(viewportExtent) || 0);
  const maxPhysical = Math.max(0, (Number(totalPhysical) || 0) - viewport);
  const maxLogical = Math.max(0, (Number(logicalExtent) || 0) - viewport);
  if (!maxPhysical || !maxLogical) return 0;
  const progress = clamp((Number(logicalOffset) || 0) / maxLogical, 0, 1);
  return progress * maxPhysical;
}

export function visibleLineWindow({
  logicalScrollTop,
  viewportHeight,
  lineHeight,
  lineCount,
  overscan = LARGE_PAYLOAD_RENDER_OVERSCAN_LINES,
}) {
  const rows = Math.max(1, Math.floor(Number(lineCount) || 1));
  const height = Math.max(1, Number(lineHeight) || 20);
  const firstVisible = Math.max(0, Math.floor(Math.max(0, Number(logicalScrollTop) || 0) / height));
  const visibleCount = Math.max(1, Math.ceil(Math.max(1, Number(viewportHeight) || height) / height));
  const first = Math.max(0, firstVisible - overscan);
  const last = Math.min(rows - 1, firstVisible + visibleCount + overscan);
  return { first, last, firstVisible, visibleCount };
}

export function visibleCharacterWindow({
  logicalScrollLeft,
  viewportWidth,
  gutterWidth = 78,
  charWidth,
  lineLength,
  overscan = LARGE_PAYLOAD_RENDER_OVERSCAN_CHARS,
  maxRenderChars = LARGE_PAYLOAD_MAX_RENDER_CHARS,
}) {
  const width = Math.max(1, Number(charWidth) || 8);
  const contentLeft = Math.max(0, (Number(logicalScrollLeft) || 0) - gutterWidth);
  const firstVisible = Math.max(0, Math.floor(contentLeft / width));
  const visibleCount = Math.max(1, Math.ceil(Math.max(1, (Number(viewportWidth) || 1) - gutterWidth) / width));
  const first = Math.max(0, firstVisible - overscan);
  const requested = visibleCount + overscan * 2;
  const count = Math.min(Math.max(visibleCount, requested), Math.max(visibleCount, maxRenderChars));
  const last = Math.min(Math.max(0, Number(lineLength) || 0), first + count);
  return { first, last, firstVisible, visibleCount };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
