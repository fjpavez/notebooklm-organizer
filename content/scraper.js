/* content/scraper.js — Extracción de cuadernos del DOM de NotebookLM */
var NLM = NLM || {};

/**
 * Intenta múltiples selectores en orden de prioridad.
 * Retorna el primer conjunto de resultados no vacío.
 *
 * @param {Element} root
 * @param {string[]} selectors
 * @returns {Element[]}
 */
NLM.trySelectors = function(root, selectors) {
  for (var i = 0; i < selectors.length; i++) {
    try {
      var results = root.querySelectorAll(selectors[i]);
      if (results.length > 0) return Array.from(results);
    } catch (e) {
      // Selector inválido, pasar al siguiente
    }
  }
  return [];
};

/**
 * Extrae todos los cuadernos visibles en la página de NotebookLM.
 * Usa una estrategia en capas: selectores semánticos → patrón URL → heurísticas.
 *
 * @returns {Array} NotebookRecord[]
 */
/**
 * Genera un ID estable a partir del título (ya que NotebookLM no expone hrefs).
 */
NLM.titleToId = function(title) {
  var hash = 0;
  for (var i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash) + title.charCodeAt(i);
    hash |= 0;
  }
  return 'nlm_' + Math.abs(hash).toString(36);
};

/**
 * Intenta obtener la URL real del cuaderno desde la URL actual de la página.
 * Funciona cuando el usuario ya está dentro de un cuaderno.
 */
NLM.getNotebookUrlFromCurrentPage = function() {
  var match = location.href.match(/\/notebook\/([^/?#]+)/);
  return match ? location.href : null;
};

NLM.scrapeNotebooks = function() {
  var notebooks = [];
  var seen = new Set();

  console.log('[NLM Debug] Iniciando scrape — URL:', location.href);

  // ── Estrategia 1: tabla Angular Material (vista de lista de cuadernos) ──
  // Usar los selectores de filas de tabla configurados
  var rows = NLM.trySelectors(document, NLM.CONSTANTS.SELECTORS.NOTEBOOK_CARD);
  console.log('[NLM Debug] Filas de tabla encontradas:', rows.length);

  // Filtrar filas de encabezado (header rows)
  rows = rows.filter(function(row) {
    var role = row.getAttribute('role');
    var isHeader = row.querySelector('th') !== null ||
                   role === 'columnheader' ||
                   row.classList.contains('project-table-role-header') ||
                   row.classList.contains('mat-header-row') ||
                   row.classList.contains('mdc-data-table__header-row');
    return !isHeader;
  });
  console.log('[NLM Debug] Filas de datos (sin headers):', rows.length);

  rows.forEach(function(row, index) {
    try {
      // ── Extraer título ──────────────────────────────────────────────────
      var rawTitle = '';
      var titleEls = NLM.trySelectors(row, NLM.CONSTANTS.SELECTORS.NOTEBOOK_TITLE);

      if (titleEls.length > 0) {
        rawTitle = titleEls[0].textContent.trim();
      }

      // Fallback: primera celda con texto relevante
      if (!rawTitle) {
        var cells = row.querySelectorAll('td');
        for (var i = 0; i < cells.length; i++) {
          var text = cells[i].textContent.trim();
          if (text && text.length > 0 && text.length < 200) {
            rawTitle = text;
            break;
          }
        }
      }

      if (!rawTitle) {
        console.log('[NLM Debug] Fila', index, 'sin título, omitiendo');
        return;
      }

      // Limpiar: quedarse solo con la primera línea (quitar metadatos extra)
      rawTitle = rawTitle.split('\n')[0].trim();

      // ── Extraer emoji si existe ─────────────────────────────────────────
      var emojiEl = row.querySelector('.project-table-emoji, [class*="emoji"]');
      var emoji = emojiEl ? emojiEl.textContent.trim() : '';

      // ── Construir ID estable ────────────────────────────────────────────
      var id = NLM.titleToId(rawTitle);
      if (seen.has(id)) return;
      seen.add(id);

      // ── URL: intentar href en la fila; si no, construir stub para navegar ──
      var url = '';
      var anchor = row.querySelector('a[href]');
      if (anchor) {
        var href = anchor.getAttribute('href');
        url = href.startsWith('http') ? href : 'https://notebooklm.google.com' + href;
      }
      // Sin href: guardamos el título como referencia para hacer click desde el content script
      if (!url) url = '';

      // ── Parsear hashtags ────────────────────────────────────────────────
      var parsed = NLM.parseNotebookTitle(rawTitle);

      var notebook = {
        id: id,
        rawTitle: rawTitle,
        cleanName: parsed.cleanName || rawTitle,
        tagPaths: parsed.tagPaths,
        emoji: emoji,
        url: url,
        rowIndex: index,      // Para poder hacer click por posición
        scrapedAt: Date.now()
      };

      console.log('[NLM Debug] Cuaderno:', rawTitle, '| Tags:', parsed.tagPaths, '| URL:', url || '(sin href)');
      notebooks.push(notebook);

    } catch (err) {
      console.error('[NLM Debug] Error en fila', index, ':', err);
    }
  });

  // ── Estrategia 2 (fallback): cualquier <a> con /notebook/ en el href ────
  if (notebooks.length === 0) {
    console.log('[NLM Debug] Sin resultados en tabla, probando fallback href=/notebook/');
    var links = Array.from(document.querySelectorAll('a[href]')).filter(function(a) {
      return /\/notebook\//.test(a.getAttribute('href') || '');
    });
    console.log('[NLM Debug] Links /notebook/ encontrados:', links.length);

    links.forEach(function(a, index) {
      var href = a.getAttribute('href');
      var idMatch = href.match(/\/notebook\/([^/?#]+)/);
      if (!idMatch) return;
      var id = idMatch[1];
      if (seen.has(id)) return;
      seen.add(id);

      var rawTitle = a.getAttribute('aria-label') || a.title || a.textContent.trim() || 'Sin título';
      rawTitle = rawTitle.split('\n')[0].trim();
      var parsed = NLM.parseNotebookTitle(rawTitle);
      var url = href.startsWith('http') ? href : 'https://notebooklm.google.com' + href;

      notebooks.push({
        id: id,
        rawTitle: rawTitle,
        cleanName: parsed.cleanName || rawTitle,
        tagPaths: parsed.tagPaths,
        emoji: '',
        url: url,
        rowIndex: index,
        scrapedAt: Date.now()
      });
    });
  }

  console.log('[NLM Debug] Scrape completado. Total:', notebooks.length);
  return notebooks;
};
