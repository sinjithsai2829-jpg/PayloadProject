import {
  createPortableComparisonHtml as createLegacyPortableComparisonHtml,
  parsePortableComparisonHtml,
  portableComparisonDownloadName,
} from './portable-comparison-html.js';

export { parsePortableComparisonHtml, portableComparisonDownloadName };

// The portable viewer is generated from a template literal. JavaScript escape
// sequences such as '\n' inside that template can become literal newlines in
// the generated inline <script>, which makes the downloaded HTML fail before
// any restore code runs. Repair those emitted string literals before download.
export function createPortableComparisonHtml(snapshot) {
  const html = createLegacyPortableComparisonHtml(snapshot);
  return repairInlineRuntimeEscapes(html);
}

export function repairInlineRuntimeEscapes(html) {
  return String(html)
    .split("split('\n')")
    .join("split('\\n')");
}

export function extractPortableRuntimeScript(html) {
  const scripts = [...String(html).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  // The first script is application/json snapshot data. The last script is the
  // executable self-contained viewer runtime.
  if (scripts.length < 2) throw new Error('Portable comparison runtime script was not found.');
  return scripts[scripts.length - 1][1];
}
