'use strict';

// Real Compose rendering, no daemon, images, network, npm installs or containers.
// Keep this ledger exhaustive: any new base mount needs an explicit disposition.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { mountedSources, verify } = require('./integration-prebuilt-assets.cjs');

const root = path.resolve(__dirname, '../..');
const app = '/opt/redbox-portal';
const revision = '1234567890abcdef1234567890abcdef12345678';
const imageSha = 'a'.repeat(64);
const secretSentinel = 'contract-test-host-credential';
const documentation = fs.readFileSync(path.join(__dirname, 'ci-prebuilt-compose.md'), 'utf8');
const suites = {
  mocha: {
    profile: 'portal',
    retained: ['/tmp/coverage/mocha', `${app}/.tmp/junit/backend-mocha`, '/attachments'],
    baked: {
      '../../test': `${app}/test`,
      '../../support': `${app}/support`,
      '../../typescript': `${app}/typescript`,
      '../../tsconfig.json': `${app}/tsconfig.json`,
      './recordtype-solr-multi-core-example.js': `${app}/config/recordtype.js`,
      './solr-multi-core-example.js': `${app}/config/solr.js`,
      '../../test/resources/config/emailnotification.js': `${app}/config/emailnotification.js`,
      '../resources/development/bootstrap-data': `${app}/bootstrap-data`,
    },
    envChanges: {
      CI: 'true',
      RBPORTAL_REUSE_PREBUILT_ASSETS: 'true',
      RBPORTAL_EXPECTED_IMAGE_REVISION: revision,
      datacite_username: '', datacite_password: '', datacite_doiPrefix: '', datacite_baseUrl: '',
      RUN_LIVE_INTEGRATION_TESTS: 'false',
    },
  },
  playwright: {
    profile: 'ci',
    retained: ['/attachments', '/tmp/coverage/playwright'],
    baked: {
      '../../test': `${app}/test`,
      '../../support': `${app}/support`,
      '../../app.integrationtest.js': `${app}/app.integrationtest.js`,
      '../../test/resources/config/emailnotification.js': `${app}/config/emailnotification.js`,
      '../resources/development/bootstrap-data': `${app}/bootstrap-data`,
      '../../package.json': `${app}/package.json`,
      '../../package-lock.json': `${app}/package-lock.json`,
    },
    envChanges: {
      CI: 'true',
      RBPORTAL_REUSE_PREBUILT_ASSETS: 'true',
      RBPORTAL_EXPECTED_IMAGE_REVISION: revision,
      RBPORTAL_REMOTE_DEBUG: '',
    },
  },
};

function render(suite, { override = true, profile = '*', envChanges = {} } = {}) {
  const args = ['compose', '--env-file', '/dev/null', '--project-name', 'ci-prebuilt-contract',
    '--profile', profile, '-f', `support/integration-testing/docker-compose.${suite}.yml`];
  if (override) args.push('-f', `support/integration-testing/docker-compose.${suite}.prebuilt.yml`);
  args.push('config', '--format', 'json');
  // No ambient COMPOSE_FILE/PROFILES or .env; deliberate hostile host settings.
  const env = {
    PATH: process.env.PATH,
    RBPORTAL_IMAGE: 'redbox-portal:ordinary-test-fixture',
    RBPORTAL_CI_IMAGE_SHA256: imageSha,
    RBPORTAL_EXPECTED_IMAGE_REVISION: revision,
    CI: 'false', UID: '1000', GID: '1000',
    RBPORTAL_REUSE_PREBUILT_ASSETS: 'false',
    RBPORTAL_REMOTE_DEBUG: '0.0.0.0:9229',
    RBPORTAL_MOCHA_TEST_PATHS: 'test/integration/**/*.test.ts',
    RUN_LIVE_INTEGRATION_TESTS: 'true',
    datacite_username: secretSentinel, datacite_password: secretSentinel,
    datacite_doiPrefix: secretSentinel, datacite_baseUrl: secretSentinel,
    CODECOV_TOKEN: secretSentinel, AWS_SECRET_ACCESS_KEY: secretSentinel,
    UPPY_COMPANION_SECRET: secretSentinel, UPPY_GOOGLE_SECRET: secretSentinel,
    UPPY_ONEDRIVE_SECRET: secretSentinel,
    ...envChanges,
  };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key];
  return spawnSync('docker', args, {
    cwd: root, env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30_000,
  });
}

function config(suite, options) {
  const result = render(suite, options);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

for (const [suite, contract] of Object.entries(suites)) {
  test(`${suite}: rendered immutable Compose contract`, async t => {
    const base = config(suite, { override: false });
    const merged = config(suite);
    const portal = merged.services.redboxportal;
    const basePortal = base.services.redboxportal;

    await t.test('only the chosen portal settings change; every other service/profile is identical', () => {
      const { redboxportal: ignoredBase, ...baseServices } = base.services;
      const { redboxportal: ignoredMerged, ...mergedServices } = merged.services;
      assert.deepEqual(mergedServices, baseServices);
      const { services: ignoredBaseServices, ...baseTop } = base;
      const { services: ignoredMergedServices, ...mergedTop } = merged;
      assert.deepEqual(mergedTop, baseTop);
      const allowed = new Set(['image', 'pull_policy', 'environment', 'volumes']);
      const rest = service => Object.fromEntries(Object.entries(service).filter(([key]) => !allowed.has(key)));
      assert.deepEqual(rest(portal), rest(basePortal));
      assert.deepEqual(portal.profiles, [contract.profile]);
      assert.equal(portal.image, `sha256:${imageSha}`);
      assert.equal(portal.pull_policy, 'never');
      assert.deepEqual(portal.environment, { ...basePortal.environment, ...contract.envChanges });
    });

    await t.test('every removed mount has a traced bake requirement; only original output mounts remain', () => {
      assert.deepEqual(portal.volumes, basePortal.volumes.filter(v => contract.retained.includes(v.target)));
      assert.deepEqual(portal.volumes.map(v => v.target).sort(), [...contract.retained].sort());
      const removed = basePortal.volumes.filter(v => !contract.retained.includes(v.target));
      const required = Object.entries(contract.baked).map(([source, target]) => ({
        source: path.resolve(root, 'support/integration-testing', source), target,
      }));
      assert.deepEqual(removed.map(({ source, target }) => ({ source, target })).sort((a, b) => a.target.localeCompare(b.target)),
        required.sort((a, b) => a.target.localeCompare(b.target)));
      for (const [source, target] of Object.entries(contract.baked)) {
        assert.ok(documentation.includes(`\`${source}\``), `Document removed source ${source}`);
        assert.ok(documentation.includes(`\`${target}\``), `Document required image target ${target}`);
      }
      assert.ok(portal.volumes.every(v => v.type === 'bind' && !v.read_only));
      assert.equal(portal.secrets, undefined);
      assert.equal(portal.configs, undefined);
      assert.equal(portal.env_file, undefined);
      assert.ok(!JSON.stringify(portal).includes(secretSentinel));
      // Exercise the actual startup verifier's mount classifier with rendered targets.
      const mountinfo = ['1 0 0:1 / / rw - overlay overlay rw', ...portal.volumes.map((v, i) =>
        `${i + 2} 1 0:2 / ${v.target} rw - ext4 /dev/test rw`)].join('\n');
      assert.equal(mountedSources(app, mountinfo), false);
      assert.equal(mountedSources(app, `${mountinfo}\n99 1 0:2 / ${app}/support ro - ext4 /dev/test ro`), true);
    });

    await t.test('rendering each selected or development profile preserves its service graph', () => {
      const selected = config(suite, { profile: contract.profile });
      assert.deepEqual(selected.services.redboxportal, portal);
      const devBase = config(suite, { profile: 'mount', override: false });
      const devMerged = config(suite, { profile: 'mount' });
      assert.deepEqual(devMerged, devBase);
      assert.equal(devMerged.services.redboxportal, undefined);
      assert.equal(devMerged.services['redboxportal-mount'].environment.RBPORTAL_REUSE_PREBUILT_ASSETS, undefined);
      if (suite === 'playwright') {
        assert.deepEqual(selected.services.playwright, base.services.playwright);
        assert.equal(selected.services.playwright.volumes[0].source, root);
        assert.equal(selected.services.playwright.volumes[0].target, app);
      }
    });

    for (const value of [undefined, '']) {
      await t.test(`missing/empty revision fails closed (${String(value)})`, () => {
        const result = render(suite, { envChanges: { RBPORTAL_EXPECTED_IMAGE_REVISION: value } });
        assert.ifError(result.error);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /RBPORTAL_EXPECTED_IMAGE_REVISION/);
        assert.equal(result.stdout, '');
      });
      await t.test(`missing/empty image ID fails closed (${String(value)})`, () => {
        const result = render(suite, { envChanges: { RBPORTAL_CI_IMAGE_SHA256: value } });
        assert.ifError(result.error);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /RBPORTAL_CI_IMAGE_SHA256/);
        assert.equal(result.stdout, '');
      });
    }

    await t.test('expected revision is independent of the candidate image ID', () => {
      const differentRevision = 'f'.repeat(40);
      const candidate = config(suite, { envChanges: { RBPORTAL_EXPECTED_IMAGE_REVISION: differentRevision } });
      assert.equal(candidate.services.redboxportal.image, `sha256:${imageSha}`);
      assert.equal(candidate.services.redboxportal.environment.RBPORTAL_EXPECTED_IMAGE_REVISION, differentRevision);
    });

    await t.test('base alone is usable without immutable inputs and never opts into reuse', () => {
      const ordinary = config(suite, { override: false, envChanges: {
        RBPORTAL_CI_IMAGE_SHA256: undefined, RBPORTAL_EXPECTED_IMAGE_REVISION: undefined,
      } });
      assert.equal(ordinary.services.redboxportal.environment.RBPORTAL_REUSE_PREBUILT_ASSETS, undefined);
      assert.equal(ordinary.services.redboxportal.image, 'redbox-portal:ordinary-test-fixture');
    });
  });
}

test('image verifier rejects abbreviated, uppercase and non-revision input before reading metadata', () => {
  for (const invalid of ['', 'develop', 'abc123', 'A'.repeat(40)]) {
    assert.throws(() => verify('/path-that-must-not-be-read', invalid), /full lowercase Git revision/);
  }
});

test('existing package scripts and CircleCI do not enable these opt-in overrides', () => {
  const scripts = JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts);
  const circleci = fs.readFileSync(path.join(root, '.circleci/config.yml'), 'utf8');
  for (const suite of Object.keys(suites)) {
    const override = `docker-compose.${suite}.prebuilt.yml`;
    assert.ok(!scripts.includes(override), `${override} must remain opt-in in package scripts`);
    assert.ok(!circleci.includes(override), `${override} must remain opt-in in CircleCI`);
  }
});
