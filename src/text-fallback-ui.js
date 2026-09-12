const panes = [...document.querySelectorAll('.pane')];
const compareBtn = document.querySelector('#compareBtn');
const compareBar = document.querySelector('#compareBar');
const statusText = document.querySelector('#statusText');

let fallbackActive = false;
let lastMode = null;

window.addEventListener('payloaddiff:live-compare-updated', (event) => {
  const detail = event.detail || {};
  const diffs = Array.isArray(detail.diffs) ? detail.diffs : [];
  const textPaths = diffs.some((diff) => typeof diff?.path === 'string' && diff.path.startsWith('$text['));
  const hasSyntaxIssues = totalSyntaxIssues() > 0;

  // A non-empty text diff is explicit evidence. For identical malformed text,
  // the diff array is empty, so syntax diagnostics provide the fallback signal.
  fallbackActive = textPaths || (hasSyntaxIssues && comparisonVisible());
  lastMode = detail.mode || currentMode();

  if (!fallbackActive) return;
  forceCodeViews();
  setFallbackStatus();
});

window.addEventListener('payloaddiff:syntax-issues-updated', () => {
  if (!comparisonVisible()) return;
  const malformed = totalSyntaxIssues() > 0;
  if (!malformed) {
    fallbackActive = false;
    return;
  }

  requestAnimationFrame(() => {
    if (!comparisonVisible() || totalSyntaxIssues() === 0) return;
    fallbackActive = true;
    lastMode = currentMode();
    forceCodeViews();
    setFallbackStatus();
  });
});

compareBtn?.addEventListener('click', () => {
  fallbackActive = false;
  // Validate independently of structural comparison so even two identical
  // malformed payloads are recognized as text-fallback mode.
  Promise.resolve(window.PayloadDiffSyntaxIssues?.refresh?.()).catch(() => {});

  for (const delay of [120, 450]) {
    window.setTimeout(() => {
      if (!comparisonVisible() || totalSyntaxIssues() === 0) return;
      fallbackActive = true;
      lastMode = currentMode();
      forceCodeViews();
      setFallbackStatus();
    }, delay);
  }
}, true);

for (const pane of panes) {
  pane.querySelector('.view-btn[data-view="tree"]')?.addEventListener('click', (event) => {
    if (!fallbackActive || !comparisonVisible()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setFallbackStatus('Tree view requires structurally valid data. Text comparison remains available in Code view.');
  }, true);
}

window.addEventListener('payloaddiff:comparison-reset', () => {
  fallbackActive = false;
  lastMode = null;
});

function forceCodeViews() {
  for (const pane of panes) {
    const code = pane.querySelector('.view-btn[data-view="code"]');
    if (code && !code.classList.contains('active')) code.click();
  }
}

function totalSyntaxIssues() {
  return panes.reduce((total, _, index) => total + (window.PayloadDiffSyntaxIssues?.getIssues?.(index)?.length || 0), 0);
}

function comparisonVisible() {
  return !!compareBar && !compareBar.classList.contains('hidden');
}

function currentMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode === 'xml' ? 'xml' : 'json';
}

function setFallbackStatus(message = '') {
  if (!statusText) return;
  const mode = (lastMode || currentMode()).toUpperCase();
  statusText.textContent = message || `${mode} has syntax issues — comparing as text instead. Structural Tree view is disabled until the payload is valid.`;
  statusText.classList.remove('error');
  try {
    window.PayloadDiffDiagnostics?.log?.('info', 'comparison.text-fallback', {
      mode: lastMode || currentMode(),
      syntaxIssues: totalSyntaxIssues(),
    });
  } catch (_) {}
}
