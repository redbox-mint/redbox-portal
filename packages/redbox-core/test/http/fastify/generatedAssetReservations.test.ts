import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { request as httpRequest, type Server } from 'node:http';
import express from 'express';
import ts from 'typescript';
import webpack from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { ApplicationRuntime } from '../../../dist/application';
import { bindControllerFactory, defineController } from '../../../dist/http';
import { createControllerHost } from '../../../dist/http/fastify/composition';
import { HttpRouteRegistry } from '../../../dist/http/fastify/registry';
import type { FastifyHost } from '../../../dist/http/fastify/FastifyHost';

const derive = require('../../../scripts/http-generated-assets.cjs');
type Pattern = { path: string; pattern: string; example: string };
function patterns(configs: string) {
  const entries: Pattern[] = [],
    namespaces: string[] = [];
  derive(
    ts.createSourceFile('webpack.config.ts', `const webpack = { config: [${configs}] };`, ts.ScriptTarget.Latest, true),
    (value: string) => namespaces.push(value),
    (value: Pattern) => entries.push(value)
  );
  return {
    entries,
    namespaces,
    matches: (name: string) => entries.some(p => new RegExp('^' + p.pattern + '$').test('/' + name)),
  };
}
function exchange(port: number, target: string, method = 'GET') {
  return new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path: target, method, agent: false }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode!, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('Asset request deadline')));
    req.end();
  });
}
const reg = <T>(declaration: T) => ({ provider: 'core', declaration });

describe('FM-018 generated static output reservations', function () {
  this.timeout(60000);
  let directory: string;
  const hosts: FastifyHost[] = [],
    servers: Server[] = [];
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fm018-generated-'));
  });
  afterEach(async () => {
    for (const host of hosts.splice(0)) await host.stop({ deadlineMs: 3000 });
    for (const server of servers.splice(0))
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  it('derives effective resource patterns from tracked configuration, independent of emitted files', () => {
    const root = path.resolve(__dirname, '../../../../..');
    const source = ts.createSourceFile(
      'webpack.config.ts',
      fs.readFileSync(path.join(root, 'packages/redbox-core/src/config/webpack.config.ts'), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const entries: Pattern[] = [];
    derive(
      source,
      () => {},
      (value: Pattern) => entries.push(value)
    );
    for (const ext of ['woff', 'woff2', 'ttf', 'otf', 'eot', 'svg'])
      assert(
        entries.some(entry => new RegExp('^' + entry.pattern + '$').test('/be810be3a3e14c682a25.' + ext)),
        ext
      );
    assert(entries.some(entry => new RegExp('^' + entry.pattern + '$').test('/be810be3a3e14c682a25.png')));
    assert(entries.some(entry => new RegExp('^' + entry.pattern + '$').test('/be810be3a3e14c682a25')));
    for (const entry of entries) assert(new RegExp('^' + entry.pattern + '$').test(entry.example));
  });
  it('keeps per-config effective asset names, rule/module overrides, optional extensions, and hash lengths distinct', () => {
    const p = patterns(`
      { output: { filename: 'scripts/app.js', assetModuleFilename: '[hash:8].base[ext]' }, module: { rules: [{ test: /\\.woff2?$/, type: 'asset/resource', generator: { filename: '[hash:8].font[ext]' } }] } },
      { output: { filename: 'scripts/app.js', hashDigestLength: 12 }, module: { generator: { 'asset/resource': { filename: '[contenthash][ext]' } }, rules: [{ test: /\\.ttf$/, type: 'asset/resource' }, { mimetype: 'image/svg+xml', type: 'asset/resource', generator: { filename: '[hash:10].icon[ext]' } }] } }
    `);
    for (const name of [
      'abcdef12.font.woff',
      'abcdef12.font.woff2',
      'abcdef12.base.png',
      'a'.repeat(12) + '.ttf',
      'a'.repeat(10) + '.icon.svg',
    ])
      assert(p.matches(name), name);
    for (const name of ['abcdef12.font.ttf', 'a'.repeat(20) + '.ttf', 'a'.repeat(10) + '.icon.woff'])
      assert(!p.matches(name), name);
    const relocated = patterns(
      `{ output: { filename: 'scripts/app.js' }, module: { rules: [{ test: /\\.woff2$/, type: 'asset/resource', generator: { outputPath: 'generated-fonts' } }] } }`
    );
    assert(relocated.namespaces.some(name => name.startsWith('generated-fonts/')));
  });
  it('reserves inherited resource rules and conservatively covers non-extension selectors', () => {
    const p = patterns(
      `{ output: { filename: 'scripts/app.js' }, module: { rules: [{ type: 'asset/resource', oneOf: [{ test: /special/ }] }] } }`
    );
    assert(p.matches('a'.repeat(20) + '.avif'));
    assert(!p.matches('ordinary.avif'));
  });
  it('uses effective digest width, including future defaults and shorter configured hash functions', () => {
    for (const config of ['experiments: { futureDefaults: true },', "output: { hashFunction: 'xxhash64' },"]) {
      const p = patterns(`{ ${config} module: { rules: [{ test: /\\.woff2$/, type: 'asset/resource' }] } }`);
      assert(p.matches('a'.repeat(16) + '.woff2'));
      assert(!p.matches('a'.repeat(20) + '.woff2'));
    }
    const p = patterns(
      `{ output: { filename: 'scripts/app.js', assetModuleFilename: '[hash:100][ext]' }, module: { rules: [{ test: /\\.woff2$/, type: 'asset/resource' }] } }`
    );
    assert(p.matches('a'.repeat(20) + '.woff2'));
    assert(!p.matches('a'.repeat(32) + '.woff2'));
  });
  it('fails closed for dynamic or unsupported root output declarations', () => {
    assert.throws(() => patterns(`{ output: { assetModuleFilename: makeName() } }`), /must be literals/);
    assert.throws(() => patterns(`{ output: { ...hiddenOutput } }`), /must not hide declarations/);
    assert.throws(() => patterns(`{ module: hiddenRules }`), /Expected literal Webpack/);
    assert.throws(() => patterns(`{ output: { filename: '[unknown].js' } }`), /Unsupported root output/);
  });
  it('covers actual implicit URL/CSS resources, chunks, runtime, workers, Wasm and external maps', async () => {
    const output = { filename: '[name].[contenthash:8].js', path: path.join(directory, 'out') };
    const p = patterns(
      `{ output: { filename: '${output.filename}' }, module: { rules: [{ test: /\\.woff2$/, type: 'asset/resource' }] }, plugins: [new MiniCssExtractPlugin({ filename: '[name].[contenthash:8].css' })] }`
    );
    fs.writeFileSync(
      path.join(directory, 'entry.js'),
      `import './theme.css'; import('./lazy.js'); import('./empty.wasm'); new URL('./fixture.png', import.meta.url); new URL('./NOTICE', import.meta.url); new Worker(new URL('./worker.js', import.meta.url)); console.log('entry');`
    );
    fs.writeFileSync(path.join(directory, 'lazy.js'), `console.log('lazy');`);
    fs.writeFileSync(path.join(directory, 'worker.js'), `console.log('worker');`);
    fs.writeFileSync(
      path.join(directory, 'theme.css'),
      `@font-face { font-family: fixture; src: url('./fixture.woff2?version#fragment'); } body { font-family: fixture; background-image: url('./fixture.png?css'); }`
    );
    fs.writeFileSync(path.join(directory, 'fixture.woff2'), 'controlled font bytes');
    fs.writeFileSync(path.join(directory, 'fixture.png'), 'controlled image bytes');
    fs.writeFileSync(path.join(directory, 'NOTICE'), 'controlled extensionless resource bytes');
    fs.writeFileSync(path.join(directory, 'empty.wasm'), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
    const compiler = webpack({
      mode: 'development',
      context: directory,
      entry: './entry.js',
      output,
      devtool: 'source-map',
      optimization: { runtimeChunk: 'single' },
      plugins: [new MiniCssExtractPlugin({ filename: '[name].[contenthash:8].css' })],
      module: {
        rules: [
          { test: /\.woff2$/, type: 'asset/resource' },
          { test: /\.css$/, use: [MiniCssExtractPlugin.loader, require.resolve('css-loader')] },
        ],
      },
    })!;
    try {
      const stats = await new Promise<webpack.Stats>((resolve, reject) =>
        compiler.run((error, result) => (error ? reject(error) : resolve(result!)))
      );
      assert(!stats.hasErrors(), stats.toString({ all: false, errors: true }));
      const emitted = stats.compilation.getAssets().map(asset => asset.name);
      assert(emitted.some(name => name.split(/[?#]/)[0].endsWith('.woff2')));
      assert(emitted.some(name => name.split(/[?#]/)[0].endsWith('.png')));
      assert(emitted.some(name => /^[a-f0-9]{20}$/.test(name)));
      assert(emitted.some(name => name.endsWith('.module.wasm')));
      assert(emitted.some(name => name.startsWith('runtime.') && name.endsWith('.js')));
      assert(emitted.some(name => name.endsWith('.css')));
      assert(emitted.some(name => name.endsWith('.map')));
      assert(emitted.some(name => name.includes('?version')));
      assert(emitted.filter(name => name.endsWith('.js')).length >= 4);
      for (const name of emitted) assert(p.matches(name.split(/[?#]/)[0]), 'Unreserved actual emitted asset: ' + name);
    } finally {
      await new Promise<void>((resolve, reject) => compiler.close(error => (error ? reject(error) : resolve())));
    }
  });
  for (const root of ['', '/research/v6'])
    it(`preserves existing/missing static delivery and method misses against Express with a catch-all fallback at ${root || '/'}`, async () => {
      const files = ['woff', 'woff2', 'ttf', 'otf', 'eot', 'svg'].map(ext => 'be810be3a3e14c682a25.' + ext);
      files.push(
        'be810be3a3e14c682a25.png',
        'be810be3a3e14c682a25',
        'be810be3a3e14c682a25.module.wasm',
        'icons/' + 'f'.repeat(20) + '.svg',
        'angular/local-auth/browser/media/font-ABC12345.woff2',
        'angular/local-auth/browser/chunk-ABC12345.js',
        'angular/local-auth/browser/main-ABC12345.js',
        'angular/local-auth/browser/styles-ABC12345.css'
      );
      for (const name of files) {
        fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
        fs.writeFileSync(path.join(directory, name), 'static ' + name);
      }
      const app = express();
      app.use(root || '/', express.static(directory));
      app.use((_request, response) => response.status(404).send('not-found'));
      const server = await new Promise<Server>(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
      });
      servers.push(server);
      const expressPort = (server.address() as { port: number }).port;
      let fallbacks = 0;
      const factory = defineController({
        name: 'Assets',
        actions: ['fallback'],
        create: () => ({
          fallback(_request: unknown, reply: any) {
            fallbacks++;
            return reply.send('FALLBACK');
          },
        }),
      });
      const host = await createControllerHost(new ApplicationRuntime({ config: {}, log: { warn() {} } }, []), {
        hostname: '127.0.0.1',
        port: 0,
        logger: () => {},
        controllers: [reg(factory)],
        bindings: [bindControllerFactory(factory, undefined)],
        routes: [],
        routing: { rootContext: root, policyNames: [] },
        fallbacks: [
          reg({
            name: 'unmatched-assets',
            prefix: '/',
            controller: 'Assets',
            action: 'fallback',
            access: { kind: 'public' },
          }),
        ],
        security: {
          policies: {},
          csrf: {
            protect: async () => {},
            apiProtect: async () => {},
            token: async () => {
              throw new Error('unused');
            },
          },
          prepare: async native => {
            // A bounded native static owner exercises the FM-018 seam; streaming
            // transport remains FM-031's separate qualification responsibility.
            for (const name of files) {
              native.route({
                method: ['GET', 'HEAD'],
                url: root + '/' + name,
                handler: async (_request, reply) => reply.send(fs.readFileSync(path.join(directory, name))),
              });
            }
          },
        },
      });
      hosts.push(host);
      await host.initialize();
      await host.activate();
      const port = host.address()!.port;
      for (const name of files)
        for (const existing of [true, false])
          for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'PROPFIND']) {
            const target =
              root +
              '/' +
              (existing ? name : name.replace(/be810be3a3e14c682a25|ABC12345|f{20}/, 'c'.repeat(20))) +
              '?v=1';
            const legacy = await exchange(expressPort, target, method),
              current = await exchange(port, target, method);
            assert.equal(current.status, legacy.status, method + ' ' + target);
            if (existing && ['GET', 'HEAD'].includes(method)) assert.deepEqual(current.body, legacy.body, target);
            assert.notEqual(current.body.toString(), 'FALLBACK', method + ' ' + target);
          }
      assert.equal(fallbacks, 0);
      for (const target of ['/ordinary-unmatched', '/ordinary-image.png', '/short.woff2'])
        assert.equal((await exchange(port, root + target)).body.toString(), 'FALLBACK', target);
      const registry = new HttpRouteRegistry(root);
      registry.bindLookup(() => false);
      assert(registry.protects(root + '/be810be3a3e14c682a25.woff2'));
      assert(!registry.protects('/outside/be810be3a3e14c682a25.woff2'));
    });
});
