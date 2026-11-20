process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || 'test/tsconfig.json';

module.exports = {
  extension: ['ts'],
  spec: ['test/**/*.test.ts'],
  // These real-Mongo fixtures use isolated commands with required URLs; see test:*:mongo.
  // Real-service suites require the dedicated commands and disposable database URLs.
  ignore: [
    'test/extensions/HookExampleMongo.test.ts',
    'test/http/fastify/securityMongo.test.ts',
    ...(!process.env.HTTP_PILOT_TEST_MONGO_URL || !process.env.HTTP_READ_SOLR_PORT
      ? [
          'test/http/fastify/securityInventoryDifferential.test.ts',
          'test/http/fastify/BrowserSaveWarningsMongo.test.ts',
          'test/http/fastify/RvaVersionMongo.test.ts',
          'test/http/fastify/NotificationOptionsMongo.test.ts',
          'test/http/fastify/RetirementRecordContractsMongo.test.ts',
          'test/http/fastify/RetirementContextMongo.test.ts',
          'test/http/fastify/RetirementAuthorizationMongo.test.ts',
          'test/http/fastify/RetirementDenialsMongo.test.ts',
          'test/http/fastify/RetirementProgressAuthorizationMongo.test.ts',
          'test/http/fastify/RetirementActionAuthorizationMongo.test.ts',
          'test/http/fastify/RetirementBoundaryPolicyMongo.test.ts',
          'test/http/fastify/RetirementSessionAdmissionMongo.test.ts',
          'test/http/fastify/RetirementProviderPolicyMongo.test.ts',
          'test/http/fastify/RetirementRecordBoundaryMongo.test.ts',
          'test/http/fastify/RetirementTargetIsolationMongo.test.ts',
          'test/http/fastify/RetirementCredentialsMongo.test.ts',
          'test/http/fastify/RetirementLatePolicyMongo.test.ts',
          'test/http/fastify/RetirementRequestPolicyMongo.test.ts',
          'test/http/fastify/AuthenticationInputsMongo.test.ts',
        ]
      : []),
    'test/http/fastify/rawSocketMongo.test.ts',
    'test/http/fastify/companionMongo.test.ts',
    'test/http/fastify/CompanionRetirementPolicyMongo.test.ts',
    'test/http/fastify/rawRouteReplacementsMongo.test.ts',
    'test/http/fastify/PilotMongo.test.ts',
    'test/http/fastify/G2Mongo.test.ts',
    'test/http/fastify/G3Mongo.test.ts',
    'test/http/fastify/GeneratedExtensionMongo.test.ts',
    'test/http/fastify/BundledHooksMongo.test.ts',
    'test/http/fastify/PageDifferentialMongo.test.ts',
    'test/http/fastify/BrowserDifferentialMongo.test.ts',
    'test/http/fastify/AssetDifferentialMongo.test.ts',
    'test/http/fastify/BrandingFontDeliveryMongo.test.ts',
    'test/http/fastify/G3BrunoMongo.test.ts',
    'test/http/fastify/MetadataDifferentialMongo.test.ts',
    'test/http/fastify/ReferenceDifferentialMongo.test.ts',
    'test/http/fastify/ReadDifferentialMongo.test.ts',
    'test/http/fastify/IdentityAdministrationDifferentialMongo.test.ts',
    'test/http/fastify/MutationDifferentialMongo.test.ts',
    'test/http/fastify/IntegrationDifferentialMongo.test.ts',
    'test/http/fastify/PreparedRequestDifferentialMongo.test.ts',
    'test/http/fastify/IntegrationBrunoMongo.test.ts',
    'test/http/fastify/IntegrationLifecycleMongo.test.ts',
    'test/http/fastify/MutationLifecycleMongo.test.ts',
    'test/http/fastify/ReadStreamsMongo.test.ts',
    'test/http/fastify/DatastreamDifferentialMongo.test.ts',
    'test/http/fastify/UploadDifferentialMongo.test.ts',
    'test/http/fastify/ProgressDifferentialMongo.test.ts',
    'test/http/fastify/RawShutdownMongo.test.ts',
    'test/http/fastify/RawObservationsMongo.test.ts',
    'test/http/CompanionLifecycleProbe.test.ts',
    'test/http/RecordCreateAuthorizationMongo.test.ts',
    'test/http/IdentityMongo.test.ts',
    'test/queues/QueueMongo.test.ts',
    'test/application/InitializationMongo.test.ts',
    'test/application/ApplicationMongo.test.ts',
    'test/recordTypes/RecordTypesMongo.test.ts',
    'test/recordTypes/CompiledRecordTypesMongo.test.ts',
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
