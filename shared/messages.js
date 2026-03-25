/* shared/messages.js — Protocolo de mensajes entre contextos */
var NLM = NLM || {};

NLM.MSG = {
  // content-script → service-worker
  NOTEBOOKS_UPDATED:      'NOTEBOOKS_UPDATED',
  ACTIVE_NOTEBOOK_CHANGED:'ACTIVE_NOTEBOOK_CHANGED',

  // side-panel → service-worker
  GET_STATE:      'GET_STATE',
  OPEN_NOTEBOOK:  'OPEN_NOTEBOOK',
  RESCAN:         'RESCAN',
  TOGGLE_FAVORITE:'TOGGLE_FAVORITE',

  // service-worker → side-panel (vía port)
  TREE_UPDATED:       'TREE_UPDATED',
  STATE_RESPONSE:     'STATE_RESPONSE',
  ACTIVE_UPDATED:     'ACTIVE_UPDATED',
  FAVORITES_UPDATED:  'FAVORITES_UPDATED'
};
