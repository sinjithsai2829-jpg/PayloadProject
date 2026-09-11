const panes = [...document.querySelectorAll('.pane')];
const DEFAULT_NAMES = ['File 1', 'File 2'];
const MAX_NAME_LENGTH = 80;
const headings = panes.map((pane, index) => installEditableHeading(pane, index));

window.PayloadDiffPanelNames = {
  get: () => headings.map((heading, index) => normalizeName(heading?.textContent, index)),
  set: (names, { notify = true } = {}) => setNames(names, notify),
  defaults: () => [...DEFAULT_NAMES],
};

function installEditableHeading(pane, index) {
  const heading = pane?.querySelector('.pane-head h2');
  if (!heading) return null;

  heading.classList.add('panel-name');
  heading.contentEditable = 'true';
  heading.spellcheck = false;
  heading.setAttribute('role', 'textbox');
  heading.setAttribute('aria-label', `Rename ${DEFAULT_NAMES[index]}`);
  heading.setAttribute('title', 'Click to rename this panel');
  heading.dataset.defaultName = DEFAULT_NAMES[index];
  heading.dataset.lastValidName = normalizeName(heading.textContent, index);

  heading.addEventListener('focus', () => {
    heading.dataset.lastValidName = normalizeName(heading.textContent, index);
    requestAnimationFrame(() => selectHeadingText(heading));
  });

  heading.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      heading.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      heading.textContent = heading.dataset.lastValidName || DEFAULT_NAMES[index];
      heading.blur();
    }
  });

  heading.addEventListener('beforeinput', (event) => {
    if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') event.preventDefault();
  });

  heading.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData?.getData('text/plain') || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
    document.execCommand?.('insertText', false, text);
  });

  heading.addEventListener('input', () => {
    const plain = String(heading.textContent || '').replace(/[\r\n]+/g, ' ');
    if (plain.length > MAX_NAME_LENGTH) heading.textContent = plain.slice(0, MAX_NAME_LENGTH);
  });

  heading.addEventListener('blur', () => commitName(index, heading));
  return heading;
}

function commitName(index, heading) {
  const previous = heading.dataset.lastValidName || DEFAULT_NAMES[index];
  const next = normalizeName(heading.textContent, index);
  heading.textContent = next;
  heading.dataset.lastValidName = next;
  if (next === previous) return;

  window.dispatchEvent(new CustomEvent('payloaddiff:panel-name-changed', {
    detail: { paneIndex: index, name: next, names: getNames() },
  }));
  try { window.PayloadDiffDiagnostics?.log('info', 'panel.renamed', { pane: index + 1, name: next }); } catch (_) {}
}

function setNames(names, notify) {
  const source = Array.isArray(names) ? names : [];
  headings.forEach((heading, index) => {
    if (!heading) return;
    const next = normalizeName(source[index], index);
    heading.textContent = next;
    heading.dataset.lastValidName = next;
  });
  if (notify) {
    window.dispatchEvent(new CustomEvent('payloaddiff:panel-names-restored', { detail: { names: getNames() } }));
  }
}

function getNames() {
  return headings.map((heading, index) => normalizeName(heading?.textContent, index));
}

function normalizeName(value, index) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return text || DEFAULT_NAMES[index] || `File ${index + 1}`;
}

function selectHeadingText(heading) {
  const selection = window.getSelection?.();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(heading);
  selection.removeAllRanges();
  selection.addRange(range);
}

const style = document.createElement('style');
style.id = 'panel-name-styles';
style.textContent = `
  .panel-name {
    display: inline-block;
    max-width: min(420px, 42vw);
    min-width: 46px;
    margin: 0;
    padding: 2px 5px;
    border: 1px solid transparent;
    border-radius: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: middle;
    cursor: text;
  }
  .panel-name:hover { border-color: #33415f; background: rgba(255,255,255,.025); }
  .panel-name:focus {
    outline: none;
    overflow: visible;
    text-overflow: clip;
    border-color: #5c83c7;
    background: #0b1221;
    box-shadow: 0 0 0 2px rgba(96,165,250,.14);
  }
`;
document.head.appendChild(style);
