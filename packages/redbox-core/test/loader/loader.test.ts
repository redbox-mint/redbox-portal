import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { loadExtensions, resolveExtensions, type ExtensionProvider, type RedboxExtension } from '../../src/extensions';
import { loadStartupConfiguration, resolveStartupConfiguration } from '../../src/configuration';
import { FormConfigExports } from '../../src/form-config';
const { reconcile } = require('../../../../support/migrations/retire-v5-shims.cjs');

// This suite follows the retired loader's contracts to their v6 owners: explicit
// installed declarations, pure configuration and opt-in offline reconciliation.
describe('extension loading without shim generation', () => {
  let directory: string;
  let dependencies: Record<string, string>;
  async function manifest(priority: string[] = []) {
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ dependencies, hookLoadPriority: priority }));
  }
  async function write(file: string, source: string) {
    const target = path.join(directory, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, source);
  }
  async function extension(name: string, source = 'exports.registerRedboxExtension = () => ({apiVersion: 1});') {
    await write(`node_modules/${name}/package.json`, JSON.stringify({ name, version: '1.0.0', main: 'index.js', redbox: { extension: '.' } }));
    await write(`node_modules/${name}/index.js`, source);
    dependencies[name] = '1.0.0';
    await manifest();
  }
  function provider(name: string, declaration: Partial<RedboxExtension>): ExtensionProvider {
    return { name, root: directory, declaration: { apiVersion: 1, ...declaration } };
  }
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-retired-loader-'));
    dependencies = {};
    await manifest();
  });
  afterEach(async () => fs.rm(directory, { recursive: true, force: true }));

  describe('conservative generated-file reconciliation', () => {
    const file = 'api/services/ExampleService.js';
    const source = '// trusted generated output\n';
    function inventory() { return { files: [{ file, generatedHeader: true, tracked: false, sha256: createHash('sha256').update(source).digest('hex') }] }; }
    it('does not create a missing generated file', async () => {
      assert.deepEqual(await reconcile(directory, inventory(), true), [{ file, state: 'missing' }]);
      await assert.rejects(fs.access(path.join(directory, file)), { code: 'ENOENT' });
    });
    it('preserves differing content for manual migration', async () => {
      await write(file, source + '// authored change\n');
      assert.deepEqual(await reconcile(directory, inventory(), true), [{ file, state: 'preserved' }]);
      assert.equal(await fs.readFile(path.join(directory, file), 'utf8'), source + '// authored change\n');
    });
    it('leaves identical file contents and timestamps unchanged during inspection', async () => {
      await write(file, source);
      const time = new Date('2020-01-01T00:00:00Z');
      await fs.utimes(path.join(directory, file), time, time);
      assert.deepEqual(await reconcile(directory, inventory()), [{ file, state: 'exact' }]);
      assert.equal((await fs.stat(path.join(directory, file))).mtimeMs, time.getTime());
    });
  });

  describe('pure configuration contributions', () => {
    function resolve(core: Record<string, unknown>, extension: Record<string, unknown>) {
      return resolveStartupConfiguration({ schema: z.record(z.string(), z.unknown()), core: { source: 'core', values: core }, extensions: { providers: [provider('institution', { config: extension })] } });
    }
    it('replaces branding menu/panel arrays without retaining displaced privileges', () => {
      const result = resolve({ brandingConfigurationDefaults: { menu: { items: [{ id: 'home' }, { id: 'admin', requiredRoles: ['Admin'] }] }, homePanels: { panels: [] } } }, { brandingConfigurationDefaults: { menu: { items: [{ id: 'home' }, { id: 'plan' }] }, homePanels: { panels: [{ id: 'plan' }] } } });
      assert.deepEqual(result.brandingConfigurationDefaults, { menu: { items: [{ id: 'home' }, { id: 'plan' }] }, homePanels: { panels: [{ id: 'plan' }] } });
    });
    it('merges Agenda jobs by name and preserves options without inventing a schedule', () => {
      const result = resolve({ agendaQueue: { jobs: { audit: { fnName: 'audit.store', options: { lockLifetime: 30000 } }, history: { fnName: 'history.move', schedule: { method: 'every', intervalOrSchedule: '5 minutes' } } } } }, { agendaQueue: { jobs: { audit: { fnName: 'audit.store', options: { concurrency: 1 } }, figshare: { fnName: 'figshare.sync', schedule: { method: 'every', intervalOrSchedule: '50 minutes' } } } } }) as any;
      assert.deepEqual(Object.keys(result.agendaQueue.jobs).sort(), ['audit', 'figshare', 'history']);
      assert.deepEqual(result.agendaQueue.jobs.audit, { fnName: 'audit.store', options: { lockLifetime: 30000, concurrency: 1 } });
      assert.deepEqual(result.agendaQueue.jobs.history.schedule, { method: 'every', intervalOrSchedule: '5 minutes' });
    });
    it('loads dotted scoped package names without generated JavaScript identifiers', async () => {
      await extension('@org/test.hook', 'exports.registerRedboxExtension = () => ({apiVersion: 1, config: { appmode: { value: "institution" } }});');
      const result = await loadExtensions(directory);
      assert.equal(result.providers[0].name, '@org/test.hook');
      assert.deepEqual(result.providers[0].declaration.config, { appmode: { value: 'institution' } });
      await assert.rejects(fs.access(path.join(directory, 'config')), { code: 'ENOENT' });
    });
  });

  describe('retired generation triggers', () => {
    for (const [description, environment, marker] of [
      ['development', 'development', false], ['production', 'production', false], ['a regeneration marker', 'production', true], ['empty output directories', 'production', false],
    ] as const) it(`does not generate shims for ${description}`, async () => {
      const previous = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = environment;
        if (marker) await write('.regenerate-shims', '');
        await fs.mkdir(path.join(directory, 'api/services'), { recursive: true });
        const result = await loadExtensions(directory);
        assert.equal(result.modules.length, 0);
        assert.deepEqual(await fs.readdir(path.join(directory, 'api/services')), []);
        await assert.rejects(fs.access(path.join(directory, 'config/bootstrap.js')), { code: 'ENOENT' });
        if (marker) assert.equal(await fs.readFile(path.join(directory, '.regenerate-shims'), 'utf8'), '');
      } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
    });
    it('does not modify pre-existing authored output', async () => {
      await write('api/services/Institution.js', 'throw new Error("authored file must not load");');
      await loadExtensions(directory);
      assert.equal(await fs.readFile(path.join(directory, 'api/services/Institution.js'), 'utf8'), 'throw new Error("authored file must not load");');
    });
    it('returns bootstrap declarations without writing bootstrap.js', async () => {
      await extension('hook', 'exports.registerRedboxExtension = () => ({apiVersion: 1, bootstrap: [{name: "seed", run: async () => { throw new Error("offline"); }}]});');
      assert.equal((await loadExtensions(directory)).bootstrap[0].declaration.name, 'seed');
      await assert.rejects(fs.access(path.join(directory, 'config/bootstrap.js')), { code: 'ENOENT' });
    });
    it('returns migration declarations without writing migrations.js', async () => {
      await extension('hook', 'exports.registerRedboxExtension = () => ({apiVersion: 1, migrations: [{name: "2026-migrate", run: async () => { throw new Error("offline"); }}]});');
      assert.equal((await loadExtensions(directory)).migrations[0].declaration.name, '2026-migrate');
      await assert.rejects(fs.access(path.join(directory, 'config/migrations.js')), { code: 'ENOENT' });
    });
  });

  describe('explicit forms and offline registration', () => {
    // Core's generated read-only form is always available. Demo forms require an
    // installed extension; LOAD_DEFAULT_FORMS no longer drives generated output.
    for (const value of ['true', 'false', undefined, 'maybe']) it(`resolves explicit forms independently of retired LOAD_DEFAULT_FORMS=${String(value)}`, async () => {
      const previous = process.env.LOAD_DEFAULT_FORMS;
      try {
        if (value === undefined) delete process.env.LOAD_DEFAULT_FORMS; else process.env.LOAD_DEFAULT_FORMS = value;
        await extension('hook', 'exports.registerRedboxExtension = () => ({apiVersion: 1, forms: {"hook-form": {type: "rdmp", fields: []}}});');
        const resolved = await loadExtensions(directory);
        const forms = { ...FormConfigExports, ...resolved.providers[0].declaration.forms };
        assert.ok(forms['generated-view-only']);
        assert.ok(forms['hook-form']);
        assert.equal(forms['default-1.0-draft'], undefined);
        await assert.rejects(fs.access(path.join(directory, 'api/form-config/index.js')), { code: 'ENOENT' });
      } finally { if (previous === undefined) delete process.env.LOAD_DEFAULT_FORMS; else process.env.LOAD_DEFAULT_FORMS = previous; }
    });
    it('returns empty registrations when no dependencies are declared', async () => {
      const result = await loadExtensions(directory);
      for (const field of ['providers', 'modules', 'handlers', 'routes', 'bootstrap', 'migrations'] as const) assert.deepEqual(result[field], []);
    });
    it('rejects a declared dependency that is not installed', async () => {
      dependencies.missing = '1.0.0';
      await manifest();
      await assert.rejects(loadExtensions(directory), /Extension missing: declared dependency is not installed/);
    });
    it('discovers installed migration declarations without executing them', async () => {
      await extension('hook', 'exports.registerRedboxExtension = async () => ({apiVersion: 1, migrations: [{name: "2026-hook", run: async () => { throw new Error("offline"); }}]});');
      const result = await loadExtensions(directory);
      assert.deepEqual(result.migrations.map(item => [item.provider, item.declaration.name]), [['hook', '2026-hook']]);
    });
    it('discovers explicit API routes and mandatory access declarations', async () => {
      await extension('hook', 'exports.registerRedboxExtension = () => ({apiVersion: 1, handlers: [{name: "show", create() { throw new Error("offline"); }}], routes: [{name: "example", method: "get", path: "/:branding/:portal/api/hooks/example", handler: "show", access: ["isAdmin"]}]});');
      const result = await loadExtensions(directory);
      assert.deepEqual(result.routes[0].declaration, { name: 'example', method: 'get', path: '/:branding/:portal/api/hooks/example', handler: 'show', access: ['isAdmin'] });
    });
    for (const priority of [[], ['alpha']]) it(`resolves intentional registry replacements with priority ${JSON.stringify(priority)}`, () => {
      const module = (replaces?: true) => ({ name: 'shared', ...(replaces ? { replaces } : {}), create() { throw new Error('offline'); } });
      const result = resolveExtensions(priority.length ? [provider('zeta', { modules: [module()] }), provider('alpha', { modules: [module(true)] })] : [provider('alpha', { modules: [module()] }), provider('zeta', { modules: [module(true)] })], priority);
      assert.equal(result.modules[0].provider, priority.length ? 'alpha' : 'zeta');
    });
    it('returns configuration contributions low to high', async () => {
      for (const name of ['alpha', 'zeta']) await extension(name, `exports.registerRedboxExtension = () => ({apiVersion: 1, config: {appmode: {value: "${name}"}}});`);
      await manifest(['alpha']);
      const result = await loadExtensions(directory);
      assert.deepEqual(result.providers.map(item => item.name), ['zeta', 'alpha']);
      assert.equal(resolveStartupConfiguration({ schema: z.object({ appmode: z.object({ value: z.string() }) }), core: { source: 'core', values: { appmode: { value: 'core' } } }, extensions: result }).appmode.value, 'alpha');
    });
    it('orders bootstrap/routes by precedence and migrations independently by name', () => {
      const declarations = (name: string): Partial<RedboxExtension> => ({ bootstrap: [{ name, run: async () => {} }], migrations: [{ name, run: async () => {} }], handlers: [{ name, create: () => (_req, res) => { res.end(); } }], routes: [{ name, path: '/' + name, method: 'get', handler: name, access: 'public' }] });
      const result = resolveExtensions([provider('alpha', declarations('a')), provider('zeta', declarations('z'))], ['alpha']);
      assert.deepEqual(result.bootstrap.map(item => item.provider), ['zeta', 'alpha']);
      assert.deepEqual(result.routes.map(item => item.provider), ['zeta', 'alpha']);
      assert.deepEqual(result.migrations.map(item => item.declaration.name), ['a', 'z']);
    });
    it('does not scan local migration JavaScript files', async () => {
      await write('api/migrations/001-local.js', 'throw new Error("must not discover implicit scripts");');
      await write('api/migrations/002-local.js', 'throw new Error("must not discover implicit scripts");');
      assert.deepEqual((await loadExtensions(directory)).migrations, []);
    });
    it('accepts a missing local migration directory', async () => {
      assert.deepEqual((await loadExtensions(directory)).migrations, []);
    });
  });

  describe('explicit configuration files and migration validation', () => {
    const options = () => ({ schema: z.object({ value: z.string() }), core: { source: 'core', values: { value: 'default' } } });
    it('does not require an implicit config/migrations.js', async () => {
      assert.deepEqual(await loadStartupConfiguration(options()), { value: 'default' });
    });
    it('rejects internal import failure in an explicitly selected module without exposing its data', async () => {
      await write('application.cjs', 'require("not-installed-private-secret");');
      await assert.rejects(loadStartupConfiguration({ ...options(), files: { application: path.join(directory, 'application.cjs') } }), error => /application file.*cannot asynchronously load/.test(String(error)) && !String(error).includes('private-secret'));
    });
    it('collects explicitly registered app/hook migrations in lexical name order with attribution', () => {
      const result = resolveExtensions([provider('hook', { migrations: [{ name: '2026-02-hook', run: async () => {} }] }), provider('app', { migrations: [{ name: '2026-01-local', run: async () => {} }] })]);
      assert.deepEqual(result.migrations.map(item => [item.declaration.name, item.provider]), [['2026-01-local', 'app'], ['2026-02-hook', 'hook']]);
    });
    for (const environment of ['development', 'production']) it(`rejects duplicate migration names before acquisition in ${environment}`, () => {
      assert.throws(() => resolveExtensions([provider(environment, { migrations: [{ name: 'duplicate', run: async () => {} }, { name: 'duplicate', run: async () => {} }] })]), /require unique bounded names/);
    });
    it('identifies the provider of an invalid migration declaration', () => {
      assert.throws(() => resolveExtensions([provider('invalid-hook', { migrations: [{ name: 'bad' } as never] })]), /Extension invalid-hook: migrations require run/);
    });
    it('awaits asynchronous extension registration', async () => {
      await extension('async-hook', 'exports.registerRedboxExtension = async () => { await new Promise(resolve => setImmediate(resolve)); return {apiVersion: 1, migrations: [{name: "ready", run: async () => {}}]}; };');
      assert.equal((await loadExtensions(directory)).migrations[0].declaration.name, 'ready');
    });
    it('rejects ambiguous cross-provider migration collisions without an implicit winner', () => {
      const work = { name: 'duplicate', run: async () => {} };
      assert.throws(() => resolveExtensions([provider('first', { migrations: [work] }), provider('second', { migrations: [work] })]), /Extension second: migrations duplicate requires replaces/);
    });
  });
});
