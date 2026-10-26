const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { request } = require('node:http') as typeof import('node:http');
const loadTs = require('../support/load-ts.cjs');
const controllerGeneratorModule = loadTs(module, '../../src/generators/controller');
const pathsModule = loadTs(module, '../../src/utils/paths');

describe('ControllerGenerator', () => {
  let tempRoot: string;
  let coreTypesRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-test-'));
    coreTypesRoot = path.join(tempRoot, 'packages', 'redbox-core');

    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'controllers'), { recursive: true });
    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'config'), { recursive: true });

    // Create mock index.ts
    fs.writeFileSync(
      path.join(coreTypesRoot, 'src', 'controllers', 'index.ts'),
      `export const existingDeclaration = true;`
    );

    // Create mock auth.config.ts
    fs.writeFileSync(
      path.join(coreTypesRoot, 'src', 'config', 'auth.config.ts'),
      `
export const auth: any = {
    rules: [
        { path: '/', role: 'Guest', can_read: true },
    ],
};
`
    );

    // Create a mock package.json so resolvePaths is happy
    fs.writeFileSync(path.join(coreTypesRoot, 'package.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should generate a controller and update index', async () => {
    const paths = pathsModule.resolvePaths({ root: tempRoot });
    const generator = new controllerGeneratorModule.ControllerGenerator({
      name: 'Test',
      actions: ['index', 'save'],
      root: tempRoot,
      paths,
    });

    await generator.generate();

    const controllerPath = path.join(coreTypesRoot, 'src', 'controllers', 'TestController.ts');
    expect(fs.existsSync(controllerPath)).to.be.true;

    const content = fs.readFileSync(controllerPath, 'utf-8');
    expect(content).to.contain('class Test');
    expect(content).to.contain('public async index');
    expect(content).to.contain('public async save');
    expect(content).to.contain('Request, Response');
    expect(content).not.to.contain('_exportedMethods');

    const indexContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'controllers', 'index.ts'), 'utf-8');
    // console.log('INDEX CONTENT:', indexContent);
    expect(indexContent).to.contain("export * from './TestController'");
    expect(indexContent).to.contain('TestController');
    expect(indexContent).not.to.contain('getOrCreate');
    expect(indexContent).not.to.contain('ControllerExports');
  });

  it('should update routes and auth', async () => {
    const paths = pathsModule.resolvePaths({ root: tempRoot });
    const generator = new controllerGeneratorModule.ControllerGenerator({
      name: 'Test',
      actions: ['index'],
      routes: [{ action: 'index', verb: 'get', path: '/test-route' }],
      auth: ['Admin', 'Researcher'],
      root: tempRoot,
      paths,
    });

    await generator.generate();

    const routesContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'extensionRoutes.ts'), 'utf-8');
    expect(routesContent).to.contain('path: "/test-route"');
    expect(routesContent).to.contain('handler: "TestController-index"');
    const { Project } = require('ts-morph');
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { module: 1 } });
    const source = project.createSourceFile('/routes.ts', routesContent);
    const emitted = source.getEmitOutput().getOutputFiles()[0].getText();
    const output = { exports: {} };
    new Function('exports', emitted)(output.exports);
    const routes = (output.exports as { routes: Array<{ name: string; handler: string; access: string[] }> }).routes;
    const { resolveExtensions } = require('@researchdatabox/redbox-core/extensions');
    const resolved = resolveExtensions([
      {
        name: 'generated',
        root: tempRoot,
        declaration: {
          apiVersion: 1,
          routes,
          handlers: routes.map(route => ({ name: route.handler, create: () => () => {} })),
        },
      },
    ]);
    expect(resolved.routes).to.have.length(1);
    expect(resolved.handlers[0].declaration.name).to.equal(resolved.routes[0].declaration.handler);
    const { createHttpPolicies, bindHttpPolicies } = require('@researchdatabox/redbox-core/http/express');
    const policies = createHttpPolicies({});
    expect(() =>
      bindHttpPolicies(
        routes[0].access.map(name => name.toLowerCase()),
        policies
      )
    ).not.to.throw();
    expect(routes[0].access.map(name => name.toLowerCase())).to.deep.equal([
      'nocache',
      'brandingandportal',
      'iswebserviceauthenticated',
      'brandactor',
      'checkauth',
    ]);

    const authContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'auth.config.ts'), 'utf-8');
    expect(authContent).to.contain("{ path: '/test-route', role: 'Admin', can_read: true }");
    expect(authContent).to.contain("{ path: '/test-route', role: 'Researcher', can_read: true }");
  });

  it('retains every method and path for a shared action and deduplicates only exact routes', async () => {
    const paths = pathsModule.resolvePaths({ root: tempRoot });
    const generator = new controllerGeneratorModule.ControllerGenerator({
      name: 'Test',
      actions: ['index'],
      root: tempRoot,
      paths,
      routes: [
        { action: 'index', verb: 'get', path: '/:branding/:portal/shared' },
        { action: 'index', verb: 'post', path: '/:branding/:portal/shared' },
        { action: 'index', verb: 'get', path: '/:branding/:portal/alias' },
        { action: 'index', verb: 'get', path: '/:branding/:portal/item/:"item-id"' },
        { action: 'index', verb: 'get', path: '/:branding/:portal/item/:"item-id"' },
        { action: 'index', verb: 'get', path: '/:branding/:portal/shared' },
      ],
    });
    await generator.generate();
    const { Project } = require('ts-morph');
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { module: 1 } });
    const source = project.createSourceFile(
      '/routes.ts',
      fs.readFileSync(path.join(coreTypesRoot, 'src/config/extensionRoutes.ts'), 'utf8')
    );
    const output = { exports: {} };
    new Function('exports', source.getEmitOutput().getOutputFiles()[0].getText())(output.exports);
    const routes = (
      output.exports as { routes: Array<{ name: string; method: string; path: string; handler: string }> }
    ).routes;
    expect(routes).to.have.length(4);
    expect(new Set(routes.map(route => route.name)).size).to.equal(4);
    expect(new Set(routes.map(route => route.handler))).to.deep.equal(new Set(['TestController-index']));
    const { resolveExtensions } = require('@researchdatabox/redbox-core/extensions');
    const express = require('node:module').createRequire(require.resolve('@researchdatabox/redbox-core/extensions'))(
      'express'
    );
    const app = express();
    const resolved = resolveExtensions([
      {
        name: 'generated',
        root: tempRoot,
        declaration: {
          apiVersion: 1,
          routes,
          handlers: [
            { name: 'TestController-index', create: () => (_req: any, res: any) => res.json({ served: true }) },
          ],
        },
      },
    ]);
    for (const { declaration: route } of resolved.routes)
      app[route.method](route.path, (_req: any, res: any) => res.json({ handler: route.handler }));
    const server = app.listen(0, '127.0.0.1');
    try {
      await new Promise(resolve => server.once('listening', resolve));
      const url = 'http://127.0.0.1:' + server.address().port;
      for (const route of routes) {
        const response = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
          const req = request(
            url + route.path.replace(':branding', 'default').replace(':portal', 'portal').replace(':"item-id"', '123'),
            { method: route.method.toUpperCase() },
            res => {
              let body = '';
              res.setEncoding('utf8');
              res.on('data', chunk => {
                body += chunk;
              });
              res.on('error', reject);
              res.on('end', () => resolve({ status: res.statusCode, body }));
            }
          );
          req.on('error', reject);
          req.end();
        });
        expect(response.status).to.equal(200);
        expect(JSON.parse(response.body)).to.deep.equal({ handler: 'TestController-index' });
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error?: Error) => (error ? reject(error) : resolve()))
      );
    }
  });

  it('should handle webservice controllers', async () => {
    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'controllers', 'webservice'), { recursive: true });

    const paths = pathsModule.resolvePaths({ root: tempRoot });
    const generator = new controllerGeneratorModule.ControllerGenerator({
      name: 'Test',
      actions: ['index'],
      webservice: true,
      routes: [{ action: 'index', verb: 'post', path: '/api/test' }],
      auth: ['Admin'],
      root: tempRoot,
      paths,
    });

    await generator.generate();

    const controllerPath = path.join(coreTypesRoot, 'src', 'controllers', 'webservice', 'TestController.ts');
    expect(fs.existsSync(controllerPath)).to.be.true;

    const indexContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'controllers', 'index.ts'), 'utf-8');
    expect(indexContent).to.contain("export * from './webservice/TestController'");
    expect(indexContent).to.contain('TestController');
    expect(indexContent).not.to.contain('getOrCreate');

    const routesContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'extensionRoutes.ts'), 'utf-8');
    expect(routesContent).to.contain('handler: "api-TestController-index"');
    const { Project } = require('ts-morph');
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { module: 1 } });
    const emitted = project.createSourceFile('/routes.ts', routesContent).getEmitOutput().getOutputFiles()[0].getText();
    const output = { exports: {} };
    new Function('exports', emitted)(output.exports);
    const routes = (output.exports as { routes: Array<{ access: string[] }> }).routes;
    const {
      createHttpPolicies,
      createHttpCsrf,
      bindHttpPolicies,
    } = require('@researchdatabox/redbox-core/http/express');
    const csrf = createHttpCsrf({ origins: ['https://portal.example.invalid'] });
    expect(routes[0].access.map(name => name.toLowerCase())).to.deep.equal([
      'nocache',
      'brandingandportal',
      'iswebserviceauthenticated',
      'brandactor',
      'checkauth',
      'csrf',
    ]);
    expect(() =>
      bindHttpPolicies(
        routes[0].access.map(name => name.toLowerCase()),
        {
          ...createHttpPolicies({}),
          csrf: csrf.apiProtect,
        }
      )
    ).not.to.throw();

    const authContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'auth.config.ts'), 'utf-8');
    expect(authContent).to.contain("{ path: '/api/test', role: 'Admin', can_update: true }");
  });

  it('should support multiple action-to-route mappings', async () => {
    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'controllers', 'webservice'), { recursive: true });

    const paths = pathsModule.resolvePaths({ root: tempRoot });
    const generator = new controllerGeneratorModule.ControllerGenerator({
      name: 'Dashboard',
      actions: ['listDashboards', 'getDashboard', 'createDashboard', 'updateDashboard', 'deleteDashboard'],
      webservice: true,
      routes: [
        {
          action: 'listDashboards',
          verb: 'get',
          path: '/:branding/:portal/api/dashboards',
          auth: ['Admin', 'Researcher'],
        },
        {
          action: 'getDashboard',
          verb: 'get',
          path: '/:branding/:portal/api/dashboards/:id',
          auth: ['Admin', 'Researcher'],
        },
        { action: 'createDashboard', verb: 'post', path: '/:branding/:portal/api/dashboards', auth: ['Admin'] },
        { action: 'updateDashboard', verb: 'put', path: '/:branding/:portal/api/dashboards/:id', auth: ['Admin'] },
        { action: 'deleteDashboard', verb: 'delete', path: '/:branding/:portal/api/dashboards/:id', auth: ['Admin'] },
      ],
      root: tempRoot,
      paths,
    });

    await generator.generate();

    const controllerPath = path.join(coreTypesRoot, 'src', 'controllers', 'webservice', 'DashboardController.ts');
    expect(fs.existsSync(controllerPath)).to.be.true;

    const content = fs.readFileSync(controllerPath, 'utf-8');
    expect(content).to.contain('public async listDashboards');
    expect(content).to.contain('public async getDashboard');
    expect(content).to.contain('public async createDashboard');
    expect(content).to.contain('public async updateDashboard');
    expect(content).to.contain('public async deleteDashboard');

    const routesContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'extensionRoutes.ts'), 'utf-8');
    expect(routesContent).to.contain('handler: "api-DashboardController-listDashboards"');
    expect(routesContent).to.contain('handler: "api-DashboardController-getDashboard"');
    expect(routesContent).to.contain('handler: "api-DashboardController-createDashboard"');
    expect(routesContent).to.contain('handler: "api-DashboardController-updateDashboard"');
    expect(routesContent).to.contain('handler: "api-DashboardController-deleteDashboard"');

    const authContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'auth.config.ts'), 'utf-8');
    // GET routes should have can_read for both Admin and Researcher
    expect(authContent).to.contain("{ path: '/:branding/:portal/api/dashboards', role: 'Admin', can_read: true }");
    expect(authContent).to.contain("{ path: '/:branding/:portal/api/dashboards', role: 'Researcher', can_read: true }");
    // POST/PUT/DELETE routes should only have Admin with can_update
    expect(authContent).to.contain("{ path: '/:branding/:portal/api/dashboards', role: 'Admin', can_update: true }");
    expect(authContent).to.contain(
      "{ path: '/:branding/:portal/api/dashboards/:id', role: 'Admin', can_update: true }"
    );
    // Researcher should NOT have update access
    expect(authContent).to.not.contain(
      "{ path: '/:branding/:portal/api/dashboards', role: 'Researcher', can_update: true }"
    );
  });
});
