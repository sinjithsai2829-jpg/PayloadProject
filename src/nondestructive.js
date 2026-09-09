const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const formatBtn = document.querySelector('#formatBtn');
const compareBtn = document.querySelector('#compareBtn');

function snapshotEditors() {
  return editors.map((editor) => ({
    value: editor.value,
    selectionStart: editor.selectionStart,
    selectionEnd: editor.selectionEnd,
    scrollTop: editor.scrollTop,
    scrollLeft: editor.scrollLeft,
  }));
}

function restoreEditors(snapshot) {
  snapshot.forEach((saved, index) => {
    const editor = editors[index];
    if (!editor || editor.value === saved.value) return;
    editor.value = saved.value;
    editor.scrollTop = saved.scrollTop;
    editor.scrollLeft = saved.scrollLeft;
    try {
      editor.setSelectionRange(saved.selectionStart, saved.selectionEnd);
    } catch (_) {}
  });
}

function restoreAfterBusyCycle(snapshot) {
  let sawBusy = document.body.classList.contains('busy');

  const check = () => {
    sawBusy ||= document.body.classList.contains('busy');
    if (sawBusy && !document.body.classList.contains('busy')) {
      // enhancements.js captures the formatted working view first. Restoring on
      // the next frame keeps the user's pasted/uploaded source untouched.
      requestAnimationFrame(() => restoreEditors(snapshot));
      return;
    }
    requestAnimationFrame(check);
  };

  requestAnimationFrame(check);
}

function preserveOriginalInput() {
  const snapshot = snapshotEditors();
  restoreAfterBusyCycle(snapshot);
}

// These listeners are registered after main.js and enhancements.js. The main
// comparison engine may build a formatted working representation internally,
// but the source text the user pasted or uploaded is restored after the task.
formatBtn?.addEventListener('click', preserveOriginalInput, true);
compareBtn?.addEventListener('click', preserveOriginalInput, true);
