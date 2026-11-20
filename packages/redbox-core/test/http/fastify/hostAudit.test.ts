import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const audit = require(path.resolve(__dirname, '../../../../../support/tooling/fastify-retirement/express-closure.cjs'));
describe('FM-043 Express closure controls', function () {
  this.timeout(180000);
  it('rejects copied Angular build trees and their Express requires independently of root npm ls', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'fm043-runtime-control-'));
    try {
      const install = (name: string, dependencies = {}) => {
        const target = path.join(directory, 'angular/node_modules', name);
        mkdirSync(target, { recursive: true });
        writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name, version: '5.3.0', dependencies }));
        return target;
      };
      writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'runtime', dependencies: {} }));
      assert.deepEqual(audit.auditRuntimeFilesystem(directory, directory).violations, []);
      install('@angular-devkit/build-angular', { 'webpack-dev-server': '5.3.0' });
      const server = install('webpack-dev-server', { express: '5.3.0' });
      install('express');
      writeFileSync(path.join(server, 'index.js'), "module.exports = require('express');\n");
      const result = audit.auditRuntimeFilesystem(directory, directory);
      for (const name of ['@angular-devkit/build-angular', 'webpack-dev-server', 'express'])
        assert(
          result.violations.some((row: any) => row.name === name),
          name
        );
      assert(result.violations.some((row: any) => row.dependency === 'express' && row.file.endsWith('index.js')));
      assert.equal(result.requireSites.length, 1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('audits the complete first-party source and lock graph', () => {
    const result = audit.auditTree(path.resolve(__dirname, '../../../../..'));
    assert.deepEqual(result.violations, [], JSON.stringify(result.violations));
  });
  it('rejects an unbuilt package and Express restored only in its emitted tarball', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'fm043-packed-control-'));
    try {
      const pkg = path.join(directory, 'packages/probe');
      mkdirSync(pkg, { recursive: true });
      writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({ name: 'closure-probe', version: '1.0.0', main: 'dist/index.js', files: ['dist'] })
      );
      assert.throws(() => audit.auditPackages(directory), /Build package before auditing/);
      mkdirSync(path.join(pkg, 'dist'));
      writeFileSync(path.join(pkg, 'dist/index.js'), "require('express');\n");
      const result = audit.auditPackages(directory);
      assert.equal(result.tarballs.length, 1);
      assert(result.violations.some((row: { reason: string }) => row.reason.includes('Retired dependency reference')));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('audits source fixtures as first-party code', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'fm043-source-fixture-'));
    try {
      writeFileSync(path.join(directory, 'probe.d.ts.fixture'), "import type { Request } from 'express';\n");
      const result = audit.auditTree(directory);
      assert.equal(result.files, 1);
      assert(result.violations.some((row: { reason: string }) => row.reason.includes('Retired dependency reference')));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  for (const source of [
    "import {createRequire as cr} from 'node:module'; const load = cr(import.meta.url); load('express');",
    "const name = 'express'; const load = require; load(name);",
    "const name = 'ex' + 'press'; require(name);",
    "const load = createRequire(import.meta.url); load('express');",
    "import bridge from '@fastify/express';",
    "import bridge from '@fastify/middie';",
    'interface ReplyBridge { set(headers: object): ReplyBridge; status(code: number): ReplyBridge; json(body: unknown): void }',
    'const request: Express.Request = value;',
    'declare namespace Express { interface Request {} }',
    "import renamed from 'express'; renamed();",
    "import type { Request as Hidden } from 'express';",
    "export type Hidden = import('express').Request;",
    "export { Request as Hidden } from 'express';",
    "const provider = require('express-session');",
    "const provider = import('body-parser');",
    "import hidden = require('express');",
    "declare module 'express-serve-static-core' { interface Request {} }",
    "const adapter = {originalUrl: '/',path:'/',query:{},params:{},session:{},get(){}};",
    'class Adapter { status(){} json(){} send(){} redirect(){} }',
    "const key = 'HTTP_HOST'; const host = process.env[key];",
    "type Host = 'fastify' | 'express';",
    "if (kind === 'express') startLegacyHost();",
    "switch (choice) { case 'express': startLegacyHost(); break; }",
    'const adapter = {status(){},json(){},send(){},redirect(){}};',
    'Object.setPrototypeOf(req, provider.request);',
    '/// <reference types="express" />',
    '/// <reference types="express-session" />',
    'export function runHttpRequestHandler(request, invoke) { return invoke(); }',
    "const {createRequire: factory} = require('node:module'); const load = factory(__filename); load('express');",
    '/** @type {import("express").Request} */ const request = value;',
    '/// <reference path="../node_modules/@types/express/index.d.ts" />',
  ])
    it(`rejects ${source}`, () => assert(audit.scanSource('src/probe.ts', source).violations.length));
  it('rejects Express type dependencies in TypeScript configuration', () => {
    for (const compilerOptions of [
      { types: ['express'] },
      { typeRoots: ['node_modules/@types/express'] },
      { paths: { hidden: ['node_modules/@types/express/index.d.ts'] } },
    ])
      assert(audit.configProblems('angular/tsconfig.json', JSON.stringify({ compilerOptions })).violations.length);
    assert.equal(
      audit.configProblems('angular/tsconfig.json', '{/* comment */ "compilerOptions":{"types":["node"]}}').violations
        .length,
      0
    );
  });
  it('audits executable EJS and HTML script regions without treating comments as code', () => {
    assert(
      audit.scanSource('views/page.ejs', "<p>Page</p><% const provider = require('express'); %>").violations.length
    );
    assert(audit.scanSource('angular/page.html', "<script>import provider from 'express';</script>").violations.length);
    assert.equal(
      audit.scanSource('views/page.ejs', "<%# require('express'); %><!-- <script>require('express')</script> -->")
        .violations.length,
      0
    );
  });
  it('limits Express imports to the two documented private Companion files', () => {
    for (const file of ['fastify', 'uploads'])
      assert.equal(
        audit.scanSource(`src/http/integrations/companion/${file}.ts`, "import type {Request} from 'express';")
          .violations.length,
        0
      );
    assert(
      audit.scanSource('src/http/integrations/companion/newBridge.ts', "import express from 'express';").violations
        .length
    );
    assert(
      audit.scanSource('types/http/integrations/companion/fastify.d.ts', "import type {Request} from 'express';")
        .violations.length
    );
  });
  it('rejects a first-party Express dependency outside core Companion metadata', () => {
    assert(
      audit.manifestProblems('angular/package.json', { name: 'angular', devDependencies: { express: '5.3.0' } })
        .violations.length
    );
    assert(
      audit.manifestProblems('angular/package.json', {
        name: '@researchdatabox/redbox-core',
        dependencies: { express: '5.3.0' },
      }).violations.length
    );
    assert(
      audit.manifestProblems('package.json', { name: 'unrelated', dependencies: { express: '5.3.0' } }).violations
        .length
    );
    assert(
      audit.manifestProblems('package.json', {
        name: '@researchdatabox/redbox-core',
        dependencies: { 'express-session': '1.19.0' },
      }).violations.length
    );
  });
  it('rejects retired Passport middleware types in source, manifests, locks and installed paths', () => {
    for (const name of [
      '@types/passport',
      '@types/passport-http-bearer',
      '@types/passport-jwt',
      '@types/passport-local',
    ]) {
      assert(audit.scanSource('angular/src/probe.ts', `import type * as Retired from '${name}';`).violations.length);
      assert(
        audit.manifestProblems('angular/package.json', { name: 'angular', devDependencies: { [name]: '1.0.0' } })
          .violations.length
      );
      assert(
        audit.lockProblems(
          {
            name: 'angular',
            lockfileVersion: 3,
            packages: {
              '': { name: 'angular', devDependencies: { [name]: '1.0.0' } },
              ['node_modules/' + name]: { version: '1.0.0' },
            },
          },
          'angular/package-lock.json'
        ).violations.length
      );
      assert(
        audit.graphProblems({ name: 'portal', dependencies: { [name]: { version: '1.0.0' } } }, 'npm ls --omit=dev')
          .violations.length
      );
    }
  });
  it('rejects Angular build tooling in server installed dependency paths', () => {
    assert(
      audit.graphProblems(
        { name: 'server', dependencies: { 'webpack-dev-server': { version: '5.2.4' } } },
        'server npm ls'
      ).violations.length
    );
  });
  it('rejects dependency aliases and Companion-shaped Angular paths', () => {
    assert(
      audit.manifestProblems('angular/package.json', { name: 'angular', dependencies: { hidden: 'npm:express@5.3.0' } })
        .violations.length
    );
    assert(
      audit.scanSource('angular/src/http/integrations/companion/fastify.ts', "import express from 'express';")
        .violations.length
    );
  });
  it('rejects a hoisted lock dependency escaping the Companion ancestry', () => {
    const lock = {
      name: 'consumer',
      lockfileVersion: 3,
      packages: {
        '': { name: 'consumer', dependencies: { '@uppy/companion': '7.1.1' } },
        'node_modules/@uppy/companion': { version: '7.1.1', dependencies: { express: '5.3.0' } },
        'node_modules/express': { version: '5.3.0' },
      },
    };
    assert.equal(audit.lockProblems(lock, 'lock').violations.length, 0);
    Object.assign(lock.packages[''].dependencies, { express: '5.3.0' });
    assert(audit.lockProblems(lock, 'lock').violations.length);
  });
  it('rejects undocumented packages and versions inside the Companion dependency tree', () => {
    for (const dependencies of [{ '@fastify/express': { version: '4.0.0' } }, { express: { version: '99.0.0' } }])
      assert(
        audit.graphProblems(
          { name: 'server', dependencies: { '@uppy/companion': { version: '7.1.1', dependencies } } },
          'npm ls'
        ).violations.length
      );
  });
  it('contains the Angular build-only exception to the exact lock ancestry', () => {
    const lock = {
      name: 'angular',
      lockfileVersion: 3,
      packages: {
        '': { name: 'angular', devDependencies: { '@angular-devkit/build-angular': '21.0.0' } },
        'node_modules/@angular-devkit/build-angular': {
          version: '21.0.0',
          dependencies: { 'webpack-dev-server': '5.2.4' },
        },
        'node_modules/webpack-dev-server': { version: '5.2.4', dependencies: { express: '5.3.0' } },
        'node_modules/express': { version: '5.3.0' },
      },
    };
    assert.equal(audit.lockProblems(lock, 'angular/package-lock.json').violations.length, 0);
    assert(audit.lockProblems(lock, 'package-lock.json').violations.length);
    Object.assign(lock.packages[''].devDependencies, { express: '5.3.0' });
    assert(audit.lockProblems(lock, 'angular/package-lock.json').violations.length);
  });
  it('does not let a shared Angular type intermediary grant another path an exception', () => {
    const lock = {
      name: 'angular',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'angular',
          devDependencies: { '@angular-devkit/build-angular': '22.2.0', '@types/serve-index': '1.9.4' },
        },
        'node_modules/@angular-devkit/build-angular': { dependencies: { 'webpack-dev-server': '6.0.0' } },
        'node_modules/webpack-dev-server': { dependencies: { '@types/serve-index': '1.9.4' } },
        'node_modules/@types/serve-index': { dependencies: { '@types/express': '5.0.6' } },
        'node_modules/@types/express': { version: '5.0.6' },
      },
    };
    assert(
      audit
        .lockProblems(lock, 'angular/package-lock.json')
        .violations.some((row: any) => row.path?.join('>') === 'angular>@types/serve-index>@types/express')
    );
    delete (lock.packages[''].devDependencies as Record<string, string>)['@types/serve-index'];
    assert.equal(audit.lockProblems(lock, 'angular/package-lock.json').violations.length, 0);
  });
  it('checks every installed path even when the same package has an allowed Companion path', () => {
    const provider = { dependencies: { express: { version: '5.3.0' } } };
    const tree = {
      name: 'consumer',
      dependencies: {
        '@researchdatabox/redbox-core': {
          dependencies: { '@uppy/companion': provider, express: { version: '5.3.0' } },
        },
      },
    };
    assert.equal(audit.graphProblems(tree, 'npm ls').violations.length, 0);
    Object.assign(tree.dependencies, { unrelated: provider });
    assert.equal(audit.graphProblems(tree, 'npm ls').violations.length, 1);
  });
});

describe('physical Companion containment controls', () => {
  it('resolves contained declaration imports through @types without permitting JavaScript type-package fallbacks', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'fm043-runtime-types-'));
    const install = (relative: string, name: string, version: string, dependencies = {}) => {
      const target = path.join(directory, relative);
      mkdirSync(target, { recursive: true });
      writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name, version, dependencies }));
      return target;
    };
    try {
      install('packages/redbox-core', '@researchdatabox/redbox-core', '1.0.0', { '@uppy/companion': '7.1.1' });
      const provider = install('node_modules/@uppy/companion', '@uppy/companion', '7.1.1', {
        '@types/express': '5.0.6',
      });
      const types = install('node_modules/@types/express', '@types/express', '5.0.6', {
        '@types/express-serve-static-core': '5.1.1',
      });
      install('node_modules/@types/express-serve-static-core', '@types/express-serve-static-core', '5.1.1');
      writeFileSync(path.join(types, 'index.d.ts'), "import type * as core from 'express-serve-static-core';");
      writeFileSync(path.join(provider, 'index.d.ts'), "import type * as core from 'express-serve-static-core';");
      assert.deepEqual(audit.auditRuntimeFilesystem(directory, directory).violations, []);
      writeFileSync(path.join(provider, 'index.js'), "require('express-serve-static-core');");
      const result = audit.auditRuntimeFilesystem(directory, directory);
      assert.equal(result.violations.length, 1);
      assert(result.violations[0].file.endsWith('/@uppy/companion/index.js'));
      const outsider = install('node_modules/unrelated', 'unrelated', '1.0.0');
      writeFileSync(path.join(outsider, 'index.d.ts'), "import type * as core from 'express-serve-static-core';");
      assert(
        audit.auditRuntimeFilesystem(directory, directory).violations.some((row: any) => row.owner === 'unrelated')
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('removes only pinned vendor development artifacts and the unused Passport entrypoint from runtime installs', () => {
    const { pruneRuntime } = require(
      path.resolve(__dirname, '../../../../../support/tooling/fastify-retirement/prune-runtime.cjs')
    );
    const directory = mkdtempSync(path.join(tmpdir(), 'fm043-runtime-prune-'));
    const rows: [string, string, string[]][] = [
      ['@fastify/session', '11.1.6', ['benchmark/bench.js', 'examples/redis.js', 'types/index.tst.ts']],
      ['@fastify/view', '12.0.1', ['benchmark/express.js']],
      ['express-interceptor', '1.2.0', ['examples/json.js', 'test/issue35.js']],
      ['light-my-request', '6.8.0', ['test/index.test.js']],
      ['openid-client', '6.8.8', ['build/passport.js', 'build/passport.js.map', 'build/passport.d.ts']],
    ];
    try {
      for (const [name, version, files] of rows) {
        const pkg = path.join(directory, 'node_modules', name);
        mkdirSync(pkg, { recursive: true });
        writeFileSync(
          path.join(pkg, 'package.json'),
          JSON.stringify({
            name,
            version,
            files: ['index.js', ...files],
            exports: { '.': './index.js', './passport': './build/passport.js' },
          })
        );
        writeFileSync(path.join(pkg, 'index.js'), 'exports.live = true;');
        for (const file of files) {
          mkdirSync(path.dirname(path.join(pkg, file)), { recursive: true });
          writeFileSync(path.join(pkg, file), "require('express');");
        }
      }
      const firstParty = path.join(directory, 'example.js');
      writeFileSync(firstParty, "require('express');");
      assert.equal(
        pruneRuntime(directory).length,
        rows.reduce((n, row) => n + row[2].length, 0)
      );
      for (const [name, , files] of rows) {
        const pkg = path.join(directory, 'node_modules', name);
        assert.equal(readFileSync(path.join(pkg, 'index.js'), 'utf8'), 'exports.live = true;');
        for (const file of files) assert.equal(existsSync(path.join(pkg, file)), false);
      }
      const passport = JSON.parse(
        readFileSync(path.join(directory, 'node_modules/openid-client/package.json'), 'utf8')
      );
      assert.deepEqual(passport.exports, { '.': './index.js' });
      assert.deepEqual(passport.files, ['index.js']);
      assert.equal(readFileSync(firstParty, 'utf8'), "require('express');");
      assert(audit.auditRuntimeFilesystem(directory, directory).violations.some((row: any) => row.file === firstParty));
      writeFileSync(
        path.join(directory, 'node_modules/openid-client/package.json'),
        JSON.stringify({ name: 'openid-client', version: '99.0.0' })
      );
      assert.throws(() => pruneRuntime(directory), /Review runtime artifacts/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('permits the pinned hoisted provider closure and rejects a second Express consumer through a symlink', () => {
    const { symlinkSync } = require('node:fs') as typeof import('node:fs');
    const directory = mkdtempSync(path.join(tmpdir(), 'fm043-physical-companion-'));
    const writePackage = (relative: string, name: string, version: string, dependencies = {}) => {
      const target = path.join(directory, relative);
      mkdirSync(target, { recursive: true });
      writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name, version, dependencies }));
      return target;
    };
    try {
      writePackage('packages/redbox-core', '@researchdatabox/redbox-core', '1.0.0', {
        '@uppy/companion': '7.1.1',
        express: '5.3.0',
      });
      const provider = writePackage('node_modules/@uppy/companion', '@uppy/companion', '7.1.1', { express: '5.3.0' });
      writePackage('node_modules/express', 'express', '5.3.0');
      writeFileSync(path.join(provider, 'index.js'), "module.exports = require('express');");
      assert.deepEqual(audit.auditRuntimeFilesystem(directory, directory).violations, []);
      const consumer = writePackage('node_modules/unrelated', 'unrelated', '1.0.0');
      writeFileSync(path.join(consumer, 'index.js'), "const name = 'ex' + 'press'; module.exports = require(name);");
      assert(
        audit
          .auditRuntimeFilesystem(directory, directory)
          .violations.some((row: any) => row.owner === 'unrelated' && row.dependency === 'express'),
        'Constructed specifiers outside Companion must fail'
      );
      writeFileSync(path.join(consumer, 'runner'), "#!/usr/bin/env node\nrequire('express');");
      const scripts = audit.auditRuntimeFilesystem(directory, directory);
      assert(
        scripts.requireSites.some((row: any) => row.file.endsWith('/unrelated/runner')),
        'Extensionless Node executables must be scanned'
      );
      const outsider = writePackage('vendor/other-express', 'express', '5.3.0');
      mkdirSync(path.join(directory, 'standalone/node_modules'), { recursive: true });
      symlinkSync(outsider, path.join(directory, 'standalone/node_modules/express'));
      const result = audit.auditRuntimeFilesystem(directory, directory);
      assert(result.violations.some((row: any) => row.name === 'express' && row.file === outsider));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
