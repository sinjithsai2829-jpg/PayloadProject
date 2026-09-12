import { DEFAULT_COMPARE_OPTIONS, normalizeCompareOptions } from './compare-normalization.js';

const STORAGE_KEY = 'payloaddiff:compare-options:v1';
const toolbar = document.querySelector('.toolbar-left');
let options = readOptions();

install();

window.PayloadDiffCompareOptions = {
  get: () => ({ ...options }),
  set: (value, { notify = true, persist = true } = {}) => {
    options = normalizeCompareOptions(value);
    if (persist) saveOptions();
    syncInputs();
    if (notify) publish('api');
    return { ...options };
  },
  defaults: () => ({ ...DEFAULT_COMPARE_OPTIONS }),
};

function install() {
  if (!toolbar || document.querySelector('#compareOptions')) return;

  const details = document.createElement('details');
  details.id = 'compareOptions';
  details.className = 'compare-options';
  details.innerHTML = `
    <summary title="Comparison options">Compare options</summary>
    <div class="compare-options-menu" role="group" aria-label="Comparison options">
      <label><input type="checkbox" data-option="detectMoves"> Detect moved lines</label>
      <label><input type="checkbox" data-option="ignoreWhitespace"> Ignore whitespace</label>
      <label><input type="checkbox" data-option="ignoreCase"> Ignore case</label>
      <label><input type="checkbox" data-option="groupNearbyDiffs"> Group nearby differences</label>
    </div>
  `;
  toolbar.appendChild(details);

  details.querySelectorAll('input[data-option]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.option;
      options = normalizeCompareOptions({ ...options, [key]: input.checked });
      saveOptions();
      publish('user');
    });
  });
  syncInputs();
  installStyles();
}

function syncInputs() {
  document.querySelectorAll('#compareOptions input[data-option]').forEach((input) => {
    input.checked = !!options[input.dataset.option];
  });
}

function publish(source) {
  window.dispatchEvent(new CustomEvent('payloaddiff:compare-options-changed', {
    detail: { options: { ...options }, source },
  }));
  try { window.PayloadDiffDiagnostics?.log?.('info', 'compare-options.changed', { options: { ...options }, source }); } catch (_) {}
}

function readOptions() {
  try {
    return normalizeCompareOptions(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return { ...DEFAULT_COMPARE_OPTIONS };
  }
}

function saveOptions() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(options)); } catch (_) {}
}

function installStyles() {
  if (document.querySelector('#compare-options-styles')) return;
  const style = document.createElement('style');
  style.id = 'compare-options-styles';
  style.textContent = `
    .compare-options { position: relative; }
    .compare-options > summary {
      list-style: none;
      border: 1px solid #33415f;
      background: #172139;
      border-radius: 7px;
      padding: 8px 12px;
      cursor: pointer;
      font-weight: 650;
      font-size: 13px;
      user-select: none;
    }
    .compare-options > summary::-webkit-details-marker { display: none; }
    .compare-options[open] > summary { border-color: #62708f; background: #202c47; }
    .compare-options-menu {
      position: absolute;
      z-index: 50;
      top: calc(100% + 6px);
      left: 0;
      width: 235px;
      padding: 9px;
      display: grid;
      gap: 8px;
      background: #10182b;
      border: 1px solid #33415f;
      border-radius: 9px;
      box-shadow: 0 16px 38px rgba(0,0,0,.28);
    }
    .compare-options-menu label { display:flex; align-items:center; gap:8px; font-size:12px; white-space:nowrap; cursor:pointer; }
    .compare-options-menu input { accent-color:#4479ef; }
    html[data-theme="light"] .compare-options > summary,
    html[data-theme="light"] .compare-options-menu { background:#fff; border-color:#cbd5e1; color:#24324a; }
    html[data-theme="light"] .compare-options[open] > summary { background:#f1f5f9; }
  `;
  document.head.appendChild(style);
}
