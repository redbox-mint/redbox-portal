// Fastify is the default for every integration profile and preparation mode.
// The explicit Express selector is retained only until FM-043 removes the oracle.
const { selectedHost } = require('./support/integration-testing/playwright-host.cjs');
require(selectedHost(process.env.RBPORTAL_PLAYWRIGHT_HOST) === 'express' ? './app.express.cjs' : './app.js');
