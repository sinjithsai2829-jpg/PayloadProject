import {
  createPortableComparisonHtml as createLegacyPortableComparisonHtml,
  parsePortableComparisonHtml,
} from './portable-comparison-html.js';

export { parsePortableComparisonHtml };

export const PORTABLE_EXPORT_VERSION = 'browser-v3';

export function portableComparisonDownloadName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `payloaddiff-${PORTABLE_EXPORT_VERSION}-${stamp}.html`;
}

export function createPortableComparisonHtml(snapshot) {
  let html = createLegacyPortableComparisonHtml(snapshot);
  html = repairInlineRuntimeEscapes(html);
  html = repairGeneratedRuntimeFunctions(html);
  html = addExportVersionMarker(html);
  html = prefillPanelNames(html, snapshot);
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

export function repairGeneratedRuntimeFunctions(html) {
  let output = String(html);

  const safeJoinPath = [
    "function joinPath(path,key){var text=String(key);return isSimplePathKey(text)?path+'.'+text:path+'['+JSON.stringify(text)+']';}",
    "function isSimplePathKey(text){if(!text)return false;var first=text.charCodeAt(0);if(!isPathKeyStart(first))return false;for(var i=1;i<text.length;i++){if(!isPathKeyPart(text.charCodeAt(i)))return false;}return true;}",
    "function isPathKeyStart(code){return(code>=65&&code<=90)||(code>=97&&code<=122)||code===95||code===36;}",
    "function isPathKeyPart(code){return isPathKeyStart(code)||(code>=48&&code<=57);}",
  ].join('');
  output = replaceGeneratedFunction(output, 'function joinPath(path,key){', 'function typeOf', safeJoinPath);

  const safePathAncestors = [
    "function pathAncestors(path){",
    "var out=['$'];if(!path||path==='$')return out;",
    "var current='$',i=1;",
    "while(i<path.length){",
    "var start=i;",
    "if(path.charCodeAt(i)===46){",
    "i++;while(i<path.length&&path.charCodeAt(i)!==46&&path.charCodeAt(i)!==91)i++;",
    "}else if(path.charCodeAt(i)===91){",
    "i++;var quoted=false,escaped=false;",
    "while(i<path.length){var code=path.charCodeAt(i++);",
    "if(escaped){escaped=false;continue;}",
    "if(code===92){escaped=true;continue;}",
    "if(code===34){quoted=!quoted;continue;}",
    "if(code===93&&!quoted)break;}",
    "}else{i++;continue;}",
    "current+=path.slice(start,i);out.push(current);",
    "}",
    "return out;",
    "}",
  ].join('');
  output = replaceGeneratedFunction(output, 'function pathAncestors(path){', 'function findTreeRow', safePathAncestors);

  return output;
}

export function extractPortableRuntimeScript(html) {
  const marker = "<script>\n(function(){";
  const start = String(html).lastIndexOf(marker);
  if (start < 0) throw new Error('Portable comparison runtime script was not found.');
  const bodyStart = start + '<script>'.length;
  const end = String(html).indexOf('</script>', bodyStart);
  if (end < 0) throw new Error('Portable comparison runtime script was not terminated.');
  return String(html).slice(bodyStart, end);
}

function replaceGeneratedFunction(html, startMarker, endMarker, replacement) {
  const start = html.indexOf(startMarker);
  if (start < 0) throw new Error(`Portable runtime repair failed: ${startMarker} was not found.`);
  const end = html.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Portable runtime repair failed: ${endMarker} was not found.`);
  return html.slice(0, start) + replacement + html.slice(end);
}

function addExportVersionMarker(html) {
  return String(html)
    .replace(
      '<title>PayloadDiff Saved Comparison</title>',
      `<title>PayloadDiff Saved Comparison</title>\n<meta name="payloaddiff-export-version" content="${PORTABLE_EXPORT_VERSION}" />`,
    )
    .replace('<body>', `<body data-payloaddiff-export="${PORTABLE_EXPORT_VERSION}">`);
}

function prefillPanelNames(html, snapshot) {
  const names = Array.isArray(snapshot?.ui?.panelNames) ? snapshot.ui.panelNames : ['File 1', 'File 2'];
  let output = String(html);
  output = output.replace('<div class="paneHead"><strong>File 1</strong>', `<div class="paneHead"><strong>${escapeHtmlText(names[0] || 'File 1')}</strong>`);
  output = output.replace('<div class="paneHead"><strong>File 2</strong>', `<div class="paneHead"><strong>${escapeHtmlText(names[1] || 'File 2')}</strong>`);
  return output;
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
    .replace(
      '<p id="savedMeta">Portable comparison file</p>',
      `<p id="savedMeta">${escapeHtmlText(snapshot.mode.toUpperCase())} comparison · ${PORTABLE_EXPORT_VERSION} · ${escapeHtmlText(createdAt)}</p>`,
    )
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
