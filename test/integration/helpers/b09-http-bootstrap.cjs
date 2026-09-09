// Disposable mounted application: generated discovery and production middleware/policies.
// Only authentication is a fixture; all Admin/draft/secret persistence is real.
const sails = require('sails');
const core = require('@researchdatabox/redbox-core');
const adapter = require('sails-mongo');
const fs = require('node:fs/promises');
const path = require('node:path');
let appPath;
const { Passport } = require('passport');
const url = process.env.RECORD_DEFINITION_TEST_MONGO_URL;
if (!url) throw new Error('A disposable Mongo database is required.');
exports.mochaHooks = {
  async beforeAll() {
    this.timeout(90000);
    await fs.mkdir(path.join(process.cwd(), '.tmp'), { recursive: true });
    appPath = await fs.mkdtemp(path.join(process.cwd(), '.tmp/b09-generated-app-'));
    await fs.copyFile('package.json', path.join(appPath, 'package.json'));
    await fs.symlink(path.join(process.cwd(), 'node_modules'), path.join(appPath, 'node_modules'));
    await core.generateAllShims(appPath, { forceRegenerate: true });
    const passport = new Passport();
    passport.use('bearer', {
      authenticate() {
        this.fail();
      },
    });
    const http = core.Config.http;
    await new Promise((resolve, reject) =>
      sails.lift(
        {
          appPath,
          b09GeneratedNativeGate: true,
          port: 15909,
          bootstrap: done => done(),
          hooks: { grunt: false },
          log: { level: 'silent' },
          models: { datastore: 'mongodb', migrate: 'drop' },
          datastores: { mongodb: { adapter, url }, redboxStorage: { adapter, url } },
          passport,
          redboxSession: { adapter: 'memory', secret: 'b09-disposable-test-session', cookie: { secure: false } },
          security: { csrf: true },
          http: {
            middleware: {
              ...http.middleware,
              order: http.middleware.order.flatMap(name =>
                name === 'passportSession' ? [name, 'b09FixtureUser'] : [name]
              ),
              b09FixtureUser(req, res, next) {
                const brand = req.headers['x-b09-brand'];
                const role = req.headers['x-b09-role'];
                if (brand && role) {
                  req.user = {
                    id: 'b09-fixture-user',
                    roles: [{ id: req.headers['x-b09-role-id'] ?? role, name: role, branding: brand }],
                  };
                  req.isAuthenticated = () => true;
                }
                next();
              },
            },
          },
        },
        error => (error ? reject(error) : resolve())
      )
    );
  },
  async afterAll() {
    await new Promise(resolve => sails.lower(resolve));
    if (appPath) await fs.rm(appPath, { recursive: true, force: true });
  },
};
