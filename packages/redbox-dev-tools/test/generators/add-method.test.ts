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
export const existingDeclaration = true;
`
    );
    fs.writeFileSync(
      path.join(coreTypesRoot, 'src', 'services', 'index.ts'),
      `
export const existingDeclaration = true;
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
    const { ControllerGenerator } = require('../../src/generators/controller');
    await new ControllerGenerator({
      root: tempRoot,
      paths: pathsModule.resolvePaths({ root: tempRoot }),
      name: 'Test',
      actions: ['index'],
    }).generate();

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
    expect(content).to.contain('this.input.newMethod(request)');

    const routesContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'extensionRoutes.ts'), 'utf-8');
    expect(routesContent).to.contain('controller: "TestController"');

    const authContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'auth.config.ts'), 'utf-8');
    expect(authContent).to.contain("{ path: '/new-route', role: 'Admin', can_read: true }");

    const indexContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'controllers', 'index.ts'), 'utf-8');
    expect(indexContent).to.contain("from './TestController'");
    expect(content).to.contain('"newMethod"');
    expect(content).to.contain('interface TestInput');
  });

  it('should add a method to an existing service', async () => {
    const servicePath = path.join(coreTypesRoot, 'src', 'services', 'TestService.ts');
    fs.writeFileSync(
      servicePath,
      `
export namespace Services {
  export class Test {
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
    expect(content).to.contain("return { message: 'Method newServiceMethod in Test' }");
    expect(content).not.to.contain('_exportedMethods');

    const indexContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'services', 'index.ts'), 'utf-8');
    expect(indexContent).to.contain("export * from './TestService'");
  });
  it('updates native inputs/exposure once, honors --http and keeps CSRF with explicit public access', async () => {
    const paths = pathsModule.resolvePaths({ root: tempRoot });
    const { ControllerGenerator } = require('../../src/generators/controller');
    await new ControllerGenerator({ root: tempRoot, paths, name: 'Test', actions: ['index'] }).generate();
    const file = path.join(coreTypesRoot, 'src/controllers/TestController.ts');
    for (let n = 0; n < 2; n++)
      await new addMethodGeneratorModule.AddMethodGenerator({
        root: tempRoot,
        paths,
        file,
        method: 'publish',
        route: '/public',
        http: 'POST',
        public: true,
      }).generate();
    const { Project, SyntaxKind } = require('ts-morph');
    const project = new Project();
    const source = project.addSourceFileAtPath(file);
    expect(
      source
        .getClass('Test')
        .getMethods()
        .filter((m: any) => m.getName() === 'publish')
    ).to.have.length(1);
    expect(
      source
        .getInterface('TestInput')
        .getMethods()
        .filter((m: any) => m.getName() === 'publish')
    ).to.have.length(1);
    const routes = project
      .addSourceFileAtPath(path.join(coreTypesRoot, 'src/config/extensionRoutes.ts'))
      .getVariableDeclaration('routes')
      .getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
    expect(routes.getElements()).to.have.length(1);
    expect(routes.getText()).to.contain('method: "post"');
    expect(routes.getText()).to.contain('"kind": "public"');
    expect(routes.getText()).to.contain('csrf: true');
    expect(source.getText()).not.to.contain('express');
  });

  for (const initiallyPublic of [true, false])
    it(`rejects a conflicting ${initiallyPublic ? 'public to protected' : 'protected to public'} rerun without changing files`, async () => {
      const paths = pathsModule.resolvePaths({ root: tempRoot });
      const { ControllerGenerator } = require('../../src/generators/controller');
      await new ControllerGenerator({
        root: tempRoot,
        paths,
        name: 'Test',
        public: initiallyPublic,
        route: '/rerun',
        actions: ['read'],
        auth: initiallyPublic ? undefined : ['Admin'],
      }).generate();
      const file = path.join(coreTypesRoot, 'src/controllers/TestController.ts');
      const routeFile = path.join(coreTypesRoot, 'src/config/extensionRoutes.ts');
      const authFile = path.join(coreTypesRoot, 'src/config/auth.config.ts');
      const before = [file, routeFile, authFile].map(f => fs.readFileSync(f, 'utf8'));
      try {
        await new addMethodGeneratorModule.AddMethodGenerator({
          root: tempRoot,
          paths,
          file,
          method: 'read',
          route: '/rerun',
          public: !initiallyPublic,
          auth: initiallyPublic ? ['Admin'] : undefined,
        }).generate();
        throw new Error('Expected conflicting route rejection');
      } catch (error: any) {
        expect(error.message).to.contain('Conflicting declaration');
      }
      expect([file, routeFile, authFile].map(f => fs.readFileSync(f, 'utf8'))).to.deep.equal(before);
    });

  it('follows the exported factory to its class, input and declared identity', async () => {
    const paths = pathsModule.resolvePaths({ root: tempRoot });
    const file = path.join(coreTypesRoot, 'src/controllers/ExampleController.ts');
    fs.writeFileSync(
      file,
      `import {defineController as define} from '@researchdatabox/redbox-core/http';
      class Unrelated {}
      export interface Operations {}
      export class Example { constructor(private readonly input: Operations) {} }
      export const exampleController = define({name: 'ActualExampleController', actions: [], create: (input: Operations) => new Example(input)});`
    );
    await new addMethodGeneratorModule.AddMethodGenerator({
      root: tempRoot,
      paths,
      file,
      method: 'read',
      route: '/example',
    }).generate();
    const content = fs.readFileSync(file, 'utf8');
    expect(content).to.contain('this.input.read(request)');
    expect(content).to.match(/interface Operations\s*{\s*read\(/);
    expect(fs.readFileSync(path.join(coreTypesRoot, 'src/config/extensionRoutes.ts'), 'utf8')).to.contain(
      'controller: "ActualExampleController"'
    );
    expect(fs.existsSync(path.join(coreTypesRoot, 'src/config/extensionControllers.ts'))).to.equal(false);
    await new addMethodGeneratorModule.AddMethodGenerator({ root: tempRoot, paths, file, method: 'delete' }).generate();
    expect(fs.readFileSync(file, 'utf8')).to.contain('this.input.delete(request)');
  });

  it('rejects methods that collide with the injected input field', () => {
    expect(
      () =>
        new addMethodGeneratorModule.AddMethodGenerator({
          root: tempRoot,
          paths: pathsModule.resolvePaths({ root: tempRoot }),
          file: 'src/controllers/TestController.ts',
          method: 'input',
        })
    ).to.throw('Invalid generated identifier');
  });

  it('rejects legacy controllers before editing their source', async () => {
    const file = path.join(coreTypesRoot, 'src/controllers/LegacyController.ts');
    const original = 'export class Legacy {}';
    fs.writeFileSync(file, original);
    try {
      await new addMethodGeneratorModule.AddMethodGenerator({
        root: tempRoot,
        paths: pathsModule.resolvePaths({ root: tempRoot }),
        file,
        method: 'read',
      }).generate();
      throw new Error('Expected API2 migration guidance');
    } catch (error: any) {
      expect(error.message).to.contain('legacy controllers require explicit conversion');
    }
    expect(fs.readFileSync(file, 'utf8')).to.equal(original);
  });
});
