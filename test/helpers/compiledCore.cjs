const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve('packages/redbox-core');
const original = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  const resolved = original.call(this, request, parent, ...args);
  if (typeof resolved === 'string' && resolved.startsWith(root + '/src/')) {
    const built = resolved.replace(root + '/src/', root + '/dist/').replace(/\.ts$/, '.js');
    if (fs.existsSync(built)) return built;
  }
  return resolved;
};
