const DB_NAME = 'payloaddiff-session-v1';
const STORE_NAME = 'sessions';
const TAB_SESSION_KEY = 'payloaddiff:tab-session:v1';
const SAVE_DEBOUNCE_MS = 500;
const IDLE_SAVE_TIMEOUT_MS = 1800;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const clearBtn = document.querySelector('#clearBtn');
const formatBtn = document.querySelector('#formatBtn');
const compareBtn = document.querySelector('#compareBtn');
const sessionId = getTabSessionId();

let dbPromise = null;
let saveTimer = 0;
let idleHandle = 0;
let restoring = false;
let cleared = false;
let revision = 0;
let savedRevision = 0;
let saveInFlight = false;

restoreSession().catch((error) => log('warn', 'persistence.restore.failed', { error }));
pruneStaleSessions().catch(() => {});
installPersistenceListeners();

function installPersistenceListeners() {
  editors.forEach((editor) => {
    editor?.addEventListener('input', () => markDirty());
  });

  document.querySelectorAll('.file-input').forEach((input) => {
    input.addEventListener('change', () => requestAnimationFrame(() => markDirty(0)));
  });

  document.querySelectorAll('.mode-btn').forEach((button) => {
    button.addEventListener('click', () => requestAnimationFrame(() => markDirty(0)));
  });

  document.querySelectorAll('.view-tabs').forEach((tabs) => {
    tabs.addEventListener('click', (event) => {
      if (!event.target.closest('.view-btn')) return;
      requestAnimationFrame(() => markDirty(0));
    });
  });

  document.querySelector('.enhancement-sync input[type="checkbox"]')?.addEventListener('change', () => markDirty(0));
  window.addEventListener('payloaddiff:panel-name-changed', () => markDirty(0));
  window.addEventListener('payloaddiff:fold-state-changed', () => markDirty(0));

  formatBtn?.addEventListener('click', () => saveWhenOperationFinishes(), true);
  compareBtn?.addEventListener('click', () => saveWhenOperationFinishes(), true);

  clearBtn?.addEventListener('click', () => {
    cleared = true;
    revision = 0;
    savedRevision = 0;
    cancelScheduledSave();
    deleteCurrentSession().catch((error) => log('warn', 'persistence.clear.failed', { error }));
  });

  addEventListener('pagehide', () => {
    if (!cleared) saveNow({ force: true }).catch(() => {});
  });
}

function markDirty(delay = SAVE_DEBOUNCE_MS) {
  if (restoring) return;
  cleared = false;
  revision += 1;
  scheduleSave(delay);
}

function scheduleSave(delay = SAVE_DEBOUNCE_MS) {
  if (restoring || cleared) return;
  clearTimeout(saveTimer);
  cancelIdleSave();
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    scheduleIdleSave();
  }, Math.max(0, delay));
}

function scheduleIdleSave() {
  if (restoring || cleared || savedRevision === revision) return;
  if (typeof requestIdleCallback === 'function') {
    idleHandle = requestIdleCallback(() => {
      idleHandle = 0;
      saveNow().catch((error) => log('warn', 'persistence.save.failed', { error }));
    }, { timeout: IDLE_SAVE_TIMEOUT_MS });
    return;
  }

  idleHandle = setTimeout(() => {
    idleHandle = 0;
    saveNow().catch((error) => log('warn', 'persistence.save.failed', { error }));
  }, 60);
}

function cancelScheduledSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  cancelIdleSave();
}

function cancelIdleSave() {
  if (!idleHandle) return;
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleHandle);
  else clearTimeout(idleHandle);
  idleHandle = 0;
}

async function saveNow({ force = false } = {}) {
  if (restoring || cleared) return;
  if (!force && savedRevision === revision) return;
  if (saveInFlight && !force) {
    scheduleSave(100);
    return;
  }

  const revisionAtCapture = revision;
  const record = captureState();
  saveInFlight = true;
  try {
    const db = await openDb();
    await requestToPromise(transactionStore(db, 'readwrite').put(record));
    if (revision === revisionAtCapture) savedRevision = revisionAtCapture;
    log('debug', 'persistence.saved', {
      chars: record.panes.map((pane) => pane.text.length),
      panelNames: record.panelNames,
      mode: record.mode,
      foldedRanges: record.foldedRanges,
      revision: revisionAtCapture,
    });
  } finally {
    saveInFlight = false;
    if (!cleared && revision !== revisionAtCapture) scheduleSave(100);
  }
}

async function restoreSession() {
  restoring = true;
  try {
    const db = await openDb();
    const record = await requestToPromise(transactionStore(db, 'readonly').get(sessionId));
    if (!record) return;

    const modeButton = document.querySelector(`.mode-btn[data-mode="${record.mode}"]`);
    if (modeButton && !modeButton.classList.contains('active')) modeButton.click();

    window.PayloadDiffPanelNames?.set?.(record.panelNames || ['File 1', 'File 2'], { notify: false });

    for (let index = 0; index < editors.length; index += 1) {
      const editor = editors[index];
      const saved = record.panes?.[index];
      if (!editor || !saved) continue;
      editor.value = saved.text || '';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    requestAnimationFrame(() => {
      window.PayloadDiffCodeFolding?.setState?.(record.foldedRanges || [[], []], { notify: false });

      for (let index = 0; index < panes.length; index += 1) {
        const saved = record.panes?.[index];
        if (!saved) continue;
        const viewButton = panes[index].querySelector(`.view-btn[data-view="${saved.view === 'tree' ? 'tree' : 'code'}"]`);
        if (viewButton && !viewButton.classList.contains('active')) viewButton.click();
      }

      const syncInput = document.querySelector('.enhancement-sync input[type="checkbox"]');
      if (syncInput && typeof record.syncEnabled === 'boolean' && syncInput.checked !== record.syncEnabled) {
        syncInput.checked = record.syncEnabled;
        syncInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      requestAnimationFrame(() => restoreScrollPositions(record));
    });

    revision = 0;
    savedRevision = 0;
    log('info', 'persistence.restored', {
      chars: record.panes?.map((pane) => pane.text?.length || 0) || [],
      panelNames: record.panelNames || ['File 1', 'File 2'],
      mode: record.mode,
      foldedRanges: record.foldedRanges || [[], []],
      ageMs: Math.max(0, Date.now() - (record.updatedAt || Date.now())),
    });
  } finally {
    restoring = false;
  }
}

function captureState() {
  return {
    id: sessionId,
    updatedAt: Date.now(),
    mode: document.querySelector('.mode-btn.active')?.dataset.mode || 'json',
    panelNames: window.PayloadDiffPanelNames?.get?.() || ['File 1', 'File 2'],
    syncEnabled: document.querySelector('.enhancement-sync input[type="checkbox"]')?.checked ?? true,
    foldedRanges: window.PayloadDiffCodeFolding?.getState?.() || [[], []],
    panes: editors.map((editor, index) => {
      const scroller = visibleScroller(index) || editor;
      return {
        text: editor?.value || '',
        view: panes[index]?.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active') ? 'tree' : 'code',
        scrollTop: Math.round(scroller?.scrollTop || 0),
        scrollLeft: Math.round(scroller?.scrollLeft || 0),
      };
    }),
  };
}

function restoreScrollPositions(record) {
  for (let index = 0; index < panes.length; index += 1) {
    const saved = record.panes?.[index];
    const scroller = visibleScroller(index);
    if (!saved || !scroller) continue;
    scroller.scrollTop = saved.scrollTop || 0;
    scroller.scrollLeft = saved.scrollLeft || 0;
  }
}

function visibleScroller(index) {
  const pane = panes[index];
  if (!pane) return null;
  return [pane.querySelector('.tree-view'), pane.querySelector('.fold-code-view'), pane.querySelector('.editor')]
    .find((element) => element && !element.classList.contains('hidden') && element.offsetParent !== null) || null;
}

function saveWhenOperationFinishes() {
  const started = performance.now();
  let sawBusy = document.body.classList.contains('busy');
  const poll = () => {
    sawBusy ||= document.body.classList.contains('busy');
    if ((sawBusy && !document.body.classList.contains('busy')) || performance.now() - started > 30000) {
      markDirty(0);
      return;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

async function deleteCurrentSession() {
  const db = await openDb();
  await requestToPromise(transactionStore(db, 'readwrite').delete(sessionId));
  log('info', 'persistence.cleared', {});
}

async function pruneStaleSessions() {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('updatedAt');
  const cutoff = Date.now() - STALE_AFTER_MS;
  const range = IDBKeyRange.upperBound(cutoff);

  await new Promise((resolve, reject) => {
    const request = index.openCursor(range);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      if (cursor.primaryKey !== sessionId) cursor.delete();
      cursor.continue();
    };
  });
}

function getTabSessionId() {
  try {
    let id = sessionStorage.getItem(TAB_SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(TAB_SESSION_KEY, id);
    }
    return id;
  } catch {
    return `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    };
    request.onsuccess = () => resolve(request.result);
  });
  return dbPromise;
}

function transactionStore(db, mode) {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function log(level, type, data) {
  try { window.PayloadDiffDiagnostics?.log(level, type, data); } catch (_) {}
}
