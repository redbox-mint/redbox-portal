// The migration acceptance fixture selects the production Fastify composition.
// Ordinary integration deployments retain the pre-cutover executable.
const { selectedHost } = require('./support/integration-testing/playwright-host.cjs');
if (selectedHost(process.env.RBPORTAL_PLAYWRIGHT_HOST) === 'fastify') {
  require('./support/integration-testing/fastify-playwright.cjs');
} else {
  require('./app.express.cjs');
}
