'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createServer } = require('node:http');
const { EventEmitter, once } = require('node:events');
const {
  collectInventory,
  validateInventory,
  checkInventory,
  identity,
  inspectBundledRegistration,
} = require('./generate-FM-002.cjs');
const root = path.resolve(__dirname, '../../../..');
const inventory = collectInventory();
const filename = path.join(__dirname, 'FM-002.inventory.json');
const allRows = () => [...inventory.routes, ...inventory.integrations, ...inventory.examples, ...inventory.bundled];
const changed = () => structuredClone(inventory);
const core = path.join(root, 'packages/redbox-core/src');

describe('FM-002 source-derived routes and identities', () => {
  it('reproduces the retained inventory byte for byte', () => checkInventory(inventory, filename));

  it('requires one real task and executable test references on every supported entry', () => {
    assert.equal(validateInventory(inventory), true);
    for (const row of allRows()) {
      assert.match(row.ownerTask, /^FM-\d{3}$/);
      assert(row.testReferences.every(reference => /\.(?:test\.(?:ts|cjs)|cjs)$/.test(reference.file)));
    }
  });

  it('rejects missing, unknown and multiple owners', () => {
    for (const value of [undefined, 'FM-999', ['FM-023', 'FM-024']]) {
      const copy = changed();
      copy.routes[0].ownerTask = value;
      assert.throws(() => validateInventory(copy), /single task owner/);
    }
  });

  it('rejects missing tests and duplicate stable identities', () => {
    for (const value of [undefined, []]) {
      const missing = changed();
      missing.routes[0].testReferences = value;
      assert.throws(() => validateInventory(missing), /Missing executable/);
    }
    for (const file of ['missing.test.cjs', 'support/specs/fastify-migration/tasks.md']) {
      const missing = changed();
      missing.integrations[0].testReferences[0].file = file;
      assert.throws(() => validateInventory(missing), /Missing test|Invalid executable/);
    }
    const duplicate = changed();
    duplicate.routes[1].name = duplicate.routes[0].name;
    assert.throws(() => validateInventory(duplicate), /Duplicate stable identity/);
  });

  it('detects declaration/metadata drift without rewriting evidence', () => {
    const copy = changed();
    copy.routes[0].controller = 'unreviewed-change';
    assert.throws(() => checkInventory(copy, filename), /Inventory drift/);
  });

  it('matches the actual API registry with no copied, missing or duplicate API bindings', () => {
    const api = require(path.join(core, 'api-routes/route-registry.ts')).registerCoreApiRoutes();
    const key = route => [route.method, route.path, route.controller, route.action].join(' ');
    assert.deepEqual(
      inventory.routes
        .filter(route => route.kind === 'api')
        .map(route => key(route.original))
        .sort(),
      api.map(key).sort()
    );
    assert.equal(api.length, 152);
    for (const row of inventory.routes.filter(route => route.kind === 'api')) {
      const exported = require(path.join(root, row.apiDeclaration.file))[row.apiDeclaration.export];
      const source = row.apiDeclaration.index === undefined ? exported : exported[row.apiDeclaration.index];
      assert.equal(key(source), key(row.original));
      assert.deepEqual(Object.keys(row.original.responses ?? {}), Object.keys(source.responses ?? {}));
      assert.deepEqual(
        Object.keys(row.original.request ?? {}),
        Object.keys(source.request ?? {}).filter(name => source.request[name] !== undefined)
      );
    }
  });

  it('resolves every declaration reference, distinguishing scalar exports from array entries', () => {
    for (const row of inventory.routes) {
      const exported = require(path.join(root, row.source.file))[row.source.export];
      assert.equal(Array.isArray(exported), row.source.index !== undefined, row.name);
      const source = row.source.index === undefined ? exported : exported[row.source.index];
      for (const field of ['method', 'path', 'controller', 'action'])
        assert.equal(source[field], row.original[field], `${row.name}: ${field}`);
      assert.equal(
        row.source.line,
        fs
          .readFileSync(path.join(root, row.source.file), 'utf8')
          .split('\n')
          .findIndex(line => new RegExp(`\\b${row.source.export}\\s*=`).test(line)) + 1
      );
    }
  });

  it('preserves the core replacement names already exposed to installed extensions', () => {
    const { portalOwnedHttpRoutes } = require(path.join(core, 'http/express/ownedRoutes.ts'));
    const expected = new Set(inventory.routes.flatMap(route => route.replacementTargets.map(target => target.name)));
    for (const routePath of ['/companion', '/companion/{*companionPath}'])
      for (const method of ['get', 'head', 'post', 'put', 'patch', 'delete', 'options'])
        expected.add(identity(method, routePath));
    // The old offline manifest overstates health HEAD coverage. Actual host
    // middleware is GET-only; retain those legacy collision reservations here.
    for (const routePath of ['/healthz', '/readyz'])
      for (const method of ['get', 'head']) expected.add(identity(method, routePath));
    const actual = portalOwnedHttpRoutes({
      server: { rootContext: '' },
      companion: { enabled: true, route: '/companion' },
    });
    assert.deepEqual([...expected].sort(), actual.map(route => route.name).sort());
  });

  it('freezes explicit OIDC HEAD denial independently from the GET identity', () => {
    const head = inventory.routes.find(route => route.method === 'head');
    assert.equal(head.name, 'core-http-head-e3ee2548904017ea');
    assert.equal(head.action, 'disallowedHeadRequestHandler');
    assert.equal(head.head.behavior, 'explicit-405');
    const get = inventory.routes.find(route => route.method === 'get' && route.path === head.path);
    assert.equal(get.head.explicitTarget, head.name);
    assert(!get.replacementTargets.some(target => target.method === 'head'));
    const contract = inventory.integrations.find(row => row.name === 'extension-http-contract');
    assert(contract.testReferences.some(reference => reference.file.endsWith('head-routes.test.ts')));
  });

  it('records each administration GET HEAD denial after its applicable guards', () => {
    const routes = inventory.routes.filter(route => route.source.export === 'adminOperationRoutes');
    const gets = routes.filter(route => route.method === 'get');
    assert.equal(gets.length, 3);
    for (const route of gets) {
      assert.equal(route.head.behavior, 'explicit-405', route.path);
      assert.equal(route.head.status, 405);
      assert.equal(route.head.allow, 'GET');
      assert.equal(route.head.explicitTarget, null, 'Denial is inside the GET adapter, not a separate declaration');
      assert.deepEqual(route.head.after, [
        'effectivePolicies',
        ...(route.action === 'refreshCachedResources' ? ['apiProtect'] : []),
      ]);
      assert.equal(route.head.before, 'request context, administrator/domain checks, validation and action work');
      assert(route.replacementTargets.some(target => target.method === 'head'));
    }
    assert.equal(routes.find(route => route.method === 'post').head.behavior, 'not-handled');
  });

  it('verifies all three administration HEAD denials over HTTP, including policy/CSRF precedence', async () => {
    const express = require(require.resolve('express', { paths: [core] }));
    const { mountAdminOperationRoutes, adminOperationRoutes } = require(
      path.join(core, 'http/express/adminOperations.ts')
    );
    const app = express();
    const calls = [];
    const unexpected = () => assert.fail('HEAD must not invoke administration operations');
    mountAdminOperationRoutes(app, {
      settings: { getMaskedAppConfigurationForBrand: unexpected, createOrUpdateConfig: unexpected },
      reloadTranslations: unexpected,
      invalidateAssets: unexpected,
      audit: unexpected,
      log: { error: unexpected },
      policyConfiguration: { '*': ['inventory-guard'] },
      policies: {
        'inventory-guard': (req, res, next) => {
          calls.push('effectivePolicies');
          if (req.get('X-Deny-Policy')) res.status(403).end();
          else next();
        },
      },
      csrf: {
        apiProtect: (req, res, next) => {
          calls.push('apiProtect');
          if (req.get('X-Deny-Csrf')) res.status(403).end();
          else next();
        },
      },
    });
    const server = createServer(app);
    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const base = `http://127.0.0.1:${server.address().port}`;
      for (const route of adminOperationRoutes.filter(route => route.method === 'get')) {
        const url =
          base + route.path.replace(':branding', 'default').replace(':portal', 'rdmp').replace(':configKey', 'key');
        const expectedGuards = ['effectivePolicies', ...(route.action === 'getAppConfig' ? [] : ['apiProtect'])];
        calls.length = 0;
        const response = await fetch(url, { method: 'HEAD' });
        assert.equal(response.status, 405, route.path);
        assert.equal(response.headers.get('allow'), 'GET');
        assert.equal(await response.text(), '');
        assert.deepEqual(calls, expectedGuards);
        calls.length = 0;
        const policyDenied = await fetch(url, { method: 'HEAD', headers: { 'X-Deny-Policy': '1' } });
        assert.equal(policyDenied.status, 403);
        assert.equal(policyDenied.headers.get('allow'), null);
        assert.deepEqual(calls, ['effectivePolicies']);
        if (route.action === 'refreshCachedResources') {
          calls.length = 0;
          const csrfDenied = await fetch(url, { method: 'HEAD', headers: { 'X-Deny-Csrf': '1' } });
          assert.equal(csrfDenied.status, 403);
          assert.equal(csrfDenied.headers.get('allow'), null);
          assert.deepEqual(calls, expectedGuards);
        }
      }
    } finally {
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
  });

  it('records explicit font HEAD metadata handling and its existing conditional-response coverage', () => {
    const font = inventory.routes.find(route => route.source.export === 'fontDeliveryRoute');
    assert.equal(font.head.behavior, 'explicit-metadata-only');
    assert.match(font.head.details, /brand\/hash.*304.*200.*no body/);
    assert.equal(font.head.reference.export, 'BrandingDelivery');
    assert(font.testReferences.some(reference => reference.file.endsWith('BrandingFontDelivery.test.ts')));
  });

  it('records Companion upgrade access separately for tracked uploads and format-checked OAuth callbacks', () => {
    const upgrade = inventory.integrations.find(row => row.name === 'core-companion-upgrade');
    assert.deepEqual(upgrade.access.common, ['not closing', 'ready', 'canonical origin']);
    assert.deepEqual(upgrade.access.byPath, [
      { path: upgrade.path[0], trackedTransferRequired: true, tokenPattern: '[^/]+' },
      { path: upgrade.path[1], trackedTransferRequired: false, tokenPattern: '[A-Za-z0-9_-]{16,256}' },
    ]);
    assert.equal(upgrade.access.sharedSecret, 'not a user identity');
  });

  it('verifies the Companion forwarding gate accepts callbacks with zero tracked transfers', () => {
    const { CompanionUploads } = require(path.join(core, 'http/express/companion.ts'));
    let ready = true;
    const uploads = new CompanionUploads({
      owner: {},
      path: '/companion',
      options: {
        server: { implicitPath: '/portal', path: '/companion' },
        secret: 'x'.repeat(32),
        metrics: false,
        uploadUrls: ['http://uploads.invalid'],
      },
      origins: ['http://portal.invalid'],
      isReady: () => ready,
    });
    // Exercise the actual admission function without starting process-lifetime
    // provider resources. The bridge records forwarding, not provider acceptance.
    const bridge = new EventEmitter();
    Reflect.set(uploads, 'bridge', bridge);
    const transfers = Reflect.get(uploads, 'transfers');
    const events = [];
    bridge.on('upgrade', (...args) => events.push(['upgrade', ...args]));
    const attempt = (relative, origin = 'http://portal.invalid') => {
      events.length = 0;
      let denied;
      let destroyed = false;
      const socket = Object.assign(new EventEmitter(), {
        writable: true,
        write: message => {
          denied = message;
        },
        destroy: () => {
          destroyed = true;
          socket.emit('close');
        },
      });
      const request = { url: '/portal/companion' + relative, headers: origin === null ? {} : { origin } };
      const head = Buffer.alloc(0);
      Reflect.get(uploads, 'upgrade')(request, socket, head);
      if (events.length) {
        assert.deepEqual(events, [['upgrade', request, socket, head]]);
        assert.equal(denied, undefined);
        assert.equal(destroyed, false);
        socket.destroy();
        return true;
      }
      assert.match(denied, /^HTTP\/1\.1 403 Forbidden/);
      assert.equal(destroyed, true);
      return false;
    };
    assert.equal(transfers.size, 0);
    for (const token of ['a'.repeat(16), 'Z_9-'.repeat(64)])
      assert.equal(attempt('/api2/auth-callback/token/' + token), true);
    assert.equal(transfers.size, 0);
    for (const token of ['a'.repeat(15), 'a'.repeat(257), 'invalid.token-1234', 'a'.repeat(16) + '/extra'])
      assert.equal(attempt('/api2/auth-callback/token/' + token), false);
    assert.equal(attempt('/api/untracked-token'), false);
    transfers.set('tracked-token', { finish() {}, start() {} });
    assert.equal(attempt('/api/tracked-token'), true);
    for (const relative of ['/api/tracked-token', '/api2/auth-callback/token/' + 'a'.repeat(16)]) {
      assert.equal(attempt(relative, 'http://attacker.invalid'), false);
      assert.equal(attempt(relative, null), false);
      ready = false;
      assert.equal(attempt(relative), false);
      ready = true;
    }
    uploads.quiesce();
    assert.equal(attempt('/api/tracked-token'), false);
    assert.equal(attempt('/api2/auth-callback/token/' + 'a'.repeat(16)), false);
  });

  it('distinguishes public Socket.IO client assets, origin-checked transport and authenticated namespace/rooms', () => {
    const progress = inventory.integrations.find(row => row.name === 'core-progress-transport');
    assert.equal(
      progress.access.clientAssets,
      'public provider client JS and source maps; no origin or grant required'
    );
    assert.equal(progress.access.transportHandshake, 'not closing; canonical origin; no grant required yet');
    assert.equal(progress.access.namespaceConnection, 'one-use expiring grant; fresh identity and brand authorization');
    assert.equal(progress.access.rooms, 'fresh identity and brand/room authorization on subscribe and emit');
  });

  it('verifies Socket.IO client JS is public while transport admission requires canonical origin before any grant', async () => {
    const { ProgressSockets } = require(path.join(core, 'http/express/progressSockets.ts'));
    const server = createServer((_req, res) => res.writeHead(404).end());
    const progress = new ProgressSockets({
      owner: {},
      path: '/portal-socket.io',
      origins: ['http://portal.invalid'],
      records: {},
      progress: {},
      authenticate: () => assert.fail('Transport handshake must not authenticate a namespace'),
    });
    try {
      progress.attach(server);
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const base = `http://127.0.0.1:${server.address().port}/portal-socket.io`;
      const script = await fetch(base + '/socket.io.js');
      assert.equal(script.status, 200);
      assert.match(await script.text(), /Socket\.IO/);
      const rejected = await fetch(base + '/?EIO=4&transport=polling');
      assert.equal(rejected.status, 403);
      await rejected.text();
      const accepted = await fetch(base + '/?EIO=4&transport=polling', {
        headers: { Origin: 'http://portal.invalid' },
      });
      assert.equal(accepted.status, 200);
      assert.match(await accepted.text(), /^0\{"sid":/);
      assert.equal(Reflect.get(progress, 'grants').size, 0);
      assert.equal(Reflect.get(progress, 'connections').size, 0);
    } finally {
      await progress.close();
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
  });

  it('retains attachment HEAD fallthrough and TUS protection on all methods', () => {
    const attachments = inventory.routes.filter(
      route => route.source.export === 'datastreamReadRoutes' && route.action === 'doAttachment'
    );
    assert.equal(attachments.length, 2);
    for (const route of attachments) {
      const tus = inventory.routes.find(other => other.name === route.head.explicitTarget);
      assert.equal(tus.source.export, 'resumableUploadRoutes');
      assert.match(tus.csrf.effective, /ALL methods/);
      assert.equal(tus.ownerTask, 'FM-034');
      assert.equal(route.ownerTask, 'FM-033');
    }
  });

  it('retains original API pattern spelling alongside effective Express patterns', () => {
    const changedPatterns = inventory.routes.filter(route => route.original.path !== route.path);
    assert(changedPatterns.some(route => route.original.path.includes(':key*') && route.path.includes('*key')));
    assert(
      changedPatterns.some(
        route => route.original.path.endsWith('datastream*') && route.path.endsWith('datastream{*tail}')
      )
    );
  });

  it('does not mistake declared csrf:false or public page mappings for bypassing runtime guards', () => {
    const apiWrite = inventory.routes.find(route => route.kind === 'api' && route.method === 'post');
    assert.equal(apiWrite.csrf.declared, false);
    assert.equal(apiWrite.csrf.effective, 'apiProtect');
    const refresh = inventory.routes.find(
      route => route.source.export === 'adminOperationRoutes' && route.action === 'refreshCachedResources'
    );
    assert.equal(refresh.method, 'get');
    assert.equal(refresh.csrf.effective, 'apiProtect');
    const home = inventory.routes.find(route => route.source.export === 'pageRoutes' && route.path.endsWith('/home'));
    assert.equal(home.access.declaredAccess, 'public');
    assert.deepEqual(home.access.effectivePolicies, ['nocache', 'brandingandportal', 'browseractor', 'checkauth']);
    assert(
      inventory.routes.filter(route => route.kind === 'api').every(route => route.access.effectivePolicies.length > 0)
    );
  });

  it('includes health, assets, fallback, raw, polling/client assets, both Companion upgrades and extension stages', () => {
    for (const name of [
      'core-static-artifacts',
      'core-page-not-found',
      'core-unmatched',
      'core-progress-transport',
      'core-companion-http-0',
      'core-companion-http-1',
      'core-companion-upgrade',
      'core-authentication-providers',
      'core-multipart-parser',
      'extension-http-contract',
      'extension-middleware-stages',
      'extension-api-metadata',
    ])
      assert(
        inventory.integrations.some(row => row.name === name),
        name
      );
    assert.equal(inventory.integrations.filter(row => row.kind === 'health').length, 2);
    assert.equal(inventory.integrations.find(row => row.name === 'core-companion-upgrade').path.length, 2);
    assert(
      inventory.integrations.filter(row => row.kind === 'health').every(row => row.head.startsWith('not intercepted'))
    );
  });

  it('audits all three bundled registrations and preserves the opt-in example name', () => {
    assert.deepEqual(inventory.bundled.map(row => row.provider).sort(), [
      'redbox-hook-dev',
      'sails-hook-redbox-pdfgen',
      'sails-hook-redbox-storage-mongo',
    ]);
    assert(inventory.bundled.every(row => Object.keys(row.httpContributions).length === 0));
    assert.deepEqual(
      inventory.examples.map(route => route.name),
      ['example-health']
    );
    assert.equal(inventory.routes.length, 335);
  });

  it('requires explicit inventory of new bundled HTTP contributions, including quoted fields', () => {
    for (const field of ['routes', 'handlers', 'middleware', 'integrations', 'views', 'assets'])
      for (const name of [field, JSON.stringify(field)])
        assert.throws(
          () =>
            inspectBundledRegistration(
              'fixture.ts',
              `export function registerRedboxExtension() { return { apiVersion: 1, ${name}: [] }; }`
            ),
          /Inventory new bundled HTTP contributions/
        );
  });

  it('fails closed on bundled spreads, computed fields and unrecognized registration returns', () => {
    for (const source of [
      'export function registerRedboxExtension() { return { apiVersion: 1, ...contributions }; }',
      'export function registerRedboxExtension() { return { [kind]: contributions }; }',
      'export function registerRedboxExtension() { return declaration; }',
      'export function registerRedboxExtension() { if (enabled) return { routes: [] }; return { apiVersion: 1 }; }',
      'export const registerRedboxExtension = () => ({ routes: [] });',
    ])
      assert.throws(() => inspectBundledRegistration('fixture.ts', source), /Inspect/);
    assert.deepEqual(
      inspectBundledRegistration(
        'fixture.ts',
        'export function registerRedboxExtension() { return { apiVersion: 1, modules: [{ create: () => { return {}; } }] }; }'
      ),
      {}
    );
  });

  it('fingerprints source inputs so unchanged route counts cannot hide metadata changes', () => {
    for (const [file, expected] of Object.entries(inventory.sourceHashes))
      assert.equal(
        createHash('sha256')
          .update(fs.readFileSync(path.join(root, file)))
          .digest('hex'),
        expected
      );
    assert(Object.keys(inventory.sourceHashes).length > 50);
  });
});
