import {
  createPortableComparisonHtml as createLegacyPortableComparisonHtml,
  parsePortableComparisonHtml,
} from './portable-comparison-html.js';

export { parsePortableComparisonHtml };

export const PORTABLE_EXPORT_VERSION = 'browser-v4';

export function portableComparisonDownloadName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `payloaddiff-${PORTABLE_EXPORT_VERSION}-${stamp}.html`;
}

export function createPortableComparisonHtml(snapshot) {
  let html = createLegacyPortableComparisonHtml(snapshot);
  html = repairInlineRuntimeEscapes(html);
  html = repairGeneratedRuntimeFunctions(html);
  html = patchPortableDifferenceNavigation(html);
  html = patchSavedComparisonBootstrap(html);
  html = addExportVersionMarker(html, snapshot);
  html = addModernStandaloneTheme(html, snapshot);
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

export function patchPortableDifferenceNavigation(html) {
  let output = String(html);
  const firstIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.5h12M10 16V7M6.5 10.5 10 7l3.5 3.5"/></svg>';
  const previousIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16V5.5M6.5 9 10 5.5 13.5 9"/></svg>';
  const nextIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v10.5M6.5 11 10 14.5l3.5-3.5"/></svg>';
  const lastIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 15.5h12M10 4v9M6.5 10 10 13.5l3.5-3.5"/></svg>';

  output = output.replace(
    '<div class="nav"><button id="prev">← Previous</button><strong id="position">0 of 0</strong><button id="next">Next →</button></div>',
    `<div class="nav" aria-label="Difference navigation"><button id="first" title="First difference" aria-label="First difference">${firstIcon}</button><button id="prev" title="Previous difference" aria-label="Previous difference">${previousIcon}</button><strong id="position">0 of 0</strong><button id="next" title="Next difference" aria-label="Next difference">${nextIcon}</button><button id="last" title="Last difference" aria-label="Last difference">${lastIcon}</button></div>`,
  );

  output = output.replace(
    "var prev=document.getElementById('prev');\nvar next=document.getElementById('next');",
    "var first=document.getElementById('first');\nvar prev=document.getElementById('prev');\nvar next=document.getElementById('next');\nvar last=document.getElementById('last');",
  );

  output = output.replace(
    "prev.addEventListener('click',function(){move(-1);});next.addEventListener('click',function(){move(1);});",
    "first.addEventListener('click',function(){goAbsolute(0);});prev.addEventListener('click',function(){move(-1);});next.addEventListener('click',function(){move(1);});last.addEventListener('click',function(){goAbsolute(Math.max(0,ordered.length-1));});",
  );

  output = output.replace(
    "function updateNav(){position.textContent=ordered.length?(current+1)+' of '+ordered.length:'0 of 0';prev.disabled=!ordered.length;next.disabled=!ordered.length;}",
    "function updateNav(){var empty=!ordered.length;position.textContent=empty?'0 of 0':(current+1)+' of '+ordered.length;first.disabled=empty||current<=0;prev.disabled=empty;next.disabled=empty;last.disabled=empty||current>=ordered.length-1;}",
  );

  output = output.replace(
    "function move(delta){if(!ordered.length)return;current=(current+delta+ordered.length)%ordered.length;updateNav();renderAllCode();if(activeView(0)==='tree')revealTree(0,ordered[current].path);if(activeView(1)==='tree')revealTree(1,ordered[current].path);if(activeView(0)==='code'||activeView(1)==='code')scrollToCurrent();}",
    "function move(delta){if(!ordered.length)return;current=(current+delta+ordered.length)%ordered.length;finishNavMove();}function goAbsolute(index){if(!ordered.length)return;current=Math.min(Math.max(0,index),ordered.length-1);finishNavMove();}function finishNavMove(){updateNav();renderAllCode();if(activeView(0)==='tree')revealTree(0,ordered[current].path);if(activeView(1)==='tree')revealTree(1,ordered[current].path);if(activeView(0)==='code'||activeView(1)==='code')scrollToCurrent();}",
  );

  output = output.replace(
    "overlays.forEach(function(o){o.replaceChildren();});prev.disabled=true;next.disabled=true;",
    "overlays.forEach(function(o){o.replaceChildren();});first.disabled=true;prev.disabled=true;next.disabled=true;last.disabled=true;",
  );

  output = output.replace(
    '.nav{display:flex;gap:8px;align-items:center;white-space:nowrap}',
    '.nav{display:inline-flex;gap:5px;align-items:center;min-height:34px;white-space:nowrap}.nav button{width:36px;min-width:36px;height:34px;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:1}.nav button svg{width:19px;height:19px;display:block;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}.nav button:disabled{opacity:.34}.nav strong{min-width:78px;padding:0 9px;text-align:center;font-variant-numeric:tabular-nums}',
  );

  return output;
}

export function patchSavedComparisonBootstrap(html) {
  let output = String(html);
  const bootstrap = [
    "function restoreSavedComparison(){",
    "var saved=snapshot&&snapshot.comparison;",
    "if(!saved||!Array.isArray(saved.diffs))return false;",
    "ordered=saved.diffs.map(function(d,i){return{path:typeof d.path==='string'?d.path:'$saved['+i+']',type:d.type==='added'||d.type==='removed'?d.type:'modified',leftLine:d.leftLine||null,rightLine:d.rightLine||null};});",
    "summary=saved.summary&&typeof saved.summary==='object'?{added:Number(saved.summary.added)||0,removed:Number(saved.summary.removed)||0,modified:Number(saved.summary.modified)||0,truncated:saved.summary.truncated===true}:{added:0,removed:0,modified:0,truncated:false};",
    "current=Math.min(Math.max(0,snapshot.ui&&Number.isInteger(snapshot.ui.currentDiffIndex)?snapshot.ui.currentDiffIndex:0),Math.max(0,ordered.length-1));",
    "exact=new Map();ancestors=new Set();",
    "if(mode==='json'&&saved.comparisonKind!=='text'){try{parsed=[parseJson(editors[0].value),parseJson(editors[1].value)];ordered.forEach(function(d){exact.set(d.path,d.type);var a=pathAncestors(d.path);for(var i=0;i<a.length-1;i++)ancestors.add(a[i]);});}catch(_){parsed=[null,null];}}else{parsed=[null,null];}",
    "buildIndexes();renderSummary();renderAllCode();renderTrees();restoreUi();updateNav();",
    "if(ordered.length)scrollToCurrent();",
    "status.textContent=saved.comparisonKind==='text'?'Saved text comparison ready':ordered.length?'Saved comparison ready':'No differences';status.classList.remove('error');",
    "return true;",
    "}",
  ].join('');

  output = output.replace('recompare(true);', `if(!restoreSavedComparison())recompare(true);\n\n${bootstrap}`);
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

function addExportVersionMarker(html, snapshot) {
  const theme = snapshot?.ui?.theme === 'light' ? 'light' : 'dark';
  return String(html)
    .replace(
      '<html lang="en">',
      `<html lang="en" data-theme="${theme}">`,
    )
    .replace(
      '<title>PayloadDiff Saved Comparison</title>',
      `<title>PayloadDiff Downloaded Comparison</title>\n<meta name="payloaddiff-export-version" content="${PORTABLE_EXPORT_VERSION}" />`,
    )
    .replace('<body>', `<body data-payloaddiff-export="${PORTABLE_EXPORT_VERSION}">`);
}

function addModernStandaloneTheme(html, snapshot) {
  const theme = snapshot?.ui?.theme === 'light' ? 'light' : 'dark';
  const css = `
<style id="payloaddiff-v4-theme">
html{color-scheme:${theme}}
body[data-payloaddiff-export="browser-v4"]{margin:0;min-width:320px;min-height:100vh}
body[data-payloaddiff-export="browser-v4"] .app{width:min(1900px,100%);max-width:none;padding:22px}
body[data-payloaddiff-export="browser-v4"] .top{align-items:center;margin-bottom:16px}
body[data-payloaddiff-export="browser-v4"] .brand h1{font-size:27px;letter-spacing:-.04em}
body[data-payloaddiff-export="browser-v4"] .pill{padding:4px 8px;font-size:11px}
body[data-payloaddiff-export="browser-v4"] .summary{min-height:52px;border-radius:12px;padding:10px 12px;margin-bottom:14px}
body[data-payloaddiff-export="browser-v4"] .workspace{gap:14px}
body[data-payloaddiff-export="browser-v4"] .pane{border-radius:12px;overflow:clip}
body[data-payloaddiff-export="browser-v4"] .paneHead{padding:12px 13px 10px}
body[data-payloaddiff-export="browser-v4"] .paneHead strong{font-size:15px}
body[data-payloaddiff-export="browser-v4"] .tabs{min-height:48px;padding:7px 10px;align-items:center}
body[data-payloaddiff-export="browser-v4"] .tabs button{padding:5px 10px;font-size:12px}
body[data-payloaddiff-export="browser-v4"] .viewport{height:calc(100vh - 280px);min-height:430px}
body[data-payloaddiff-export="browser-v4"] .status{font-size:12px}
body[data-payloaddiff-export="browser-v4"] .note{padding:14px 2px 4px;margin:0;font-size:11px}
html[data-theme="light"],html[data-theme="light"] body{background:#f3f6fb!important;color:#172033!important}
html[data-theme="light"] .card,html[data-theme="light"] .pane{background:#fff!important;border-color:#cbd5e1!important;box-shadow:0 12px 32px rgba(15,23,42,.08)!important}
html[data-theme="light"] .brand p,html[data-theme="light"] .note,html[data-theme="light"] .paneHead span,html[data-theme="light"] .status{color:#64748b!important}
html[data-theme="light"] .pill{background:#ecfdf5!important;border-color:#a7f3d0!important;color:#047857!important}
html[data-theme="light"] button{background:#fff!important;border-color:#cbd5e1!important;color:#24324a!important}
html[data-theme="light"] button:hover:not(:disabled){background:#f1f5f9!important;border-color:#94a3b8!important}
html[data-theme="light"] .tabs{background:#fff!important;border-color:#d9e1ec!important}
html[data-theme="light"] .tabs button.active{background:#2563eb!important;border-color:#3b82f6!important;color:#fff!important}
html[data-theme="light"] .viewport,html[data-theme="light"] .codeScroll,html[data-theme="light"] .treeScroll,html[data-theme="light"] .codeEditor,html[data-theme="light"] .overlay{background:#fff!important;color:#1e293b!important}
html[data-theme="light"] .gutter{background:#f8fafc!important;border-color:#d6dee9!important}
html[data-theme="light"] .gutterRow{color:#64748b!important}
html[data-theme="light"] .treeRow:hover{background:#f1f5f9!important}
html[data-theme="light"] .treeKey{color:#1d4ed8!important}html[data-theme="light"] .treeValue{color:#64748b!important}html[data-theme="light"] .treeValue.string{color:#047857!important}html[data-theme="light"] .treeValue.number{color:#b45309!important}html[data-theme="light"] .treeValue.boolean{color:#6d28d9!important}
html[data-theme="light"] .band.modified,html[data-theme="light"] .treeRow.modified{background:rgba(245,158,11,.16)!important}html[data-theme="light"] .band.added,html[data-theme="light"] .treeRow.added{background:rgba(34,197,94,.13)!important}html[data-theme="light"] .band.removed,html[data-theme="light"] .treeRow.removed{background:rgba(239,68,68,.13)!important}
html[data-theme="light"] .addedText{color:#15803d!important}html[data-theme="light"] .removedText{color:#dc2626!important}html[data-theme="light"] .modifiedText{color:#b45309!important}
html[data-theme="light"] .codeEditor,html[data-theme="light"] .treeScroll{scrollbar-color:#94a3b8 #eef2f7!important}
@media(max-width:900px){body[data-payloaddiff-export="browser-v4"] .app{padding:12px}body[data-payloaddiff-export="browser-v4"] .viewport{height:55vh;min-height:380px}}
</style>`;
  return String(html).replace('</head>', `${css}\n</head>`);
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
  const kind = snapshot.comparison?.comparisonKind === 'text' ? 'text fallback' : 'structural';
  return String(html)
    .replace(
      '<p id="savedMeta">Portable comparison file</p>',
      `<p id="savedMeta">${escapeHtmlText(snapshot.mode.toUpperCase())} comparison · ${escapeHtmlText(kind)} · ${PORTABLE_EXPORT_VERSION} · ${escapeHtmlText(createdAt)}</p>`,
    )
    .replace('<span id="meta0"></span>', `<span id="meta0">${leftLines.toLocaleString()} lines</span>`)
    .replace('<span id="meta1"></span>', `<span id="meta1">${rightLines.toLocaleString()} lines</span>`)
    .replace('<div id="status" class="status">Ready</div>', '<div id="status" class="status">Loading downloaded comparison…</div>');
}

function addRuntimeErrorReporter(html) {
  const marker = '<script id="payloaddiff-snapshot" type="application/json">';
  const snapshotStart = String(html).indexOf(marker);
  if (snapshotStart < 0) return html;
  const snapshotEnd = String(html).indexOf('</script>', snapshotStart);
  if (snapshotEnd < 0) return html;
  const insertAt = snapshotEnd + '</script>'.length;
  const reporter = `\n<script>window.addEventListener('error',function(event){var status=document.getElementById('status');if(status){status.textContent='Downloaded comparison runtime error: '+(event.message||'unknown error');status.classList.add('error');}});<\/script>`;
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
