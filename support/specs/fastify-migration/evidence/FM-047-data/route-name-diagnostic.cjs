'use strict';

// Diagnostic only. Hold the r4 image, composition and protocol fixed while
// removing the repeated canonicalization cost for static declaration strings.
const { createRequire } = require('node:module');
const runtimeRequire = createRequire('/opt/redbox-portal/app.js');
const routes = runtimeRequire('./packages/redbox-core/dist/http/fastify/routes.js');
const compute = routes.coreRouteName;
const cache = new Map();
routes.coreRouteName = (method, path) => {
  const key = `${method}\0${path}`;
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const canonical = compute(method, path);
  cache.set(key, canonical);
  return canonical;
};

require('./candidate-control.cjs');
