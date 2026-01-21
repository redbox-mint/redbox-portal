module.exports = {
    extension: ['ts'],
    spec: ['test/**/*.test.ts'],
    require: ['ts-node/register', 'test/setup.ts'],
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
