const sails = require('sails');
const adapter = require('sails-mongo');
// Dedicated disposable datastore required: these conformance suites use migrate: drop.
const url = process.env.RECORD_DEFINITION_TEST_MONGO_URL;
if (!url) throw new Error('Set RECORD_DEFINITION_TEST_MONGO_URL to an isolated test database.');
exports.mochaHooks = {
  beforeAll() {
    this.timeout(90000);
    return new Promise((resolve, reject) =>
      sails.lift(
        {
          bootstrap: done => done(),
          hooks: { grunt: false },
          log: { level: 'silent' },
          models: { datastore: 'mongodb', migrate: 'drop' },
          datastores: {
            mongodb: { adapter, url },
            redboxStorage: { adapter, url },
          },
        },
        error => (error ? reject(error) : resolve())
      )
    );
  },
  afterAll() {
    return new Promise((resolve, reject) => sails.lower(error => (error ? reject(error) : resolve())));
  },
};
