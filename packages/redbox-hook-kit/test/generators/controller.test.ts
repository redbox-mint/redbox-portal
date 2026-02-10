import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ControllerGenerator } from '../../src/generators/controller';
import { resolvePaths } from '../../src/utils/paths';

describe('ControllerGenerator', () => {
  let tempRoot: string;
  let coreTypesRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-test-'));
    coreTypesRoot = path.join(tempRoot, 'packages', 'redbox-core-types');

    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'controllers'), { recursive: true });
    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'config'), { recursive: true });

    // Create mock index.ts
    fs.writeFileSync(path.join(coreTypesRoot, 'src', 'controllers', 'index.ts'), `
import * as ActionControllerModule from './ActionController';

const controllerCache: Record<string, any> = {};
function getOrCreate(name: string, factory: () => any): any {
    if (!controllerCache[name]) controllerCache[name] = factory();
    return controllerCache[name];
}

export const ControllerExports: Record<string, any> = {
    get ActionController() { return getOrCreate('ActionController', () => new ActionControllerModule.Controllers.Action().exports()); },
};

export const ControllerNames = [
    'ActionController',
];
`);

    // Create mock routes.config.ts
    fs.writeFileSync(path.join(coreTypesRoot, 'src', 'config', 'routes.config.ts'), `
export const routes: any = {
    '/': 'RenderViewController.render',
};
`);

    // Create mock auth.config.ts
    fs.writeFileSync(path.join(coreTypesRoot, 'src', 'config', 'auth.config.ts'), `
export const auth: any = {
    rules: [
        { path: '/', role: 'Guest', can_read: true },
    ],
};
`);

    // Create a mock package.json so resolvePaths is happy
    fs.writeFileSync(path.join(coreTypesRoot, 'package.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should generate a controller and update index', async () => {
    const paths = resolvePaths({ root: tempRoot });
    const generator = new ControllerGenerator({
      name: 'Test',
      actions: ['index', 'save'],
      root: tempRoot,
      paths
    });

    await generator.generate();

    const controllerPath = path.join(coreTypesRoot, 'src', 'controllers', 'TestController.ts');
    expect(fs.existsSync(controllerPath)).to.be.true;

    const content = fs.readFileSync(controllerPath, 'utf-8');
    expect(content).to.contain('class Test extends controllers.Core.Controller');
    expect(content).to.contain('public async index');
    expect(content).to.contain('public async save');
    expect(content).to.contain("'index'");
    expect(content).to.contain("'save'");

    const indexContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'controllers', 'index.ts'), 'utf-8');
    // console.log('INDEX CONTENT:', indexContent);
    expect(indexContent).to.contain("import * as TestControllerModule from './TestController'");
    expect(indexContent).to.contain("TestController");
    expect(indexContent).to.contain("getOrCreate('TestController'");
    expect(indexContent).to.contain("'TestController'");
  });

  it('should update routes and auth', async () => {
    const paths = resolvePaths({ root: tempRoot });
    const generator = new ControllerGenerator({
      name: 'Test',
      actions: ['index'],
      routes: [{ action: 'index', verb: 'get', path: '/test-route' }],
      auth: ['Admin', 'Researcher'],
      root: tempRoot,
      paths
    });

    await generator.generate();

    const routesContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'routes.config.ts'), 'utf-8');
    expect(routesContent).to.contain("'get /test-route': 'TestController.index'");

    const authContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'auth.config.ts'), 'utf-8');
    expect(authContent).to.contain("{ path: '/test-route', role: 'Admin', can_read: true }");
    expect(authContent).to.contain("{ path: '/test-route', role: 'Researcher', can_read: true }");
  });

  it('should handle webservice controllers', async () => {
    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'controllers', 'webservice'), { recursive: true });
    // Add WebserviceControllerExports to index.ts
    fs.appendFileSync(path.join(coreTypesRoot, 'src', 'controllers', 'index.ts'), `
export const WebserviceControllerExports: Record<string, any> = {};
export const WebserviceControllerNames: string[] = [];
`);

    const paths = resolvePaths({ root: tempRoot });
    const generator = new ControllerGenerator({
      name: 'Test',
      actions: ['index'],
      webservice: true,
      routes: [{ action: 'index', verb: 'post', path: '/api/test' }],
      auth: ['Admin'],
      root: tempRoot,
      paths
    });

    await generator.generate();

    const controllerPath = path.join(coreTypesRoot, 'src', 'controllers', 'webservice', 'TestController.ts');
    expect(fs.existsSync(controllerPath)).to.be.true;

    const indexContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'controllers', 'index.ts'), 'utf-8');
    expect(indexContent).to.contain("import * as WSTestControllerModule from './webservice/TestController'");
    expect(indexContent).to.contain("TestController");
    expect(indexContent).to.contain("getOrCreate('WS_TestController'");

    const routesContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'routes.config.ts'), 'utf-8');
    expect(routesContent).to.contain("'post /api/test': { controller: 'webservice/TestController', action: 'index', csrf: false }");

    const authContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'auth.config.ts'), 'utf-8');
    expect(authContent).to.contain("{ path: '/api/test', role: 'Admin', can_update: true }");
  });

  it('should support multiple action-to-route mappings', async () => {
    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'controllers', 'webservice'), { recursive: true });
    fs.appendFileSync(path.join(coreTypesRoot, 'src', 'controllers', 'index.ts'), `
export const WebserviceControllerExports: Record<string, any> = {};
export const WebserviceControllerNames: string[] = [];
`);

    const paths = resolvePaths({ root: tempRoot });
    const generator = new ControllerGenerator({
      name: 'Dashboard',
      actions: ['listDashboards', 'getDashboard', 'createDashboard', 'updateDashboard', 'deleteDashboard'],
      webservice: true,
      routes: [
        { action: 'listDashboards', verb: 'get', path: '/:branding/:portal/api/dashboards', auth: ['Admin', 'Researcher'] },
        { action: 'getDashboard', verb: 'get', path: '/:branding/:portal/api/dashboards/:id', auth: ['Admin', 'Researcher'] },
        { action: 'createDashboard', verb: 'post', path: '/:branding/:portal/api/dashboards', auth: ['Admin'] },
        { action: 'updateDashboard', verb: 'put', path: '/:branding/:portal/api/dashboards/:id', auth: ['Admin'] },
        { action: 'deleteDashboard', verb: 'delete', path: '/:branding/:portal/api/dashboards/:id', auth: ['Admin'] }
      ],
      root: tempRoot,
      paths
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

    const routesContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'routes.config.ts'), 'utf-8');
    expect(routesContent).to.contain("'get /:branding/:portal/api/dashboards': { controller: 'webservice/DashboardController', action: 'listDashboards', csrf: false }");
    expect(routesContent).to.contain("'get /:branding/:portal/api/dashboards/:id': { controller: 'webservice/DashboardController', action: 'getDashboard', csrf: false }");
    expect(routesContent).to.contain("'post /:branding/:portal/api/dashboards': { controller: 'webservice/DashboardController', action: 'createDashboard', csrf: false }");
    expect(routesContent).to.contain("'put /:branding/:portal/api/dashboards/:id': { controller: 'webservice/DashboardController', action: 'updateDashboard', csrf: false }");
    expect(routesContent).to.contain("'delete /:branding/:portal/api/dashboards/:id': { controller: 'webservice/DashboardController', action: 'deleteDashboard', csrf: false }");

    const authContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'auth.config.ts'), 'utf-8');
    // GET routes should have can_read for both Admin and Researcher
    expect(authContent).to.contain("{ path: '/:branding/:portal/api/dashboards', role: 'Admin', can_read: true }");
    expect(authContent).to.contain("{ path: '/:branding/:portal/api/dashboards', role: 'Researcher', can_read: true }");
    // POST/PUT/DELETE routes should only have Admin with can_update
    expect(authContent).to.contain("{ path: '/:branding/:portal/api/dashboards', role: 'Admin', can_update: true }");
    expect(authContent).to.contain("{ path: '/:branding/:portal/api/dashboards/:id', role: 'Admin', can_update: true }");
    // Researcher should NOT have update access
    expect(authContent).to.not.contain("{ path: '/:branding/:portal/api/dashboards', role: 'Researcher', can_update: true }");
  });
});
