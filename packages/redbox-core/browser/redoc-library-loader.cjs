const { createHash } = require('node:crypto');

// ReDoc 3.1.0 inlines DOMPurify even in its library build. Replace that entire
// module with our installed dependency, rather than shipping a second sanitizer.
// Fail closed when the pinned upstream artifact changes; review the new module
// boundaries and repeat the emitted-bundle security test before updating them.
module.exports = function redocLibraryLoader(source) {
  const digest = createHash('sha256').update(source).digest('hex');
  if (digest !== '197b8e6331066499ccefa876021dd26c318b2a4445bdfda727c25cd93d84703d') {
    throw new Error('Unexpected ReDoc library artifact: review the DOMPurify replacement before building');
  }
  const start = source.indexOf('/*! @license DOMPurify 3.4.17');
  const end = source.indexOf('yv,Hoe=o(', start);
  const sanitizer = source.slice(start, end);
  if (createHash('sha256').update(sanitizer).digest('hex') !== '6003629bfdee15d16de457d55ebbb8b37c8f2f0891555ef300388a8ea07e0f22') {
    throw new Error('Unexpected embedded DOMPurify module');
  }
  // FlexSearch's worker capability probe compiles a string before falling back
  // under CSP. Select that same synchronous index directly: search stays enabled,
  // and no unsafe-eval or blob worker permission is needed.
  const workerProbe = 'function QEe(){if(typeof window>`u`||typeof Worker>`u`)return!1;let e=globalThis;try{return e._factory??=Function(ZEe),!0}catch{return!1}}';
  if (source.split(workerProbe).length !== 2) {
    throw new Error('Unexpected ReDoc search worker probe');
  }
  source = source.replace(workerProbe, 'function QEe(){return!1}');
  return "import portalDOMPurify from 'dompurify';\n" + source.slice(0, start) +
    'var vv=portalDOMPurify,Voe=()=>{},' + source.slice(end);
};
