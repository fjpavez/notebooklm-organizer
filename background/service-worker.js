/* background/service-worker.js */
'use strict';

const MSG = {
  NOTEBOOKS_UPDATED:       'NOTEBOOKS_UPDATED',
  ACTIVE_NOTEBOOK_CHANGED: 'ACTIVE_NOTEBOOK_CHANGED',
  GET_STATE:               'GET_STATE',
  OPEN_NOTEBOOK:           'OPEN_NOTEBOOK',
  RESCAN:                  'RESCAN',
  TOGGLE_FAVORITE:         'TOGGLE_FAVORITE',
  TREE_UPDATED:            'TREE_UPDATED',
  STATE_RESPONSE:          'STATE_RESPONSE',
  ACTIVE_UPDATED:          'ACTIVE_UPDATED',
  FAVORITES_UPDATED:       'FAVORITES_UPDATED'
};

const STORAGE_KEY       = 'nlm_state';
const STORAGE_FAVORITES = 'nlm_favorites';
const STORAGE_RECENTS   = 'nlm_recents';
const MAX_RECENTS       = 10;
const UNLABELED_FOLDER  = 'Sin etiquetar';

// ── Estado en memoria ──────────────────────────────────────────────────────
let state = { notebooks: [], tree: null, notebookCount: 0, lastUpdated: null };
let favorites = {};   // { [id]: notebookSnapshot }
let recents   = [];   // [{ ...notebookSnapshot, visitedAt }]

let activeSidePanelPort = null;

// Cache de URLs reales descubiertas en tiempo de ejecución: { [notebookId]: url }
let notebookUrlCache = {};

// Click pendiente: cuando hay que navegar a la home primero y luego abrir
let pendingClick = null; // { rawTitle, tabId }

// ── Utilidades de badge ────────────────────────────────────────────────────
function updateBadge(count) {
  const text  = count > 0 ? String(count) : '';
  const color = '#1a73e8';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// ── Persistencia ───────────────────────────────────────────────────────────
function saveAll() {
  chrome.storage.local.set({
    [STORAGE_KEY]: {
      notebooks:     state.notebooks,
      notebookCount: state.notebookCount,
      lastUpdated:   state.lastUpdated
    },
    [STORAGE_FAVORITES]: favorites,
    [STORAGE_RECENTS]:   recents
  });
}

function restoreAll() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      [STORAGE_KEY, STORAGE_FAVORITES, STORAGE_RECENTS],
      result => {
        const saved = result[STORAGE_KEY];
        if (saved?.notebooks?.length > 0) {
          state.notebooks     = saved.notebooks;
          state.notebookCount = saved.notebookCount || saved.notebooks.length;
          state.lastUpdated   = saved.lastUpdated   || null;
          state.tree          = buildTree(state.notebooks);
        }
        favorites = result[STORAGE_FAVORITES] || {};
        recents   = result[STORAGE_RECENTS]   || [];
        updateBadge(state.notebookCount);
        resolve();
      }
    );
  });
}

// ── Parser de hashtags ─────────────────────────────────────────────────────
function parseNotebookTitle(rawTitle) {
  if (!rawTitle) return { cleanName: '', tagPaths: [] };
  const regex = /#([\w\/\-\u00C0-\u024F]+)/g;
  const tagPaths = [], found = [];
  let match;
  while ((match = regex.exec(rawTitle)) !== null) {
    const segs = match[1].split('/').map(s => s.trim()).filter(Boolean);
    if (segs.length) { tagPaths.push(segs); found.push(match[0]); }
  }
  let cleanName = rawTitle;
  found.forEach(t => { cleanName = cleanName.replace(t, ''); });
  return { cleanName: cleanName.replace(/\s+/g, ' ').trim(), tagPaths };
}

// ── Constructor del árbol ──────────────────────────────────────────────────
function buildTree(notebooks) {
  const roots     = {};
  const unlabeled = { name: UNLABELED_FOLDER, path: '__unlabeled__', children: {}, notebooks: [], totalCount: 0 };

  function getOrCreate(children, seg, parentPath) {
    const path = parentPath ? `${parentPath}/${seg}` : seg;
    if (!children[seg]) children[seg] = { name: seg, path, children: {}, notebooks: [], totalCount: 0 };
    return children[seg];
  }

  notebooks.forEach(nb => {
    if (!nb.tagPaths?.length) {
      unlabeled.notebooks.push(nb);
    } else {
      nb.tagPaths.forEach(tagPath => {
        let cur = roots, path = '';
        tagPath.forEach((seg, i) => {
          const node = getOrCreate(cur, seg, path);
          path = node.path;
          if (i === tagPath.length - 1) node.notebooks.push(nb);
          else cur = node.children;
        });
      });
    }
  });

  function countTotal(node) {
    let c = node.notebooks.length;
    Object.values(node.children).forEach(child => { c += countTotal(child); });
    return (node.totalCount = c);
  }
  Object.values(roots).forEach(countTotal);
  countTotal(unlabeled);

  const sortedRoots = {};
  Object.keys(roots).sort().forEach(k => { sortedRoots[k] = roots[k]; });
  return { roots: sortedRoots, unlabeled, totalCount: notebooks.length, builtAt: Date.now() };
}

// ── Helpers de recientes ───────────────────────────────────────────────────
function addToRecents(notebook) {
  recents = recents.filter(r => r.id !== notebook.id);
  recents.unshift({ ...notebook, visitedAt: Date.now() });
  if (recents.length > MAX_RECENTS) recents = recents.slice(0, MAX_RECENTS);
}

// ── Push al panel ──────────────────────────────────────────────────────────
function pushToPanel(message) {
  if (!activeSidePanelPort) return;
  try { activeSidePanelPort.postMessage(message); }
  catch { activeSidePanelPort = null; }
}

// ── Port: conexión con el Side Panel ──────────────────────────────────────
chrome.runtime.onConnect.addListener(async port => {
  if (port.name !== 'sidepanel') return;
  activeSidePanelPort = port;

  if (!state.tree && state.notebooks.length === 0) await restoreAll();

  port.postMessage({
    type: MSG.STATE_RESPONSE,
    payload: {
      tree:          state.tree,
      notebookCount: state.notebookCount,
      lastUpdated:   state.lastUpdated,
      favorites,
      recents
    }
  });

  port.onMessage.addListener(msg => handleMessage(msg, null));
  port.onDisconnect.addListener(() => { activeSidePanelPort = null; });
});

// ── Manejador de mensajes ──────────────────────────────────────────────────
function handleMessage(message, sender) {
  switch (message.type) {

    case MSG.NOTEBOOKS_UPDATED: {
      const { notebooks } = message.payload;
      if (notebooks.length === 0 && state.notebooks.length > 0) break;

      const tree = buildTree(notebooks);
      state = { notebooks, tree, notebookCount: notebooks.length, lastUpdated: Date.now() };

      updateBadge(notebooks.length);
      saveAll();

      pushToPanel({
        type: MSG.TREE_UPDATED,
        payload: { tree, notebookCount: notebooks.length, lastUpdated: state.lastUpdated, favorites, recents }
      });
      break;
    }

    case MSG.ACTIVE_NOTEBOOK_CHANGED: {
      const { title, url } = message.payload;

      // Guardar URL real en cache si tenemos título y URL de notebook
      if (title && url?.includes('/notebook/')) {
        const match = state.notebooks.find(nb => {
          const clean = nb.cleanName?.toLowerCase().trim();
          const t     = title.toLowerCase().trim();
          return clean === t || t.startsWith(clean) || clean.startsWith(t);
        });
        if (match) notebookUrlCache[match.id] = url;
      }

      pushToPanel({ type: MSG.ACTIVE_UPDATED, payload: { title, url } });
      break;
    }

    case MSG.TOGGLE_FAVORITE: {
      const nb = message.payload.notebook;
      if (!nb?.id) break;
      if (favorites[nb.id]) {
        delete favorites[nb.id];
      } else {
        favorites[nb.id] = { ...nb, favoritedAt: Date.now() };
      }
      saveAll();
      pushToPanel({ type: MSG.FAVORITES_UPDATED, payload: { favorites } });
      break;
    }

    case MSG.OPEN_NOTEBOOK: {
      const { url, rawTitle, notebook } = message.payload;

      // Agregar a recientes
      if (notebook) {
        addToRecents(notebook);
        saveAll();
        pushToPanel({ type: MSG.FAVORITES_UPDATED, payload: { favorites, recents } });
      }

      // Resolver la URL más precisa disponible
      const cachedUrl  = notebook?.id ? notebookUrlCache[notebook.id] : null;
      const targetUrl  = cachedUrl || (url?.includes('/notebook/') ? url : null);

      chrome.tabs.query({ url: 'https://notebooklm.google.com/*' }, tabs => {
        if (!tabs.length) {
          // No hay pestaña de NotebookLM abierta
          chrome.tabs.create({
            url: targetUrl || 'https://notebooklm.google.com'
          });
          return;
        }

        const tab = tabs[0];
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });

        if (targetUrl) {
          // Tenemos URL directa → navegar sin pasar por la lista
          chrome.tabs.update(tab.id, { url: targetUrl });
          return;
        }

        // No tenemos URL → necesitamos que la lista esté cargada
        const isOnHome = /^https:\/\/notebooklm\.google\.com\/?(\?.*)?$/.test(tab.url || '');

        if (isOnHome) {
          // Ya estamos en la lista: click directo tras un pequeño delay
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, {
              type: MSG.OPEN_NOTEBOOK,
              payload: { rawTitle }
            }).catch(() => {});
          }, 600);
        } else {
          // Estamos dentro de un cuaderno: volver a la lista primero
          pendingClick = { rawTitle, tabId: tab.id };
          chrome.tabs.update(tab.id, { url: 'https://notebooklm.google.com' });
        }
      });
      break;
    }

    case MSG.RESCAN: {
      chrome.tabs.query({ url: 'https://notebooklm.google.com/*' }, tabs => {
        tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: MSG.RESCAN }).catch(() => {}));
      });
      break;
    }
  }
}

// ── Mensajes one-shot desde content script ────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender) => handleMessage(msg, sender));

// ── Click pendiente: ejecutar cuando la home termina de cargar ────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!pendingClick)                              return;
  if (changeInfo.status !== 'complete')           return;
  if (pendingClick.tabId !== tabId)               return;
  if (!tab.url?.includes('notebooklm.google.com')) return;
  if (tab.url?.includes('/notebook/'))            return;

  const { rawTitle } = pendingClick;
  pendingClick = null;

  // Esperar a que Angular renderice la tabla (~1.5 s)
  setTimeout(() => {
    chrome.tabs.sendMessage(tabId, {
      type: MSG.OPEN_NOTEBOOK,
      payload: { rawTitle }
    }).catch(() => {});
  }, 1500);
});

// ── Inicialización al despertar ────────────────────────────────────────────
restoreAll();

// ── Abrir Side Panel ──────────────────────────────────────────────────────
chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
