process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || 'test/tsconfig.json';

module.exports = {
    extension: ['ts'],
    spec: ['test/**/*.test.ts'],
    // Use ts-node for TypeScript tests on Node versions with built-in stripping.
    'node-option': ['no-experimental-strip-types'],
    require: ['ts-node/register'],
    timeout: 5000
};

if (process.env.CI === "true") {
  console.log("Mocha running in CI.");
  // (For CI) Run mocha and write results to a junit format file:
  module.exports["reporter"] = "xunit";
  module.exports["reporter-option"] = "output=support/junit/mocha.xml";
} else {
  console.log("Mocha running in local dev.");
  // (For development) Run mocha and show the results on stdout:
  module.exports["reporter"] = "spec";
}
