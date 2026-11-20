'use strict';

const { writeFileSync } = require('node:fs');
const { channel } = require('node:diagnostics_channel');
const { install } = require('./authorization-requests.cjs');
const JunitReporter = require('mocha-junit-reporter');

// Keep CircleCI's JUnit report. Record exact file/full-title pairs alongside it
// for the decision inventory; pending tests never satisfy a mapping.
module.exports = class AuthorizationReporter extends JunitReporter {
  constructor(runner, options) {
    super(runner, options);
    const file = process.env.FM043_AUTHORIZATION_REPORT;
    if (!file) throw new Error('FM043_AUTHORIZATION_REPORT is required');
    const passes = [];
    const pending = [];
    const effects = channel('redbox.test.verified-denial-effects');
    const requests = install(runner);
    effects.subscribe(requests.verify);
    runner.on('pass', test => {
      if (test.file) passes.push({ file: test.file, title: test.fullTitle(), ...requests.receipt(test) });
    });
    runner.on('pending', test => {
      if (test.file) pending.push({ file: test.file, title: test.fullTitle() });
    });
    runner.once('end', () => {
      effects.unsubscribe(requests.verify);
      writeFileSync(file, JSON.stringify({ passes, pending, stats: runner.stats }));
    });
  }
};
