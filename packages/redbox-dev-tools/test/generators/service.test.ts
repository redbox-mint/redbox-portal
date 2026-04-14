const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const os = require('os');
const loadTs = require('../support/load-ts.cjs');
const serviceGeneratorModule = loadTs(module, '../../src/generators/service');
const pathsModule = loadTs(module, '../../src/utils/paths');

describe('ServiceGenerator', () => {
  let tempRoot: string;
  let coreTypesRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-test-'));
    coreTypesRoot = path.join(tempRoot, 'packages', 'redbox-core');

    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'services'), { recursive: true });

    // Create mock index.ts
    fs.writeFileSync(
      path.join(coreTypesRoot, 'src', 'services', 'index.ts'),
      `
import * as ConfigServiceModule from './ConfigService';

export { ConfigServiceModule as ConfigService };

const serviceCache: Record<string, any> = {};
function getOrCreateService(name: string, factory: () => any): any {
    if (!serviceCache[name]) serviceCache[name] = factory();
    return serviceCache[name];
}

export const ServiceExports = {
    get ConfigService() { return getOrCreateService('ConfigService', () => new ConfigServiceModule.Services.Config().exports()); },
};
`
    );

    // Create a mock package.json so resolvePaths is happy
    fs.writeFileSync(path.join(coreTypesRoot, 'package.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should generate a service and update index', async () => {
    const paths = pathsModule.resolvePaths({ root: tempRoot });
    const generator = new serviceGeneratorModule.ServiceGenerator({
      name: 'Test',
      methods: ['doSomething', 'processData'],
      root: tempRoot,
      paths,
    });

    await generator.generate();

    const servicePath = path.join(coreTypesRoot, 'src', 'services', 'TestService.ts');
    expect(fs.existsSync(servicePath)).to.be.true;

    const content = fs.readFileSync(servicePath, 'utf-8');
    expect(content).to.contain('class TestService extends services.Core.Service');
    expect(content).to.contain('public async doSomething');
    expect(content).to.contain('public async processData');
    expect(content).to.contain("'doSomething'");
    expect(content).to.contain("'processData'");

    const indexContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'services', 'index.ts'), 'utf-8');
    expect(indexContent).to.contain("import * as TestServiceModule from './TestService'");
    expect(indexContent).to.contain('export { TestServiceModule as TestService }');
    expect(indexContent).to.contain('get TestService()');
    expect(indexContent).to.contain("getOrCreateService('TestService'");
  });
});
