/* content/observer.js — MutationObserver con debounce para SPAs */
var NLM = NLM || {};

/**
 * Configura un MutationObserver sobre la raíz más específica disponible.
 * Incluye debounce para evitar re-escaneos en ráfagas de mutaciones (React/Angular).
 *
 * @param {Function} callback — se llama cuando hay cambios en el DOM
 * @returns {MutationObserver}
 */
NLM.setupObserver = function(callback) {
  var debounceTimer = null;

  var debouncedCallback = function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(callback, NLM.CONSTANTS.DEBOUNCE_MS);
  };

  // Encontrar la raíz de observación más específica
  var observerRoot = document.body;
  var selectors = NLM.CONSTANTS.SELECTORS.OBSERVER_ROOT;

  for (var i = 0; i < selectors.length; i++) {
    var el = document.querySelector(selectors[i]);
    if (el) {
      observerRoot = el;
      break;
    }
  }

  var observer = new MutationObserver(debouncedCallback);

  observer.observe(observerRoot, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });

  // Si observamos un elemento específico y la SPA lo reemplaza,
  // también vigilamos el body para detectar ese cambio
  if (observerRoot !== document.body) {
    var bodyObserver = new MutationObserver(function() {
      // Si el nodo observado ya no está en el DOM, re-escanear
      if (!document.contains(observerRoot)) {
        debouncedCallback();
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: false });
  }

  return observer;
};
