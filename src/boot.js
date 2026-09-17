import './main.js';
import './huge-select-all-guard.js';
import './ui-labels.js';
import './theme-toggle.js';
import './view-surface-coordinator.js';
import './payload-auto-detect.js';
import './payload-action-mode-guard.js';
import './paste-buttons.js';
import './enhancements.js';
import './word-wrap.js';
// The custom Smart Wrap projection is intentionally not booted in production.
// Native textarea wrapping stays responsive for multi-megabyte JSON/XML payloads,
// while the projection could create thousands of DOM nodes for one huge line.
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
import './aligned-fold-bridge.js';
import './tree-diff-navigation.js';
import './diagnostics.js';
// Correlated deep tracing remains available as a source module/test utility but
// is not loaded by default because repeated full-payload fingerprints and DOM
// snapshots can stall the UI when payloads are several megabytes.
import './panel-names.js';
import './persistence.js';
import './diff-visibility.js';
import './editable-code-surface.js';
import './scrollbar-visibility.js';
import './editor-scroll-geometry.js';
import './saved-comparisons.js';
import './editor-syntax-markers.js';
import './theme-diagnostics-contrast.js';
import './text-fallback-ui.js';
import './xml-tree-ui.js';
