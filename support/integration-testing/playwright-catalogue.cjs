'use strict';
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
// Read the authored catalogue even before a stack has been built. ts-node is
// already pinned in the repository; the imported modules have no Sails runtime.
require('ts-node').register({ skipProject: true, transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', target: 'ES2022' } });
const { createPlaywrightScenarios } = require(path.join(root, 'packages/redbox-hook-dev/src/playwright/catalogue.ts'));
const { namesForScenario } = require(path.join(root, 'packages/redbox-hook-dev/src/playwright/builders.ts'));
module.exports = { root, scenarios: createPlaywrightScenarios(), namesForScenario };
