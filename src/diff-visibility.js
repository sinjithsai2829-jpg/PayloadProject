const style = document.createElement('style');
style.id = 'diff-visibility-styles';
style.textContent = `
  /* Stronger Code-view diff visibility on dark backgrounds. */
  .editor-diff-band {
    border-left-width: 6px !important;
    box-shadow: inset 10px 0 18px rgba(0,0,0,.12);
  }

  .editor-diff-band.added {
    background: rgba(34, 197, 94, .30) !important;
    border-left-color: #4ade80 !important;
  }

  .editor-diff-band.removed {
    background: rgba(239, 68, 68, .30) !important;
    border-left-color: #fb7185 !important;
  }

  .editor-diff-band.modified {
    background: rgba(245, 158, 11, .30) !important;
    border-left-color: #fbbf24 !important;
  }

  .editor-diff-band.current {
    outline: 2px solid #60a5fa !important;
    outline-offset: -2px !important;
    box-shadow: inset 10px 0 18px rgba(0,0,0,.10), 0 0 0 1px rgba(96,165,250,.35);
  }

  /* Match the stronger treatment in Tree view too. */
  .tree-row.diff-added {
    background: rgba(34, 197, 94, .26) !important;
    border-left: 5px solid #4ade80 !important;
  }

  .tree-row.diff-removed {
    background: rgba(239, 68, 68, .26) !important;
    border-left: 5px solid #fb7185 !important;
  }

  .tree-row.diff-modified {
    background: rgba(245, 158, 11, .27) !important;
    border-left: 5px solid #fbbf24 !important;
  }

  /* Small legend chips make the meaning immediately obvious. */
  .diff-legend {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-left: 10px;
    color: #94a3b8;
    font-size: 11px;
    white-space: nowrap;
  }

  .diff-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .diff-legend-swatch {
    width: 11px;
    height: 11px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,.25);
  }

  .diff-legend-swatch.added { background: rgba(34,197,94,.70); }
  .diff-legend-swatch.removed { background: rgba(239,68,68,.70); }
  .diff-legend-swatch.modified { background: rgba(245,158,11,.75); }
`;
document.head.appendChild(style);

const summary = document.querySelector('#compareSummary');
if (summary && !document.querySelector('.diff-legend')) {
  const legend = document.createElement('span');
  legend.className = 'diff-legend';
  legend.innerHTML = `
    <span class="diff-legend-item"><span class="diff-legend-swatch added"></span>Added</span>
    <span class="diff-legend-item"><span class="diff-legend-swatch removed"></span>Removed</span>
    <span class="diff-legend-item"><span class="diff-legend-swatch modified"></span>Modified</span>
  `;
  summary.insertAdjacentElement('afterend', legend);
}
