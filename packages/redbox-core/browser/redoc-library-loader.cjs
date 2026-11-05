const { createHash } = require('node:crypto');

// ReDoc 3.0.1 inlines DOMPurify even in its library build. Replace that entire
// module with our installed dependency, rather than shipping a second sanitizer.
// Fail closed when the pinned upstream artifact changes; review the new module
// boundaries and repeat the emitted-bundle security test before updating them.
module.exports = function redocLibraryLoader(source) {
  const digest = createHash('sha256').update(source).digest('hex');
  if (digest !== '09470eddd0727b75e52d8a393bc742f44a2704364f79b557890a42c0bfd36449') {
    throw new Error('Unexpected ReDoc library artifact: review the DOMPurify replacement before building');
  }
  const start = source.indexOf('/*! @license DOMPurify 3.4.16');
  const end = source.indexOf('Ry,Hre=o(', start);
  const sanitizer = source.slice(start, end);
  if (createHash('sha256').update(sanitizer).digest('hex') !== '4817ba27f180a033c6b92f5c46b0586fd1d39f490514515a7151ea97096f1547') {
    throw new Error('Unexpected embedded DOMPurify module');
  }
  return "import portalDOMPurify from 'dompurify';\n" + source.slice(0, start) +
    'var Ly=portalDOMPurify,Vre=()=>{},' + source.slice(end);
};
