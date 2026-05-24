const path = require('node:path');

process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || path.join(__dirname, 'test/tsconfig.json');
process.env.TS_NODE_FILES = process.env.TS_NODE_FILES || 'true';

module.exports = {
    extension: ['ts'],
    spec: ['test/**/*.test.ts'],
    require: ['chai/register-expect.js', 'ts-node/register', path.join(__dirname, 'test/setup.ts')],
    timeout: 5000
};

if (process.env.CI === "true") {
  console.log("Mocha running in CI.");
  // (For CI) Run mocha and write results to a junit format file:
  module.exports["reporter"] = "mocha-junit-reporter";
  module.exports["reporter-option"] = "mochaFile=support/junit/mocha.xml";
} else {
  console.log("Mocha running in local dev.");
  // (For development) Run mocha and show the results on stdout:
  module.exports["reporter"] = "spec";
}
