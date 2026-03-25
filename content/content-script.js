/* content/content-script.js — Orquestador principal del content script */
(function () {
  'use strict';

  var initialized = false;
  var lastUrl     = location.href;
  var activeTitle = null;

  // ── Enviar lista de cuadernos al SW ─────────────────────────────────────
  function sendNotebooks() {
    var notebooks = NLM.scrapeNotebooks();
    chrome.runtime.sendMessage({
      type: NLM.MSG.NOTEBOOKS_UPDATED,
      payload: { notebooks: notebooks }
    }).catch(function () {});
  }

  // ── Detectar cuaderno activo por URL y título de página ─────────────────
  function detectActiveNotebook() {
    var isInsideNotebook = /\/notebook\/[^/?#]+/.test(location.href);

    if (!isInsideNotebook) {
      if (activeTitle !== null) {
        activeTitle = null;
        chrome.runtime.sendMessage({
          type: NLM.MSG.ACTIVE_NOTEBOOK_CHANGED,
          payload: { title: null, url: location.href }
        }).catch(function () {});
      }
      return;
    }

    // Buscar el título en el DOM de la página interna del cuaderno
    var titleSelectors = [
      '[class*="notebook-title"]',
      '[class*="project-title"]',
      'h1[class*="title"]',
      'h1',
      '.title'
    ];

    var title = null;
    for (var i = 0; i < titleSelectors.length; i++) {
      var el = document.querySelector(titleSelectors[i]);
      if (el) {
        var text = el.textContent.trim();
        if (text && text.length > 0 && text.length < 300) {
          title = text.split('\n')[0].trim();
          break;
        }
      }
    }

    // Fallback: usar el título del documento
    if (!title && document.title) {
      title = document.title.replace(' - NotebookLM', '').trim();
    }

    if (title && title !== activeTitle) {
      activeTitle = title;
      chrome.runtime.sendMessage({
        type: NLM.MSG.ACTIVE_NOTEBOOK_CHANGED,
        payload: { title: title, url: location.href }
      }).catch(function () {});
    }
  }

  // ── Inicialización ──────────────────────────────────────────────────────
  function init() {
    if (initialized) return;
    initialized = true;

    setTimeout(function() {
      sendNotebooks();
      detectActiveNotebook();
    }, 800);

    NLM.setupObserver(sendNotebooks);

    chrome.runtime.onMessage.addListener(function (message) {
      if (message.type === NLM.MSG.RESCAN) {
        sendNotebooks();
      }

      if (message.type === NLM.MSG.OPEN_NOTEBOOK) {
        var payload = message.payload || {};

        if (payload.url && payload.url.includes('/notebook/')) {
          location.href = payload.url;
          return;
        }

        if (payload.rawTitle) {
          var rows = NLM.trySelectors(document, NLM.CONSTANTS.SELECTORS.NOTEBOOK_CARD);
          rows = rows.filter(function(row) {
            return !row.querySelector('th') &&
                   !row.classList.contains('mat-header-row') &&
                   !row.classList.contains('mdc-data-table__header-row');
          });

          for (var i = 0; i < rows.length; i++) {
            var titleEl = NLM.trySelectors(rows[i], NLM.CONSTANTS.SELECTORS.NOTEBOOK_TITLE);
            var rowTitle = titleEl.length > 0
              ? titleEl[0].textContent.trim().split('\n')[0].trim()
              : rows[i].textContent.trim().split('\n')[0].trim();

            if (rowTitle === payload.rawTitle) {
              rows[i].click();
              return;
            }
          }
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Detectar navegación SPA ─────────────────────────────────────────────
  new MutationObserver(function () {
    var url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(function() {
        sendNotebooks();
        detectActiveNotebook();
      }, 800);
    }
  }).observe(document, { subtree: true, childList: true });

})();
