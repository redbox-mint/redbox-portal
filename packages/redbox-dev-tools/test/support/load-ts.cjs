const { createRequire } = require('module');

// Mocha on Node 24 can load .ts test files through its ESM path before
// ts-node's CommonJS require hook gets a chance to resolve sibling TS source.
// Creating a real CommonJS-scoped require from the calling test module forces
// imports like ../../src/... back through ts-node/register, which keeps these
// tests working in CircleCI without changing the package runtime code.
module.exports = function loadTs(fromModule, specifier) {
  return createRequire(fromModule.filename)(specifier);
};
