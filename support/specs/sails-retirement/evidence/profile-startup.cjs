const { performance } = require('node:perf_hooks');
const start = performance.now();
let transpilation = 0,
  count = 0;
if (process.argv[2] === 'source') {
  require(process.cwd() + '/node_modules/ts-node/register/transpile-only');
  const handler = require.extensions['.ts'];
  require.extensions['.ts'] = (mod, filename) => {
    const compile = mod._compile;
    let evaluation = 0;
    mod._compile = function (...args) {
      const began = performance.now();
      try {
        return compile.apply(this, args);
      } finally {
        evaluation += performance.now() - began;
      }
    };
    const began = performance.now();
    try {
      return handler(mod, filename);
    } finally {
      transpilation += performance.now() - began - evaluation;
      count++;
    }
  };
}
const entry = process.cwd() + (process.argv[2] === 'source' ? '/src' : '/dist');
const target = process.argv[2] === 'standalone' ? entry + '/http/express' : entry;
const began = performance.now();
require(target);
const imported = performance.now();
require(entry + '/utilities/TranslationHtml').sanitizeTranslationHtml('<p onclick="bad()">Hello</p>');
console.log(
  JSON.stringify({
    mode: process.argv[2],
    importMs: Math.round(imported - began),
    sanitizeMs: Math.round(performance.now() - imported),
    transpileMs: Math.round(transpilation),
    typescriptFiles: count,
    totalMs: Math.round(performance.now() - start),
  })
);
