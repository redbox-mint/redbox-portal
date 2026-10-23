process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || 'test/tsconfig.json';

module.exports = {
  extension: ['ts'],
  spec: ['test/**/*.test.ts'],
  // These real-Mongo fixtures use isolated commands with required URLs; see test:*:mongo.
  // Standalone tests and the compiled legacy host cannot share the global legacy setup.
  ignore: [
    'test/http/RecordCreateAuthorizationMongo.test.ts',
    'test/http/RecordReadsMongo.test.ts',
    'test/http/QueryReadsMongo.test.ts',
    'test/http/AuthenticationMongo.test.ts',
    'test/http/OidcMongo.test.ts',
    'test/http/CsrfMongo.test.ts',
    'test/http/ConfigurationMongo.test.ts',
    'test/http/BrunoPilotMongo.test.ts',
    'test/http/CompiledPilotMongo.test.ts',
    'test/http/PilotFailuresMongo.test.ts',
    'test/http/RecordTypesMongo.test.ts',
    'test/http/MiddlewareMongo.test.ts',
    'test/http/IdentityMongo.test.ts',
    'test/queues/QueueMongo.test.ts',
    'test/application/InitializationMongo.test.ts',
    'test/application/ApplicationMongo.test.ts',
    'test/recordTypes/RecordTypesMongo.test.ts',
    'test/compat/SailsRecordTypesMongo.test.ts',
  ],
  // Native TypeScript stripping (including Node 26) conflicts with ts-node's CommonJS
  // loader. Preload Chai as well so legacy fire-and-forget dynamic imports do
  // not race the suite's static Chai imports while Mocha loads test files.
  'node-option': ['no-experimental-strip-types'],
  require: ['ts-node/register/transpile-only', 'chai', 'test/setup.ts'],
  timeout: 5000,
};

if (process.env.CI === 'true') {
  console.log('Mocha running in CI.');
  // (For CI) Run mocha and write results to a junit format file:
  module.exports['reporter'] = 'mocha-junit-reporter';
  module.exports['reporter-option'] = 'mochaFile=support/junit/mocha.xml';
} else {
  console.log('Mocha running in local dev.');
  // (For development) Run mocha and show the results on stdout:
  module.exports['reporter'] = 'spec';
}
