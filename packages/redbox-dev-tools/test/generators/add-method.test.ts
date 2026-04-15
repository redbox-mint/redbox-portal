const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const os = require('os');
const loadTs = require('../support/load-ts.cjs');
const addMethodGeneratorModule = loadTs(module, '../../src/generators/add-method');
const pathsModule = loadTs(module, '../../src/utils/paths');

describe('AddMethodGenerator', () => {
  let tempRoot: string;
  let coreTypesRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-test-'));
    coreTypesRoot = path.join(tempRoot, 'packages', 'redbox-core');

    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'controllers'), { recursive: true });
    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'services'), { recursive: true });
    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'config'), { recursive: true });

    // Create mock index files
    fs.writeFileSync(
      path.join(coreTypesRoot, 'src', 'controllers', 'index.ts'),
      `
export const ControllerExports: Record<string, any> = {};
export const ControllerNames: string[] = [];
`
    );
    fs.writeFileSync(
      path.join(coreTypesRoot, 'src', 'services', 'index.ts'),
      `
export const ServiceExports: Record<string, any> = {};
`
    );

    // Create mock routes.config.ts
    fs.writeFileSync(
      path.join(coreTypesRoot, 'src', 'config', 'routes.config.ts'),
      `
export const routes: any = {
    '/': 'RenderViewController.render',
};
`
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

    // Create a mock package.json
    fs.writeFileSync(path.join(coreTypesRoot, 'package.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should add a method to an existing controller', async () => {
    const controllerPath = path.join(coreTypesRoot, 'src', 'controllers', 'TestController.ts');
    fs.writeFileSync(
      controllerPath,
      `
export namespace Controllers {
  export class Test extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = [
      'init'
    ];
    public init(): void {}
  }
}
`
    );

    const paths = pathsModule.resolvePaths({ root: tempRoot });
    const generator = new addMethodGeneratorModule.AddMethodGenerator({
      file: controllerPath,
      method: 'newMethod',
      route: 'get /new-route',
      auth: ['Admin'],
      root: tempRoot,
      paths,
    });

    await generator.generate();

    const content = fs.readFileSync(controllerPath, 'utf-8');
    // console.log('CONTENT:', content);
    expect(content).to.contain('newMethod');
    expect(content).to.contain('this.sendResp(req, res');

    const routesContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'routes.config.ts'), 'utf-8');
    expect(routesContent).to.contain("'get /new-route': 'TestController.newMethod'");

    const authContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'auth.config.ts'), 'utf-8');
    expect(authContent).to.contain("{ path: '/new-route', role: 'Admin', can_read: true }");

    const indexContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'controllers', 'index.ts'), 'utf-8');
    expect(indexContent).to.contain("import * as TestControllerModule from './TestController'");
  });

  it('should add a method to an existing service', async () => {
    const servicePath = path.join(coreTypesRoot, 'src', 'services', 'TestService.ts');
    fs.writeFileSync(
      servicePath,
      `
export namespace Services {
  export class Test extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'init'
    ];
    public init(): void {}
  }
}
`
    );

    const paths = pathsModule.resolvePaths({ root: tempRoot });
    const generator = new addMethodGeneratorModule.AddMethodGenerator({
      file: servicePath,
      method: 'newServiceMethod',
      root: tempRoot,
      paths,
    });

    await generator.generate();

    const content = fs.readFileSync(servicePath, 'utf-8');
    expect(content).to.contain('newServiceMethod');
    expect(content).to.contain('sails.log.verbose');

    const indexContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'services', 'index.ts'), 'utf-8');
    expect(indexContent).to.contain("import * as TestServiceModule from './TestService'");
  });
});
