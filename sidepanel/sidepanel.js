/* sidepanel/sidepanel.js */
(function () {
  'use strict';

  // ── Estado ─────────────────────────────────────────────────────────────
  let currentTree      = null;
  let favorites        = {};   // { [id]: notebook }
  let recents          = [];   // [{ ...notebook, visitedAt }]
  let activeTitle      = null; // título del cuaderno activo en la pestaña
  let searchQuery      = '';
  let expandedFolders  = new Set();
  let favoritesOpen    = true;
  let recentsOpen      = true;
  let port             = null;

  // ── DOM ────────────────────────────────────────────────────────────────
  const treeContainer    = document.getElementById('tree-container');
  const statsBar         = document.getElementById('stats-bar');
  const headerCount      = document.getElementById('header-count');
  const searchInput      = document.getElementById('search-input');
  const searchClear      = document.getElementById('search-clear');
  const btnRefresh       = document.getElementById('btn-refresh');
  const btnExpandAll     = document.getElementById('btn-expand-all');
  const btnCollapseAll   = document.getElementById('btn-collapse-all');
  const btnExport        = document.getElementById('btn-export');
  const btnDebug         = document.getElementById('btn-debug');
  const debugPanel       = document.getElementById('debug-panel');
  const debugOutput      = document.getElementById('debug-output');
  const btnDebugClose    = document.getElementById('btn-debug-close');
  const sectionFavorites = document.getElementById('section-favorites');
  const sectionRecents   = document.getElementById('section-recents');
  const bodyFavorites    = document.getElementById('body-favorites');
  const bodyRecents      = document.getElementById('body-recents');
  const toggleFavorites  = document.getElementById('toggle-favorites');
  const toggleRecents    = document.getElementById('toggle-recents');
  const sectionsDivider  = document.getElementById('sections-divider');
  const mainScroll       = document.getElementById('main-scroll');

  // ── Conexión SW ────────────────────────────────────────────────────────
  function connectToSW() {
    try {
      port = chrome.runtime.connect({ name: 'sidepanel' });
      port.onMessage.addListener(handlePortMessage);
      port.onDisconnect.addListener(() => { port = null; setTimeout(connectToSW, 1000); });
    } catch { setTimeout(connectToSW, 1500); }
  }

  function sendToSW(message) {
    if (port) try { port.postMessage(message); } catch { /* port cerrado */ }
  }

  // ── Mensajes entrantes ─────────────────────────────────────────────────
  function handlePortMessage(message) {
    switch (message.type) {

      case NLM.MSG.STATE_RESPONSE:
      case NLM.MSG.TREE_UPDATED: {
        const p = message.payload;
        currentTree = p.tree;
        if (p.favorites) favorites = p.favorites;
        if (p.recents)   recents   = p.recents;
        if (expandedFolders.size === 0 && currentTree) {
          Object.keys(currentTree.roots).forEach(k => expandedFolders.add(k));
        }
        renderAll();
        updateMeta(p.notebookCount, p.lastUpdated);
        stopRefreshSpin();
        break;
      }

      case NLM.MSG.FAVORITES_UPDATED: {
        if (message.payload.favorites) favorites = message.payload.favorites;
        if (message.payload.recents)   recents   = message.payload.recents;
        renderAll();
        break;
      }

      case NLM.MSG.ACTIVE_UPDATED: {
        activeTitle = message.payload.title || null;
        renderAll();
        break;
      }
    }
  }

  // ── Meta header ────────────────────────────────────────────────────────
  function updateMeta(count, lastUpdated) {
    const n = count || 0;
    headerCount.textContent = `${n} cuaderno${n !== 1 ? 's' : ''}`;
    if (lastUpdated) {
      const t = new Date(lastUpdated).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      statsBar.textContent = `Última actualización: ${t}`;
    } else {
      statsBar.textContent = '';
    }
  }

  // ── Búsqueda ───────────────────────────────────────────────────────────
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    searchClear.classList.toggle('visible', searchQuery.length > 0);
    renderAll();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = ''; searchQuery = '';
    searchClear.classList.remove('visible');
    searchInput.focus();
    renderAll();
  });

  // ── Botones de control ─────────────────────────────────────────────────
  btnRefresh.addEventListener('click', () => {
    btnRefresh.classList.add('spinning');
    sendToSW({ type: NLM.MSG.RESCAN, payload: {} });
    setTimeout(() => btnRefresh.classList.remove('spinning'), 3000);
  });

  function stopRefreshSpin() { btnRefresh.classList.remove('spinning'); }

  btnExpandAll.addEventListener('click', () => {
    if (!currentTree) return;
    collectAllFolderPaths(currentTree).forEach(p => expandedFolders.add(p));
    renderAll();
  });

  btnCollapseAll.addEventListener('click', () => {
    expandedFolders.clear();
    renderAll();
  });

  toggleFavorites.addEventListener('click', () => {
    favoritesOpen = !favoritesOpen;
    toggleFavorites.querySelector('.quick-section-arrow').style.transform =
      favoritesOpen ? 'rotate(90deg)' : '';
    bodyFavorites.style.display = favoritesOpen ? '' : 'none';
  });

  toggleRecents.addEventListener('click', () => {
    recentsOpen = !recentsOpen;
    toggleRecents.querySelector('.quick-section-arrow').style.transform =
      recentsOpen ? 'rotate(90deg)' : '';
    bodyRecents.style.display = recentsOpen ? '' : 'none';
  });

  // ── Export JSON ────────────────────────────────────────────────────────
  btnExport.addEventListener('click', () => {
    if (!currentTree) return;

    const allNotebooks = collectAllNotebooks(currentTree);

    const unique = [...new Map(allNotebooks.map(n => [n.id, n])).values()];

    const exportData = {
      exportedAt: new Date().toISOString(),
      totalNotebooks: unique.length,
      notebooks: unique.map(nb => ({
        name:       nb.cleanName,
        rawTitle:   nb.rawTitle,
        tags:       (nb.tagPaths || []).map(p => p.join('/')),
        url:        nb.url || null,
        isFavorite: !!favorites[nb.id],
        emoji:      nb.emoji || null
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `notebooklm-organizer-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  function collectAllNotebooks(roots) {
    const result = [];
    function traverse(node) {
      result.push(...node.notebooks);
      Object.values(node.children).forEach(traverse);
    }
    Object.values(roots).forEach(traverse);
    return result;
  }

  // ── Debug ──────────────────────────────────────────────────────────────
  btnDebug.addEventListener('click', () => {
    const open = debugPanel.style.display === 'none';
    debugPanel.style.display = open ? 'flex' : 'none';
    if (open) {
      debugOutput.textContent = JSON.stringify(
        { favorites: Object.keys(favorites).length, recents: recents.length, activeTitle, tree: currentTree },
        null, 2
      );
    }
  });
  btnDebugClose.addEventListener('click', () => { debugPanel.style.display = 'none'; });

  // ── Helpers de árbol ───────────────────────────────────────────────────
  function collectAllFolderPaths(tree) {
    const paths = [];
    function traverse(node) { paths.push(node.path); Object.values(node.children).forEach(traverse); }
    Object.values(tree.roots).forEach(traverse);
    if (tree.unlabeled?.notebooks.length > 0) paths.push(tree.unlabeled.path);
    return paths;
  }

  function matchesSearch(notebook) {
    if (!searchQuery) return true;
    if (notebook.cleanName.toLowerCase().includes(searchQuery)) return true;
    return (notebook.tagPaths || []).some(p => p.join('/').toLowerCase().includes(searchQuery));
  }

  function highlightText(text) {
    if (!searchQuery) return escHtml(text);
    const idx = text.toLowerCase().indexOf(searchQuery);
    if (idx === -1) return escHtml(text);
    return escHtml(text.slice(0, idx)) +
      '<mark>' + escHtml(text.slice(idx, idx + searchQuery.length)) + '</mark>' +
      escHtml(text.slice(idx + searchQuery.length));
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Render principal ───────────────────────────────────────────────────
  function renderAll() {
    renderQuickSections();
    renderTree();
  }

  // ── Secciones rápidas (Favoritos + Recientes) ──────────────────────────
  function renderQuickSections() {
    const favList = Object.values(favorites);
    const hasFav  = favList.length > 0;
    const hasRec  = recents.length > 0;

    sectionFavorites.style.display = hasFav ? '' : 'none';
    sectionRecents.style.display   = hasRec ? '' : 'none';
    sectionsDivider.style.display  = (hasFav || hasRec) ? '' : 'none';

    if (hasFav) {
      toggleFavorites.querySelector('.quick-section-arrow').style.transform =
        favoritesOpen ? 'rotate(90deg)' : '';
      bodyFavorites.style.display = favoritesOpen ? '' : 'none';
      bodyFavorites.innerHTML = favList
        .sort((a, b) => a.cleanName.localeCompare(b.cleanName))
        .map(nb => renderQuickItem(nb, true))
        .join('');
    }

    if (hasRec) {
      toggleRecents.querySelector('.quick-section-arrow').style.transform =
        recentsOpen ? 'rotate(90deg)' : '';
      bodyRecents.style.display = recentsOpen ? '' : 'none';
      bodyRecents.innerHTML = recents
        .map(nb => renderQuickItem(nb, false, nb.visitedAt))
        .join('');
    }

    attachQuickItemHandlers();
  }

  function renderQuickItem(nb, isFavorite, visitedAt) {
    const isActive  = activeTitle && nb.cleanName === activeTitle;
    const timeLabel = visitedAt ? formatRelativeTime(visitedAt) : '';

    return `
      <div class="notebook-item quick-item${isActive ? ' active-notebook' : ''}"
           data-url="${escHtml(nb.url || '')}"
           data-raw-title="${escHtml(nb.rawTitle || nb.cleanName)}"
           data-notebook-id="${escHtml(nb.id)}"
           title="${escHtml(nb.cleanName)}">
        <span class="notebook-icon">${escHtml(nb.emoji || '📓')}</span>
        <span class="notebook-name">${highlightText(nb.cleanName)}</span>
        ${timeLabel ? `<span class="recent-time">${escHtml(timeLabel)}</span>` : ''}
        <button class="btn-favorite${isFavorite ? ' is-favorite' : ''}"
                data-notebook-id="${escHtml(nb.id)}"
                title="${isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}">
          ${isFavorite ? '⭐' : '☆'}
        </button>
      </div>`;
  }

  // ── Árbol de carpetas ──────────────────────────────────────────────────
  function renderTree() {
    if (!currentTree) {
      treeContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📂</div>
          <div class="empty-state-title">Abre NotebookLM primero</div>
          <div class="empty-state-desc">Ve a <strong>notebooklm.google.com</strong> y la extensión detectará tus cuadernos automáticamente.</div>
        </div>`;
      return;
    }

    if (currentTree.totalCount === 0) {
      treeContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📓</div>
          <div class="empty-state-title">No hay cuadernos todavía</div>
          <div class="empty-state-desc">Crea tu primer cuaderno en NotebookLM.</div>
        </div>`;
      return;
    }

    let html = '';
    Object.values(currentTree.roots).forEach(node => { html += renderFolderNode(node, 0); });

    if (currentTree.unlabeled?.totalCount > 0) {
      const u = renderFolderNode(currentTree.unlabeled, 0, true);
      if (u) { html += '<div class="unlabeled-divider"></div>' + u; }
    }

    if (!html.trim()) {
      treeContainer.innerHTML = `
        <div class="no-results">
          <div class="no-results-icon">🔍</div>
          <div class="no-results-text">Sin resultados para "<strong>${escHtml(searchQuery)}</strong>"</div>
        </div>`;
    } else {
      treeContainer.innerHTML = html;
      attachFolderHandlers();
      attachNotebookHandlers();
    }
  }

  function renderFolderNode(node, depth, isUnlabeled) {
    const matchedNbs = node.notebooks.filter(matchesSearch);
    let childrenHtml = '';
    Object.values(node.children).forEach(child => { childrenHtml += renderFolderNode(child, depth + 1); });

    if (searchQuery && matchedNbs.length === 0 && !childrenHtml.trim()) return '';

    const isOpen = expandedFolders.has(node.path) ||
      (searchQuery && (matchedNbs.length > 0 || childrenHtml.trim()));

    const folderIcon = isUnlabeled ? '🏷️' : (depth === 0 ? '📁' : '📂');
    const displayCount = searchQuery
      ? matchedNbs.length + countMatchesInChildren(node.children)
      : node.totalCount;

    return `
      <div class="folder${isOpen ? ' open' : ''}" data-path="${escHtml(node.path)}">
        <div class="folder-header">
          <span class="folder-arrow">▶</span>
          <span class="folder-icon">${folderIcon}</span>
          <span class="folder-name${isUnlabeled ? ' unlabeled' : ''}">${highlightText(node.name)}</span>
          <span class="badge">${displayCount}</span>
        </div>
        <div class="folder-children">
          ${childrenHtml}
          ${matchedNbs.map(nb => renderNotebookItem(nb)).join('')}
        </div>
      </div>`;
  }

  function countMatchesInChildren(children) {
    let n = 0;
    Object.values(children).forEach(child => {
      n += child.notebooks.filter(matchesSearch).length + countMatchesInChildren(child.children);
    });
    return n;
  }

  function renderNotebookItem(nb) {
    const isFav    = !!favorites[nb.id];
    const isActive = activeTitle && nb.cleanName === activeTitle;

    return `
      <div class="notebook-item${isActive ? ' active-notebook' : ''}"
           data-url="${escHtml(nb.url || '')}"
           data-raw-title="${escHtml(nb.rawTitle || nb.cleanName)}"
           data-notebook-id="${escHtml(nb.id)}"
           title="${escHtml(nb.cleanName)}">
        <span class="notebook-icon">${escHtml(nb.emoji || '📓')}</span>
        <span class="notebook-name">${highlightText(nb.cleanName)}</span>
        <button class="btn-favorite${isFav ? ' is-favorite' : ''}"
                data-notebook-id="${escHtml(nb.id)}"
                title="${isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}">
          ${isFav ? '⭐' : '☆'}
        </button>
      </div>`;
  }

  // ── Event handlers ─────────────────────────────────────────────────────
  function attachFolderHandlers() {
    treeContainer.querySelectorAll('.folder-header').forEach(header => {
      header.addEventListener('click', () => {
        const folder = header.closest('.folder');
        const path   = folder.dataset.path;
        if (expandedFolders.has(path)) {
          expandedFolders.delete(path);
          folder.classList.remove('open');
        } else {
          expandedFolders.add(path);
          folder.classList.add('open');
        }
      });
    });
  }

  function attachNotebookHandlers() {
    treeContainer.querySelectorAll('.notebook-item').forEach(item => {
      attachItemHandlers(item);
    });
  }

  function attachQuickItemHandlers() {
    document.querySelectorAll('.quick-item').forEach(item => {
      attachItemHandlers(item);
    });
  }

  function attachItemHandlers(item) {
    // Click en el ítem → abrir cuaderno
    item.addEventListener('click', e => {
      if (e.target.closest('.btn-favorite')) return;
      const url      = item.dataset.url;
      const rawTitle = item.dataset.rawTitle;
      const id       = item.dataset.notebookId;
      const notebook = findNotebookById(id);

      // ── Fix "estás aquí": update optimista inmediato ──
      if (notebook) {
        activeTitle = notebook.cleanName;
        renderAll();
      }

      sendToSW({ type: NLM.MSG.OPEN_NOTEBOOK, payload: { url, rawTitle, notebook } });
    });

    // Click en ⭐ → toggle favorito
    const btnFav = item.querySelector('.btn-favorite');
    if (btnFav) {
      btnFav.addEventListener('click', e => {
        e.stopPropagation();
        const id = btnFav.dataset.notebookId;
        const nb = findNotebookById(id);
        if (nb) sendToSW({ type: NLM.MSG.TOGGLE_FAVORITE, payload: { notebook: nb } });
      });
    }
  }

  function findNotebookById(id) {
    if (!id) return null;
    const all = [
      ...Object.values(favorites),
      ...recents,
      ...(currentTree ? collectAllNotebooks(currentTree) : [])
    ];
    return all.find(nb => nb.id === id) || null;
  }

  function collectAllNotebooks(tree) {
    const result = [];
    function traverse(node) {
      result.push(...node.notebooks);
      Object.values(node.children).forEach(traverse);
    }
    Object.values(tree.roots).forEach(traverse);
    if (tree.unlabeled) result.push(...tree.unlabeled.notebooks);
    return result;
  }

  // ── Tiempo relativo ────────────────────────────────────────────────────
  function formatRelativeTime(ts) {
    const diff = Date.now() - ts;
    const m    = Math.floor(diff / 60000);
    const h    = Math.floor(diff / 3600000);
    const d    = Math.floor(diff / 86400000);
    if (m < 1)   return 'ahora';
    if (m < 60)  return `${m}m`;
    if (h < 24)  return `${h}h`;
    if (d < 7)   return `${d}d`;
    return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }

  // ── Init ───────────────────────────────────────────────────────────────
  connectToSW();

})();
