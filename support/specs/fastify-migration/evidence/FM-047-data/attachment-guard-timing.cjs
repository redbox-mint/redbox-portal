'use strict';

// Observe the live authorization guard in one diagnostic run. The harness
// report filters these observations to the monotonic request window.
const fs = require('node:fs');
const { createRequire } = require('node:module');
const runtimeRequire = createRequire('/opt/redbox-portal/app.js');
const handlers = runtimeRequire('./packages/redbox-core/dist/http/fastify/datastreamReads.js');
const guard = handlers.datastreamReadGuard;
const timings = [];
const monotonicMs = () => Number(process.hrtime.bigint()) / 1e6;

handlers.datastreamReadGuard = async (request, reply, input, action) => {
  if (action !== 'doAttachment') return guard(request, reply, input, action);
  const start = monotonicMs();
  try {
    return await guard(request, reply, input, action);
  } finally {
    timings.push({ start, end: monotonicMs() });
  }
};

process.on('exit', () => fs.writeFileSync('/fm007-output/attachment-guard-timing.json', JSON.stringify(timings)));
require('./profile-control.cjs');
