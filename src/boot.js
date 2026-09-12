import './main.js';
import './ui-labels.js';
import './theme-toggle.js';
import './view-surface-coordinator.js';
import './payload-auto-detect.js';
import './payload-action-mode-guard.js';
import './paste-buttons.js';
import './enhancements.js';
import './panel-names.js';
import './persistence.js';

// Huge payloads get a protected, viewport-virtualized path before legacy editor
// enhancements are registered. The canonical text remains local in the hidden
// editor, but only visible rows/columns are painted and heavy input listeners
// are blocked once large mode is active.
import './large-payload-view.js';
import './large-payload-controller.js';
import './large-payload-performance-guard.js';
import './large-payload-diff-overlay.js';

import './word-wrap.js';
// The custom Smart Wrap projection is intentionally not booted in production.
// Native textarea wrapping stays available for ordinary JSON/XML payloads;
// virtual large-payload mode owns rendering when the source is huge.
import './wrap-indent-guide-guard.js';
import './editable-default.js';
import './sync-scroll.js';
import './diff-nav-ui.js';
import './compare-options-ui.js';
import './compare-options-worker-bridge.js';
import './compare-input-guard.js';
import './editable-compare.js';
import './aligned-compare-view.js';
import './compare-options-enhancements.js';
import './aligned-compare-surface-guard.js';
import './compare-surface-guard.js';
import './inline-diff-highlights.js';
import './code-folding.js';
import './tree-diff-navigation.js';
import './diagnostics.js';
// Correlated deep tracing remains available as an explicit debugging module but
// is not loaded by default because full-payload fingerprints and DOM snapshots
// are inappropriate on the production hot path for multi-megabyte documents.
import './diff-visibility.js';
import './editable-code-surface.js';
import './scrollbar-visibility.js';
import './saved-comparisons.js';
import './editor-syntax-markers.js';
import './theme-diagnostics-contrast.js';
import './text-fallback-ui.js';
import './xml-tree-ui.js';
