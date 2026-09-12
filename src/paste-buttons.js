const panes = [...document.querySelectorAll('.pane')];
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const statusText = document.querySelector('#statusText');

for (let index = 0; index < panes.length; index += 1) {
  installPasteButton(index);
}

function installPasteButton(index) {
  const pane = panes[index];
  const actions = pane?.querySelector('.pane-actions');
  const editor = editors[index];
  if (!actions || !editor || actions.querySelector('.paste-btn')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'paste-btn';
  button.dataset.pane = String(index);
  button.textContent = 'Paste';
  button.title = 'Paste clipboard content into this panel';
  button.setAttribute('aria-label', `Paste clipboard content into File ${index + 1}`);

  // Keep the two clipboard actions together for faster developer workflows:
  // Paste · Copy · Upload. Upload remains available, but no longer separates
  // the two clipboard actions visually.
  const copy = actions.querySelector('.copy-btn');
  const upload = actions.querySelector('.upload-btn');
  if (copy) actions.insertBefore(button, copy);
  else actions.prepend(button);
  if (upload) actions.appendChild(upload);

  button.addEventListener('click', () => pasteIntoPane(index, button));
}

async function pasteIntoPane(index, button) {
  const editor = editors[index];
  if (!editor) return;

  if (!navigator.clipboard?.readText) {
    setStatus('Clipboard access is unavailable in this browser. Click the editor and use Cmd/Ctrl+V.', true);
    return;
  }

  const previousLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Pasting…';

  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      setStatus('Clipboard is empty.', true);
      return;
    }

    // A panel-level Paste action replaces the payload rather than inserting at
    // the current caret position. Return to Code view first so the new payload
    // is immediately visible even if the user was browsing Tree view.
    const codeButton = panes[index]?.querySelector('.view-btn[data-view="code"]');
    if (codeButton && !codeButton.classList.contains('active')) codeButton.click();

    const fileInput = panes[index]?.querySelector('.file-input');
    if (fileInput) fileInput.value = '';

    editor.value = text;
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    const detected = window.PayloadDiffAutoDetect?.apply?.(text, {
      source: 'paste-button',
      paneIndex: index,
    });

    const mode = detected?.mode?.toUpperCase?.();
    const panelName = window.PayloadDiffPanelNames?.get?.()?.[index] || `File ${index + 1}`;
    setStatus(mode ? `${mode} pasted into ${panelName}.` : `Clipboard pasted into ${panelName}.`);

    try {
      window.PayloadDiffDiagnostics?.log?.('info', 'clipboard.pasted', {
        pane: index + 1,
        chars: text.length,
        detectedMode: detected?.mode || null,
        confidence: detected?.confidence ?? null,
      });
    } catch (_) {}
  } catch (error) {
    const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
    setStatus(
      denied
        ? 'Clipboard permission was blocked. Click the editor and use Cmd/Ctrl+V, or allow clipboard access for this site.'
        : `Unable to read the clipboard: ${error?.message || 'Unknown clipboard error.'}`,
      true,
    );
    try {
      window.PayloadDiffDiagnostics?.log?.('error', 'clipboard.paste.failed', {
        pane: index + 1,
        name: error?.name || 'Error',
        message: error?.message || String(error),
      });
    } catch (_) {}
  } finally {
    button.disabled = false;
    button.textContent = previousLabel;
  }
}

function setStatus(message, error = false) {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle('error', error);
}
