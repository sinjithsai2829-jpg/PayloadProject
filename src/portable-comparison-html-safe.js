import {
  createPortableComparisonHtml as createLegacyPortableComparisonHtml,
  parsePortableComparisonHtml,
} from './portable-comparison-html.js';

export { parsePortableComparisonHtml };

export function portableComparisonDownloadName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `payloaddiff-browser-v2-${stamp}.html`;
}

// The portable viewer is generated from a template literal. Repair the legacy
// inline runtime escapes, then add a static payload fallback directly into both
// textareas. That way a saved file can never look empty merely because its
// interactive JavaScript failed to start.
export function createPortableComparisonHtml(snapshot) {
  let html = createLegacyPortableComparisonHtml(snapshot);
  html = repairInlineRuntimeEscapes(html);
  html = addExportVersionMarker(html);
  html = prefillPayloadTextareas(html, snapshot);
  html = prefillStaticMetadata(html, snapshot);
  html = addRuntimeErrorReporter(html);
  return html;
}

export function repairInlineRuntimeEscapes(html) {
  return String(html)
    .split("split('\n')")
    .join("split('\\n')");
}

export function extractPortableRuntimeScript(html) {
  const scripts = [...String(html).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  // Snapshot JSON and the small error reporter appear before the main runtime.
  // The last script is always the executable self-contained viewer runtime.
  if (scripts.length < 2) throw new Error('Portable comparison runtime script was not found.');
  return scripts[scripts.length - 1][1];
}

function addExportVersionMarker(html) {
  return String(html)
    .replace('<title>PayloadDiff Saved Comparison</title>', '<title>PayloadDiff Saved Comparison</title>\n<meta name="payloaddiff-export-version" content="browser-v2" />')
    .replace('<body>', '<body data-payloaddiff-export="browser-v2">');
}

function prefillPayloadTextareas(html, snapshot) {
  const payloads = [snapshot.payloads.left, snapshot.payloads.right];
  let index = 0;
  return String(html).replace(
    /<textarea class="codeEditor" spellcheck="false" wrap="off"><\/textarea>/g,
    (match) => {
      const payload = payloads[index++];
      if (typeof payload !== 'string') return match;
      return `<textarea class="codeEditor" spellcheck="false" wrap="off">${escapeTextareaText(payload)}</textarea>`;
    },
  );
}

function prefillStaticMetadata(html, snapshot) {
  const leftLines = lineCount(snapshot.payloads.left);
  const rightLines = lineCount(snapshot.payloads.right);
  const createdAt = snapshot.createdAt || '';
  return String(html)
    .replace('<p id="savedMeta">Portable comparison file</p>', `<p id="savedMeta">${escapeHtmlText(snapshot.mode.toUpperCase())} comparison · browser-v2 · ${escapeHtmlText(createdAt)}</p>`)
    .replace('<span id="meta0"></span>', `<span id="meta0">${leftLines.toLocaleString()} lines</span>`)
    .replace('<span id="meta1"></span>', `<span id="meta1">${rightLines.toLocaleString()} lines</span>`)
    .replace('<div id="status" class="status">Ready</div>', '<div id="status" class="status">Loading saved comparison…</div>');
}

function addRuntimeErrorReporter(html) {
  const marker = '<script id="payloaddiff-snapshot" type="application/json">';
  const snapshotStart = String(html).indexOf(marker);
  if (snapshotStart < 0) return html;
  const snapshotEnd = String(html).indexOf('</script>', snapshotStart);
  if (snapshotEnd < 0) return html;
  const insertAt = snapshotEnd + '</script>'.length;
  const reporter = `\n<script>window.addEventListener('error',function(event){var status=document.getElementById('status');if(status){status.textContent='Saved comparison runtime error: '+(event.message||'unknown error');status.classList.add('error');}});<\/script>`;
  return String(html).slice(0, insertAt) + reporter + String(html).slice(insertAt);
}

function escapeTextareaText(text) {
  return escapeHtmlText(text);
}

function escapeHtmlText(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function lineCount(text) {
  if (!text) return 0;
  let count = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) count += 1;
  }
  return count;
}
