import { compareFormattedCode } from './formatted-code-compare.js';

// Keep this compatibility wrapper for callers/tests that still import the XML
// comparator directly. The actual Code-view algorithm is now shared by JSON and
// XML so both formats align inserted/removed lines and pair nearby replacements
// the same way.
export function compareFormattedXml(leftFormatted, rightFormatted, options = {}) {
  return compareFormattedCode('xml', leftFormatted, rightFormatted, options);
}
