const style = document.createElement('style');
style.id = 'theme-diagnostics-contrast-styles';
style.textContent = `
  /* Light theme must keep diagnostics visually stronger than ordinary controls.
     The generic light-theme button rule otherwise washes out rail markers. */
  html[data-theme="light"] .syntax-issue-count {
    background: #fee2e2 !important;
    border-color: #ef4444 !important;
    color: #991b1b !important;
    font-size: 11px !important;
    font-weight: 800 !important;
    line-height: 1.2;
    padding: 3px 8px !important;
    box-shadow: 0 0 0 1px rgba(220, 38, 38, .08), 0 1px 2px rgba(127, 29, 29, .08);
  }

  html[data-theme="light"] .syntax-error-rail {
    background: rgba(241, 245, 249, .94) !important;
    border-left: 1px solid rgba(148, 163, 184, .38);
  }

  html[data-theme="light"] .syntax-error-marker,
  html[data-theme="light"] button.syntax-error-marker {
    background: #dc2626 !important;
    border: 0 !important;
    box-shadow: 0 0 0 1px #991b1b, 0 0 4px rgba(220, 38, 38, .42) !important;
  }

  html[data-theme="light"] .syntax-error-marker:hover,
  html[data-theme="light"] button.syntax-error-marker:hover:not(:disabled) {
    background: #b91c1c !important;
    border-color: transparent !important;
  }

  html[data-theme="light"] .syntax-error-line {
    background: rgba(239, 68, 68, .12) !important;
    border-left-color: #dc2626 !important;
    box-shadow: inset 0 -1px 0 rgba(220, 38, 38, .22) !important;
  }

  html[data-theme="light"] .has-syntax-errors .editor-line-gutter {
    border-right-color: rgba(220, 38, 38, .52) !important;
  }
`;
document.head.appendChild(style);
