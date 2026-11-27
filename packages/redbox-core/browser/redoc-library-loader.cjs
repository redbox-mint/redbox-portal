const { createHash } = require('node:crypto');

// ReDoc 3.2.0 inlines DOMPurify even in its library build. Replace that entire
// module with our installed dependency, rather than shipping a second sanitizer.
// Fail closed when the pinned upstream artifact changes; review the new module
// boundaries and repeat the emitted-bundle security test before updating them.
module.exports = function redocLibraryLoader(source) {
  const digest = createHash('sha256').update(source).digest('hex');
  if (digest !== 'cda5fe44fde70a40bab98d9212eab8236f761eb64103e09c404d749b120e8956') {
    throw new Error('Unexpected ReDoc library artifact: review the DOMPurify replacement before building');
  }
  const start = source.indexOf('/*! @license DOMPurify 3.4.17');
  const end = source.indexOf('uv,bse=o(', start);
  const sanitizer = source.slice(start, end);
  if (createHash('sha256').update(sanitizer).digest('hex') !== 'd817d0f59101bfcaa72c28e85645ee4b53c5e05407ac184b8f2576ca4c446cc0') {
    throw new Error('Unexpected embedded DOMPurify module');
  }
  // FlexSearch's worker capability probe compiles a string before falling back
  // under CSP. Select that same synchronous index directly: search stays enabled,
  // and no unsafe-eval or blob worker permission is needed.
  const workerProbe = 'function EDe(){if(typeof window>`u`||typeof Worker>`u`)return!1;let e=globalThis;try{return e._factory??=Function(TDe),!0}catch{return!1}}';
  if (source.split(workerProbe).length !== 2) {
    throw new Error('Unexpected ReDoc search worker probe');
  }
  source = source.replace(workerProbe, 'function EDe(){return!1}');
  return "import portalDOMPurify from 'dompurify';\n" + source.slice(0, start) +
    'var lv=portalDOMPurify,yse=()=>{},' + source.slice(end);
};
