/* shared/parser.js — Parseo de hashtags en nombres de cuadernos */
var NLM = NLM || {};

/**
 * Parsea el título de un cuaderno extrayendo hashtags jerárquicos.
 *
 * Ejemplos:
 *   "Mi Cuaderno #trabajo/proyectos #2025"
 *   → { cleanName: "Mi Cuaderno", tagPaths: [["trabajo","proyectos"], ["2025"]] }
 *
 *   "Notas sueltas"
 *   → { cleanName: "Notas sueltas", tagPaths: [] }
 *
 *   "Paper #ia/nlp"
 *   → { cleanName: "Paper", tagPaths: [["ia","nlp"]] }
 *
 * @param {string} rawTitle
 * @returns {{ cleanName: string, tagPaths: string[][] }}
 */
NLM.parseNotebookTitle = function(rawTitle) {
  if (!rawTitle) return { cleanName: '', tagPaths: [] };

  // Soporta letras, números, guiones, slashes y caracteres acentuados (español, etc.)
  var regex = /#([\w\/\-\u00C0-\u024F]+)/g;
  var tagPaths = [];
  var found = [];
  var match;

  while ((match = regex.exec(rawTitle)) !== null) {
    var fullTag = match[1];
    var segments = fullTag
      .split('/')
      .map(function(s) { return s.trim(); })
      .filter(function(s) { return s.length > 0; });

    if (segments.length > 0) {
      tagPaths.push(segments);
      found.push(match[0]); // e.g. "#trabajo/proyectos"
    }
  }

  // Eliminar hashtags del nombre visible
  var cleanName = rawTitle;
  found.forEach(function(tag) {
    cleanName = cleanName.replace(tag, '');
  });

  return {
    cleanName: cleanName.replace(/\s+/g, ' ').trim(),
    tagPaths: tagPaths // [] → carpeta "Sin etiquetar"
  };
};
