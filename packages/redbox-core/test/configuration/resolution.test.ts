import assert from 'node:assert/strict';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { loadStartupConfiguration } from '../../src/configuration/loading';
import { ConfigurationError, resolveStartupConfiguration } from '../../src/configuration';
import { resolveExtensions, type ExtensionProvider } from '../../src/extensions';

const schema = z
  .object({
    server: z
      .object({
        port: z.number().int().min(0).max(65535),
        tags: z.array(z.string()),
        optional: z.string().nullable().optional(),
      })
      .strict(),
    brandingConfigurationDefaults: z.object({ menu: z.array(z.string()) }).strict(),
    agendaQueue: z
      .object({
        jobs: z.record(
          z.string(),
          z
            .object({
              fnName: z.string(),
              options: z
                .object({ concurrency: z.number().positive().optional(), lockLimit: z.number().optional() })
                .strict()
                .optional(),
            })
            .strict()
        ),
      })
      .strict(),
    transform: z.custom<(value: string) => string>(value => typeof value === 'function'),
  })
  .strict();
const transform = (value: string) => value.toUpperCase();
const core = {
  source: 'core',
  values: {
    server: { port: 1, tags: ['a', 'b'] },
    brandingConfigurationDefaults: { menu: ['a', 'b'] },
    agendaQueue: { jobs: { old: { fnName: 'old', options: { concurrency: 1 } } } },
    transform,
  },
};
const executablePaths = ['transform'];
describe('Startup configuration', () => {
  it('resolves every layer in order with typed env and CLI inputs, retaining functions', () => {
    const extensions = resolveExtensions(
      [
        { name: 'low', root: '.', declaration: { apiVersion: 1, config: { server: { port: 2 } } } },
        { name: 'high', root: '.', declaration: { apiVersion: 1, config: { server: { port: 3 } } } },
      ],
      ['high']
    );
    const bindings = { PORT: { path: ['server', 'port'], parse: Number } };
    const resolve = (extra = {}) =>
      resolveStartupConfiguration({
        schema,
        core,
        extensions,
        executablePaths,
        application: { source: 'application', values: { server: { port: 4 } } },
        environment: { source: 'production', values: { server: { port: 5 } } },
        local: { source: 'local', values: { server: { port: 6 } } },
        ...extra,
      });
    assert.equal(resolveStartupConfiguration({ schema, core, executablePaths }).server.port, 1);
    assert.equal(resolveStartupConfiguration({ schema, core, executablePaths, extensions }).server.port, 3);
    assert.equal(resolve({ environment: undefined, local: undefined }).server.port, 4);
    assert.equal(resolve({ local: undefined }).server.port, 5);
    assert.equal(resolve().server.port, 6);
    assert.equal(resolve({ local: { source: 'local', values: { server: { port: undefined } } } }).server.port, 5);
    assert.equal(
      resolve({ env: { REDBOX_PORT: '7', PATH: '/ignore' }, environmentInputs: { REDBOX_PORT: bindings.PORT } }).server
        .port,
      7
    );
    const config = resolve({
      env: { REDBOX_PORT: '7' },
      environmentInputs: { REDBOX_PORT: bindings.PORT },
      argv: ['--port=8'],
      commandLineInputs: { port: bindings.PORT },
    });
    assert.equal(config.server.port, 8);
    assert.equal(config.transform, transform);
    assert.equal(config.transform('ok'), 'OK');
    assert(Object.isFrozen(config.server.tags));
    assert(!Object.isFrozen(core.values.server));
  });
  it('merges declared workflows after provider config and before higher providers and application layers', () => {
    const workflowSchema = schema.extend({ workflow: z.record(z.string(), z.record(z.string(), z.unknown())) });
    const workflows = { review: { draft: { form: 'declared' } } };
    const low = {
      name: 'low',
      root: '.',
      declaration: {
        apiVersion: 1 as const,
        config: { workflow: { review: { draft: { form: 'config' }, published: { form: 'published' } } } },
        workflows,
      },
    };
    const resolve = (
      providers: readonly ExtensionProvider[] = [low],
      application?: { source: string; values: Record<string, unknown> }
    ) =>
      resolveStartupConfiguration({
        schema: workflowSchema,
        core: { ...core, values: { ...core.values, workflow: {} } },
        executablePaths,
        extensions: resolveExtensions(providers, providers.some(provider => provider.name === 'high') ? ['high'] : []),
        application,
      });
    assert.deepEqual(resolve().workflow.review, { draft: { form: 'declared' }, published: { form: 'published' } });
    const higher = {
      ...low,
      name: 'high',
      declaration: { apiVersion: 1 as const, workflows: { review: { draft: { form: 'high' } } } },
    };
    assert.deepEqual(resolve([low, higher]).workflow.review.draft, { form: 'high' });
    assert.deepEqual(
      resolve([low], { source: 'application', values: { workflow: { review: { draft: { form: 'app' } } } } }).workflow
        .review.draft,
      { form: 'app' }
    );
    assert.equal(workflows.review.draft.form, 'declared');
    assert(!Object.isFrozen(workflows));
  });

  it('replaces ordinary and branded arrays, merges jobs by name and preserves inputs', () => {
    const values = {
      server: { tags: ['x'], optional: null },
      brandingConfigurationDefaults: { menu: ['x'] },
      agendaQueue: {
        jobs: [
          { name: 'old', options: { lockLimit: 2 } },
          { name: 'new', fnName: 'new' },
        ],
      },
    };
    const config = resolveStartupConfiguration({
      schema,
      core,
      executablePaths,
      application: { source: 'app', values },
    });
    assert.deepEqual(config.server.tags, ['x']);
    assert.equal(config.server.optional, null);
    assert.deepEqual(config.brandingConfigurationDefaults.menu, ['x']);
    assert.deepEqual(config.agendaQueue.jobs.old, { fnName: 'old', options: { concurrency: 1, lockLimit: 2 } });
    assert.equal(config.agendaQueue.jobs.new.fnName, 'new');
    assert.equal(values.agendaQueue.jobs[0].name, 'old');
  });
  it('rejects unknown keys, unsafe values and unapproved functions with source/path and no values', () => {
    for (const values of [
      { server: { port: 'credential-value' } },
      { unknown: 'credential-value' },
      { server: { tags: transform } },
      JSON.parse('{"__proto__":{"polluted":true}}'),
    ]) {
      assert.throws(
        () => resolveStartupConfiguration({ schema, core, executablePaths, local: { source: 'local', values } }),
        error => {
          assert(error instanceof ConfigurationError);
          assert.equal(error.source, 'local');
          assert(!error.message.includes('credential-value'));
          return true;
        }
      );
    }
    assert.throws(
      () => resolveStartupConfiguration({ schema, core, executablePaths, env: { sails_unknown: 'secret' } }),
      /unsupported input/
    );
    assert.throws(
      () => resolveStartupConfiguration({ schema, core, executablePaths, argv: ['--port=1', '--port=2'] }),
      /unique/
    );
    assert.throws(
      () =>
        resolveStartupConfiguration({
          schema,
          core,
          executablePaths,
          local: { source: 'local', values: { agendaQueue: { jobs: [{ name: 'same' }, { name: 'same' }] } } },
        }),
      /duplicate job/
    );
  });
});

describe('offline awaited configuration loading', () => {
  it('imports the compiled public surface without Sails, clients or listeners', () => {
    execFileSync(
      process.execPath,
      [
        '-e',
        String.raw`
      const assert = require('node:assert/strict');
      const Module = require('node:module');
      const load = Module._load;
      Module._load = function(name, ...args) { assert(!/^sails(?:\/|$)/.test(name)); return load.call(this, name, ...args); };
      const net = require('node:net');
      net.Socket.prototype.connect = net.Server.prototype.listen = () => { throw Error('offline config acquired a resource'); };
      assert.equal(global.sails, undefined);
      const before = process.listenerCount('SIGTERM');
      require('./dist/configuration');
      assert.equal(process.listenerCount('SIGTERM'), before);
      assert(!Object.keys(require.cache).some(p => /\/redbox-core\/(?:dist\/)?(?:compat\/|CoreBase\.js$|dist\/index\.js$)/.test(p)));
    `,
      ],
      { cwd: __dirname + '/../..', stdio: 'pipe' }
    );
  });
  it('awaits native ESM top-level work and CommonJS files without acquiring resources', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const directory = await mkdtemp(path.join(tmpdir(), 'redbox-config-'));
    try {
      await writeFile(
        path.join(directory, 'app.mjs'),
        'await new Promise(r=>setTimeout(r,10)); export default {server:{port:12}};'
      );
      await writeFile(path.join(directory, 'local.cjs'), 'module.exports={server:{tags:["local"]}};');
      const config = await loadStartupConfiguration({
        schema,
        core,
        executablePaths,
        files: { application: path.join(directory, 'app.mjs'), local: path.join(directory, 'local.cjs') },
      });
      assert.equal(config.server.port, 12);
      assert.deepEqual(config.server.tags, ['local']);
      await assert.rejects(
        loadStartupConfiguration({
          schema,
          core,
          executablePaths,
          files: { application: path.join(directory, 'missing.mjs') },
        }),
        /application file at root/
      );
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
