process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || 'test/tsconfig.json';

module.exports = {
    extension: ['ts'],
    spec: ['test/**/*.test.ts'],
    // Node 24's native TypeScript stripping conflicts with ts-node's CommonJS
    // loader. Preload Chai as well so legacy fire-and-forget dynamic imports do
    // not race the suite's static Chai imports while Mocha loads test files.
    "node-option": ['no-experimental-strip-types'],
    require: ['ts-node/register/transpile-only', 'chai', 'test/setup.ts'],
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
