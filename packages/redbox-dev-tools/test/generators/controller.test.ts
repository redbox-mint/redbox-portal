import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { ControllerGenerator } from '../../src/generators/controller';
import { parseRoutes } from '../../src/cli-parsers';
import { resolvePaths } from '../../src/utils/paths';

describe('ControllerGenerator API2', () => {
  let root: string;
  let paths: ReturnType<typeof resolvePaths>;
  const routes = () => {
    const source = fs.readFileSync(path.join(paths.coreTypes, 'src/config/extensionRoutes.ts'), 'utf8');
    const output = { exports: {} as { routes?: import('@researchdatabox/redbox-core/http').HttpRouteDeclaration[] } };
    new Function('exports', ts.transpile(source, { module: ts.ModuleKind.CommonJS }))(output.exports);
    return output.exports.routes!;
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fm037-controller-'));
    fs.mkdirSync(path.join(root, 'src/config'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ redbox: { extension: '.' } }));
    fs.writeFileSync(
      path.join(root, 'src/config/auth.config.ts'),
      `export const auth = { rules: [{ path: '/', role: 'Guest', can_read: true }] };`
    );
    paths = resolvePaths({ root });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('generates native signatures, concrete inputs, factories and explicit bindings in an extension root', async () => {
    assert.equal(paths.coreTypes, root);
    await new ControllerGenerator({ root, paths, name: 'Test', actions: ['index', 'save'] }).generate();
    const source = fs.readFileSync(path.join(root, 'src/controllers/TestController.ts'), 'utf8');
    for (const fragment of [
      "from 'fastify'",
      'interface TestInput',
      'index(request: FastifyRequest): Promise<unknown>',
      'this.input.index(request)',
      'JSON.stringify(result)',
      'defineController',
      'actions: ["index","save"]',
    ])
      assert(source.includes(fragment), fragment);
    assert(!/express|sails|_exportedMethods/.test(source));
    const bindings = fs.readFileSync(path.join(root, 'src/config/extensionControllers.ts'), 'utf8');
    assert(bindings.includes('bindControllerFactory(BrowserTestController, inputs["TestController"])'));
    assert(bindings.includes('TestInput as BrowserTestControllerInput'));
  });

  for (const order of [
    [false, true],
    [true, false],
  ]) {
    it(`strictly compiles same-named browser/API controllers and multiple browser factories (${order})`, async () => {
      for (const webservice of order)
        await new ControllerGenerator({
          root,
          paths,
          name: 'Test',
          actions: ['index', 'delete'],
          webservice,
        }).generate();
      await new ControllerGenerator({ root, paths, name: 'Other', actions: ['read'] }).generate();
      fs.symlinkSync(path.resolve(__dirname, '../../../../node_modules'), path.join(root, 'node_modules'), 'dir');
      const config = ts.parseJsonConfigFileContent(
        {
          compilerOptions: {
            strict: true,
            skipLibCheck: true,
            noEmit: true,
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            types: ['node'],
          },
          include: ['src/**/*.ts'],
        },
        ts.sys,
        root
      );
      const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(config.fileNames, config.options));
      assert.equal(
        diagnostics.length,
        0,
        ts.formatDiagnostics(diagnostics, {
          getCurrentDirectory: () => root,
          getCanonicalFileName: f => f,
          getNewLine: () => '\n',
        })
      );
    });
  }

  it('defaults to the production ordered protected chain and updates role rules', async () => {
    await new ControllerGenerator({
      root,
      paths,
      name: 'Test',
      routes: [{ action: 'index', path: '/:branding/:portal/test' }],
      auth: ['Admin', 'Researcher'],
    }).generate();
    assert.deepEqual(routes()[0], {
      name: routes()[0].name,
      method: 'get',
      path: '/:branding/:portal/test',
      controller: 'TestController',
      action: 'index',
      access: {
        kind: 'policies',
        names: ['nocache', 'brandingandportal', 'iswebserviceauthenticated', 'brandactor', 'checkauth'],
      },
      csrf: false,
    });
    const auth = fs.readFileSync(path.join(root, 'src/config/auth.config.ts'), 'utf8');
    assert(auth.includes("role: 'Admin', can_read: true"));
    assert(auth.includes("role: 'Researcher', can_read: true"));
  });

  it('retains method/path aliases and stable unique names while deduplicating exact routes', async () => {
    const mappings = [
      { action: 'read', path: '/:branding/:portal/shared', verb: 'get' },
      { action: 'read', path: '/:branding/:portal/shared', verb: 'post' },
      { action: 'read', path: '/:branding/:portal/alias', verb: 'get' },
      { action: 'read', path: '/:branding/:portal/item/:"item-id"', verb: 'get' },
    ];
    await new ControllerGenerator({ root, paths, name: 'Test', routes: [...mappings, ...mappings] }).generate();
    assert.equal(routes().length, 4);
    assert.equal(new Set(routes().map(r => r.name)).size, 4);
    assert.deepEqual(
      routes().map(r => r.csrf),
      [false, true, false, false]
    );
    assert(routes().every(r => r.controller === 'TestController' && r.action === 'read'));
  });

  it('generates distinct API identities, explicit public and per-route named/deny access', async () => {
    await new ControllerGenerator({
      root,
      paths,
      name: 'Test',
      webservice: true,
      routes: [
        { action: 'publicRead', path: '/public', access: { kind: 'public' } },
        { action: 'deny', path: '/deny', access: { kind: 'deny' } },
        {
          action: 'write',
          verb: 'post',
          path: '/:branding/:portal/write',
          access: { kind: 'policies', names: ['nocache'] },
        },
      ],
    }).generate();
    assert(routes().every(r => r.controller === 'webservice/TestController'));
    assert.deepEqual(
      routes().map(r => r.access.kind),
      ['policies', 'deny', 'policies']
    );
    assert.equal(routes()[2].csrf, true);
    assert.deepEqual(routes()[0].access, { kind: 'policies', names: ['nocache'] });
    assert.deepEqual(routes()[0].api?.policy, ['nocache']);
    const policies = fs.readFileSync(path.join(root, 'src/config/extensionApiPolicies.ts'), 'utf8');
    assert(policies.includes('publicRead: true'));
    assert(!policies.includes('write: true'));
    assert(!policies.includes('deny: true'));
  });

  it('supports explicit public generation and rejects contradictory role rules', async () => {
    await new ControllerGenerator({ root, paths, name: 'Public', route: '/public', public: true }).generate();
    assert.deepEqual(routes()[0].access, { kind: 'public' });
    assert.throws(
      () => new ControllerGenerator({ root, paths, name: 'Bad', public: true, auth: ['Admin'] }),
      /public access/
    );
    assert.throws(
      () =>
        new ControllerGenerator({
          root,
          paths,
          name: 'Bad',
          public: true,
          routes: [{ action: 'read', path: '/public', auth: ['Admin'] }],
        }),
      /public access/
    );
    assert.throws(
      () =>
        new ControllerGenerator({
          root,
          paths,
          name: 'Bad',
          auth: ['Admin'],
          routes: [{ action: 'read', path: '/public', access: { kind: 'public' } }],
        }),
      /public access/
    );
  });

  for (const action of ['constructor', '__proto__', 'prototype', 'input'])
    it(`rejects forbidden action ${action}`, () => {
      assert.throws(
        () => new ControllerGenerator({ root, paths, name: 'Bad', actions: [action] }),
        /Invalid generated identifier/
      );
    });

  it('uses the shared identifier spelling for names, classes and actions', async () => {
    await new ControllerGenerator({
      root,
      paths,
      name: 'custom-probe',
      className: 'custom-class',
      routes: [{ action: 'read-item', path: '/item' }],
    }).generate();
    assert.equal(routes()[0].controller, 'customProbeController');
    assert.equal(routes()[0].action, 'readItem');
    const content = fs.readFileSync(path.join(root, 'src/controllers/customProbeController.ts'), 'utf8');
    assert(content.includes('class customClass'));
    for (const name of ['123', '...', 'a/b', 'class', 'toString'])
      assert.throws(
        () => new ControllerGenerator({ root, paths, name, actions: ['read'] }),
        /Invalid generated identifier/
      );
  });

  it('preserves branded route parameters when parsing CLI role suffixes', () => {
    assert.deepEqual(parseRoutes('read:get:/:branding/:portal/items/:id:Admin:Researcher'), [
      { action: 'read', verb: 'get', path: '/:branding/:portal/items/:id', auth: ['Admin', 'Researcher'] },
    ]);
    assert.deepEqual(parseRoutes('read:/items'), [{ action: 'read', verb: 'get', path: '/items' }]);
  });

  it('leaves the filesystem unchanged for dry runs', async () => {
    await new ControllerGenerator({
      root,
      paths,
      name: 'Dry',
      actions: ['read'],
      routes: [{ action: 'read', path: '/dry' }],
      dryRun: true,
    }).generate();
    assert(!fs.existsSync(path.join(root, 'src/controllers')));
  });
});
