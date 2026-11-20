'use strict';

function assertStartedHost(log) {
  const messages = new Map([['Fastify host ready.', 'fastify']]);
  const observed = log.split('\n').flatMap(line => {
    try {
      const record = JSON.parse(line);
      const host = messages.get(record.msg);
      return host ? [{ host, pid: record.pid, time: record.time }] : [];
    } catch {
      return [];
    }
  });
  if (observed.length !== 1 || observed[0].host !== 'fastify')
    throw new Error(`Playwright host mismatch: expected fastify, observed ${JSON.stringify(observed)}.`);
  return observed[0];
}

module.exports = { assertStartedHost };

if (require.main === module) {
  if (process.argv[2] === '--assert-started') {
    const fs = require('node:fs');
    const observed = assertStartedHost(fs.readFileSync(0, 'utf8'));
    fs.writeFileSync('.tmp/playwright/logs/observed-host.json', JSON.stringify(observed, null, 2) + '\n');
    process.stdout.write(`Verified fastify ready in the current portal container.\n`);
  } else if (process.argv.length !== 2) {
    throw new Error('Use playwright-host.cjs [--assert-started].');
  }
}
