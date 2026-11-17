'use strict';

// Deliberately case-sensitive. Absence selects the production Fastify default;
// misspellings must never qualify a different transport.
function selectedHost(value) {
  if (value === undefined) return 'fastify';
  if (value === 'express' || value === 'fastify') return value;
  throw new Error(`Invalid RBPORTAL_PLAYWRIGHT_HOST ${JSON.stringify(value)}; use express or fastify (lowercase).`);
}

function assertStartedHost(log, expected) {
  const messages = new Map([
    ['Express host ready.', 'express'],
    ['Fastify host ready.', 'fastify'],
  ]);
  const observed = log.split('\n').flatMap(line => {
    try {
      const record = JSON.parse(line);
      const host = messages.get(record.msg);
      return host ? [{ host, pid: record.pid, time: record.time }] : [];
    } catch {
      return [];
    }
  });
  if (observed.length !== 1 || observed[0].host !== expected)
    throw new Error(`Playwright host mismatch: expected ${expected}, observed ${JSON.stringify(observed)}.`);
  return observed[0];
}

module.exports = { selectedHost, assertStartedHost };

if (require.main === module) {
  const host = selectedHost(process.env.RBPORTAL_PLAYWRIGHT_HOST);
  if (process.argv[2] === '--assert-started') {
    const fs = require('node:fs');
    const observed = assertStartedHost(fs.readFileSync(0, 'utf8'), host);
    fs.writeFileSync('.tmp/playwright/logs/observed-host.json', JSON.stringify(observed, null, 2) + '\n');
    process.stdout.write(`Verified ${host} ready in the current portal container.\n`);
  } else if (process.argv.length !== 2) {
    throw new Error('Use playwright-host.cjs [--assert-started].');
  }
}
