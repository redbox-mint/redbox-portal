'use strict';

const { writeFileSync } = require('node:fs');

module.exports = class AuthorizationMutationReporter {
  constructor(runner) {
    const passed = [];
    const failed = [];
    const pending = [];
    const test = t => ({ file: t.file, title: t.fullTitle() });
    runner.on('pass', t => passed.push(test(t)));
    runner.on('pending', t => pending.push(test(t)));
    runner.on('fail', (t, error) =>
      failed.push({
        ...test(t),
        type: t.type,
        code: error.code,
        name: error.name,
        message: String(error.message).slice(0, 2048),
      })
    );
    runner.once('end', () =>
      writeFileSync(process.env.FM043_MUTATION_REPORT, JSON.stringify({ passed, failed, pending }))
    );
  }
};
