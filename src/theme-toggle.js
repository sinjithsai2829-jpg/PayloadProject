const STORAGE_KEY = 'payloaddiff-theme';
const root = document.documentElement;
const modeSwitch = document.querySelector('.mode-switch');

const SUN_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="3.25"/><path d="M10 1.75v2M10 16.25v2M1.75 10h2M16.25 10h2M4.17 4.17l1.42 1.42M14.41 14.41l1.42 1.42M15.83 4.17l-1.42 1.42M5.59 14.41l-1.42 1.42"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M16.2 12.9A7 7 0 0 1 7.1 3.8 7 7 0 1 0 16.2 12.9Z"/></svg>';

installStyles();
const toggle = installToggle();
applyTheme(readTheme(), { persist: false, notify: false });

window.PayloadDiffTheme = {
  get: () => currentTheme(),
  set: (theme, options = {}) => applyTheme(theme, options),
  toggle: () => applyTheme(currentTheme() === 'light' ? 'dark' : 'light'),
};

function installToggle() {
  if (!modeSwitch) return null;

  let cluster = modeSwitch.closest('.topbar-display-controls');
  if (!cluster) {
    cluster = document.createElement('div');
    cluster.className = 'topbar-display-controls';
    modeSwitch.parentNode?.insertBefore(cluster, modeSwitch);
    cluster.appendChild(modeSwitch);
  }

  const button = document.createElement('button');
  button.id = 'themeToggleBtn';
  button.type = 'button';
  button.className = 'theme-toggle-btn';
  button.addEventListener('click', () => {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try {
      window.PayloadDiffDiagnostics?.log?.('info', 'theme.changed', { theme: next });
    } catch (_) {}
  });
  cluster.appendChild(button);
  return button;
}

function readTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (_) {}
  return 'dark';
}

function currentTheme() {
  return root.dataset.theme === 'light' ? 'light' : 'dark';
}

function applyTheme(theme, { persist = true, notify = true } = {}) {
  const next = theme === 'light' ? 'light' : 'dark';
  root.dataset.theme = next;
  root.style.colorScheme = next;
  updateButton(next);

  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
  }

  if (notify) {
    window.dispatchEvent(new CustomEvent('payloaddiff:theme-changed', { detail: { theme: next } }));
  }
  return next;
}

function updateButton(theme) {
  if (!toggle) return;
  const switchTo = theme === 'light' ? 'dark' : 'light';
  toggle.innerHTML = `${switchTo === 'light' ? SUN_ICON : MOON_ICON}<span>${switchTo === 'light' ? 'Light' : 'Dark'}</span>`;
  toggle.title = `Switch to ${switchTo} mode`;
  toggle.setAttribute('aria-label', `Switch to ${switchTo} mode`);
  toggle.setAttribute('aria-pressed', String(theme === 'light'));
  toggle.dataset.theme = theme;
}

function installStyles() {
  if (document.querySelector('#payload-theme-styles')) return;
  const style = document.createElement('style');
  style.id = 'payload-theme-styles';
  style.textContent = `
    .topbar-display-controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex: 0 0 auto;
    }

    .theme-toggle-btn {
      min-width: 82px;
      height: 38px;
      padding: 7px 11px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      white-space: nowrap;
    }

    .theme-toggle-btn svg {
      width: 17px;
      height: 17px;
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    html[data-theme="light"],
    html[data-theme="light"] body {
      background: #f3f6fb !important;
      color: #172033 !important;
    }

    html[data-theme="light"] .card,
    html[data-theme="light"] .pane {
      background: #ffffff !important;
      border-color: #cbd5e1 !important;
      box-shadow: 0 12px 32px rgba(15, 23, 42, .08) !important;
    }

    html[data-theme="light"] .topbar p,
    html[data-theme="light"] footer,
    html[data-theme="light"] .toolbar-right,
    html[data-theme="light"] .file-meta,
    html[data-theme="light"] .search-count,
    html[data-theme="light"] .sync-toggle {
      color: #64748b !important;
    }

    html[data-theme="light"] .privacy-pill {
      background: #ecfdf5 !important;
      border-color: #a7f3d0 !important;
      color: #047857 !important;
    }

    html[data-theme="light"] .mode-switch,
    html[data-theme="light"] .view-tabs {
      background: #f1f5f9 !important;
      border-color: #cbd5e1 !important;
    }

    html[data-theme="light"] button,
    html[data-theme="light"] .upload-btn {
      background: #ffffff !important;
      border-color: #cbd5e1 !important;
      color: #24324a !important;
    }

    html[data-theme="light"] button:hover:not(:disabled),
    html[data-theme="light"] .upload-btn:hover {
      background: #f1f5f9 !important;
      border-color: #94a3b8 !important;
    }

    html[data-theme="light"] button.primary,
    html[data-theme="light"] .mode-btn.active,
    html[data-theme="light"] .view-btn.active {
      background: #2563eb !important;
      border-color: #3b82f6 !important;
      color: #ffffff !important;
    }

    html[data-theme="light"] button.primary:hover:not(:disabled) {
      background: #1d4ed8 !important;
    }

    html[data-theme="light"] .view-tabs button:not(.active) {
      background: transparent !important;
    }

    html[data-theme="light"] .pane-head,
    html[data-theme="light"] .editor-wrap {
      border-color: #d9e1ec !important;
    }

    html[data-theme="light"] .tree-search,
    html[data-theme="light"] .editor,
    html[data-theme="light"] .tree-view,
    html[data-theme="light"] .fold-code-view {
      background: #ffffff !important;
      color: #1e293b !important;
    }

    html[data-theme="light"] .tree-search {
      border-color: #cbd5e1 !important;
    }

    html[data-theme="light"] .tree-search:focus {
      border-color: #60a5fa !important;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, .13) !important;
    }

    html[data-theme="light"] .editor::placeholder,
    html[data-theme="light"] .tree-search::placeholder {
      color: #94a3b8 !important;
    }

    html[data-theme="light"] .tree-row:hover,
    html[data-theme="light"] .fold-code-row:hover {
      background: #f1f5f9 !important;
    }

    html[data-theme="light"] .tree-key { color: #1d4ed8 !important; }
    html[data-theme="light"] .tree-value { color: #64748b !important; }
    html[data-theme="light"] .tree-value.string { color: #047857 !important; }
    html[data-theme="light"] .tree-value.number { color: #b45309 !important; }
    html[data-theme="light"] .tree-value.boolean { color: #6d28d9 !important; }
    html[data-theme="light"] .tree-value.null { color: #64748b !important; }
    html[data-theme="light"] .tree-value.object,
    html[data-theme="light"] .tree-value.array { color: #64748b !important; }
    html[data-theme="light"] .tree-toggle { color: #64748b !important; background: transparent !important; }

    html[data-theme="light"] .editor-line-gutter,
    html[data-theme="light"] .fold-row-gutter {
      background: #f8fafc !important;
      border-color: #d6dee9 !important;
    }

    html[data-theme="light"] .editor-line-number,
    html[data-theme="light"] .fold-row-number {
      color: #64748b !important;
    }

    html[data-theme="light"] .editor-indent-guide,
    html[data-theme="light"] .fold-indent-guide {
      background: rgba(100, 116, 139, .25) !important;
      box-shadow: none !important;
    }

    html[data-theme="light"] .editor-indent-guide.active {
      background: rgba(37, 99, 235, .55) !important;
    }

    html[data-theme="light"] .code-fold-toggle,
    html[data-theme="light"] .fold-row-toggle {
      color: #64748b !important;
      background: transparent !important;
    }

    html[data-theme="light"] .code-fold-toggle:hover,
    html[data-theme="light"] .fold-row-toggle:hover {
      color: #1d4ed8 !important;
      background: #e2e8f0 !important;
    }

    html[data-theme="light"] .fold-code-row.collapsed,
    html[data-theme="light"] .fold-code-row.collapsed .fold-row-gutter {
      background: #eff6ff !important;
    }

    html[data-theme="light"] .fold-code-row.collapsed .fold-row-text {
      color: #475569 !important;
    }

    html[data-theme="light"] .editor-diff-overlay {
      background: #ffffff !important;
    }

    html[data-theme="light"] .editor-diff-band.modified,
    html[data-theme="light"] .fold-code-row.fold-diff-modified,
    html[data-theme="light"] .tree-row.diff-modified {
      background: rgba(245, 158, 11, .16) !important;
    }

    html[data-theme="light"] .editor-diff-band.added,
    html[data-theme="light"] .fold-code-row.fold-diff-added,
    html[data-theme="light"] .tree-row.diff-added {
      background: rgba(34, 197, 94, .13) !important;
    }

    html[data-theme="light"] .editor-diff-band.removed,
    html[data-theme="light"] .fold-code-row.fold-diff-removed,
    html[data-theme="light"] .tree-row.diff-removed {
      background: rgba(239, 68, 68, .13) !important;
    }

    html[data-theme="light"] .tree-row.search-hit {
      background: rgba(59, 130, 246, .12) !important;
      outline-color: #3b82f6 !important;
    }

    html[data-theme="light"] .tree-row.tree-diff-current,
    html[data-theme="light"] .fold-code-row.fold-diff-current,
    html[data-theme="light"] .editor-diff-band.current {
      outline-color: #2563eb !important;
    }

    html[data-theme="light"] .inline-diff-segment.removed { background: rgba(239,68,68,.22) !important; }
    html[data-theme="light"] .inline-diff-segment.added { background: rgba(34,197,94,.20) !important; }
    html[data-theme="light"] .inline-diff-segment.modified { background: rgba(245,158,11,.22) !important; }

    html[data-theme="light"] .syntax-error-line {
      background: rgba(239, 68, 68, .09) !important;
    }

    html[data-theme="light"] .syntax-error-rail {
      background: rgba(226, 232, 240, .72) !important;
    }

    html[data-theme="light"] #statusText.error { color: #dc2626 !important; }

    html[data-theme="light"] .compare-bar .added { color: #15803d !important; }
    html[data-theme="light"] .compare-bar .removed { color: #dc2626 !important; }
    html[data-theme="light"] .compare-bar .modified,
    html[data-theme="light"] .compare-bar .warn { color: #b45309 !important; }
    html[data-theme="light"] .compare-bar .same { color: #15803d !important; }

    html[data-theme="light"] .fold-code-view,
    html[data-theme="light"] .editor,
    html[data-theme="light"] .tree-view {
      scrollbar-color: #94a3b8 #eef2f7 !important;
    }

    html[data-theme="light"] .fold-code-view::-webkit-scrollbar-track,
    html[data-theme="light"] .editor::-webkit-scrollbar-track,
    html[data-theme="light"] .tree-view::-webkit-scrollbar-track {
      background: #eef2f7 !important;
      border-color: #dbe3ee !important;
    }

    html[data-theme="light"] .fold-code-view::-webkit-scrollbar-thumb,
    html[data-theme="light"] .editor::-webkit-scrollbar-thumb,
    html[data-theme="light"] .tree-view::-webkit-scrollbar-thumb {
      background: #94a3b8 !important;
      border-color: #eef2f7 !important;
    }

    html[data-theme="light"] .theme-toggle-btn {
      background: #ffffff !important;
      border-color: #cbd5e1 !important;
      color: #334155 !important;
    }

    @media (max-width: 900px) {
      .topbar-display-controls {
        width: 100%;
        justify-content: flex-start;
      }
    }
  `;
  document.head.appendChild(style);
}
