/* shared/constants.js — Constantes globales compartidas por todos los scripts */
var NLM = NLM || {};

NLM.CONSTANTS = {
  UNLABELED_FOLDER: 'Sin etiquetar',
  DEBOUNCE_MS: 400,
  MAX_RECENTS: 10,

  STORAGE_KEY:       'nlm_state',
  STORAGE_FAVORITES: 'nlm_favorites',
  STORAGE_RECENTS:   'nlm_recents',

  SELECTORS: {
    // Selectores para los cuadernos en tabla Angular Material
    NOTEBOOK_CARD: [
      '.project-table tbody tr',        // Filas de la tabla
      '.project-table [role="row"]',    // Filas con role=row
      '[class*="project-table"] tr',
      'mat-table [role="row"]',
      '.mat-mdc-table-row',
      'tr[role="row"]'
    ],

    // Selectores para el título dentro de la fila
    NOTEBOOK_TITLE: [
      '.project-table-title',           // Clase específica del título
      '.mat-column-title',              // Columna de título
      '[class*="project-table-title"]',
      '[class*="title-column"] span',
      'td[class*="title"]'
    ],

    // Raíz del MutationObserver
    OBSERVER_ROOT: [
      '.projects-header',
      '.all-projects-container',
      'main',
      'mat-sidenav-content',
      '[role="main"]'
    ]
  }
};
