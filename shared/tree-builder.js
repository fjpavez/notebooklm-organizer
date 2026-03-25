/* shared/tree-builder.js — Construcción del árbol de carpetas desde NotebookRecord[] */
var NLM = NLM || {};

/**
 * Construye un árbol de carpetas a partir de la lista de cuadernos.
 * Un cuaderno con múltiples hashtags aparece en varias carpetas simultáneamente.
 *
 * Estructura de retorno:
 * {
 *   roots: { folderName: FolderNode },
 *   unlabeled: FolderNode,
 *   totalCount: number,
 *   builtAt: number
 * }
 *
 * FolderNode:
 * {
 *   name: string,
 *   path: string,        // e.g. "trabajo/proyectos"
 *   children: { name: FolderNode },
 *   notebooks: NotebookRecord[],
 *   totalCount: number   // propio + descendientes
 * }
 *
 * @param {Array} notebooks
 * @returns {Object} tree
 */
NLM.buildTree = function(notebooks) {
  var roots = {};
  var unlabeled = {
    name: NLM.CONSTANTS.UNLABELED_FOLDER,
    path: '__unlabeled__',
    children: {},
    notebooks: [],
    totalCount: 0
  };

  function getOrCreateNode(parentChildren, segmentName, parentPath) {
    var nodePath = parentPath ? parentPath + '/' + segmentName : segmentName;
    if (!parentChildren[segmentName]) {
      parentChildren[segmentName] = {
        name: segmentName,
        path: nodePath,
        children: {},
        notebooks: [],
        totalCount: 0
      };
    }
    return parentChildren[segmentName];
  }

  notebooks.forEach(function(notebook) {
    if (!notebook.tagPaths || notebook.tagPaths.length === 0) {
      unlabeled.notebooks.push(notebook);
    } else {
      notebook.tagPaths.forEach(function(tagPath) {
        var currentChildren = roots;
        var currentPath = '';

        tagPath.forEach(function(segment, i) {
          var node = getOrCreateNode(currentChildren, segment, currentPath);
          currentPath = node.path;

          if (i === tagPath.length - 1) {
            // Nodo hoja: aquí vive el cuaderno
            node.notebooks.push(notebook);
          } else {
            // Nodo intermedio: continuar descendiendo
            currentChildren = node.children;
          }
        });
      });
    }
  });

  // Calcular totalCount de forma recursiva (bottom-up)
  function computeTotalCount(node) {
    var count = node.notebooks.length;
    Object.values(node.children).forEach(function(child) {
      count += computeTotalCount(child);
    });
    node.totalCount = count;
    return count;
  }

  Object.values(roots).forEach(computeTotalCount);
  computeTotalCount(unlabeled);

  // Ordenar carpetas raíz alfabéticamente
  var sortedRoots = {};
  Object.keys(roots).sort().forEach(function(key) {
    sortedRoots[key] = roots[key];
  });

  return {
    roots: sortedRoots,
    unlabeled: unlabeled,
    totalCount: notebooks.length,
    builtAt: Date.now()
  };
};
