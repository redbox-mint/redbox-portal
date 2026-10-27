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
      `export const existingDeclaration = true;`
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
    expect(content).to.contain('class TestService');
    expect(content).to.contain('public async doSomething');
    expect(content).to.contain('public async processData');
    expect(content).to.contain('constructor(private readonly log: ILogger)');
    expect(content).not.to.contain('declare global');

    const indexContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'services', 'index.ts'), 'utf-8');
    expect(indexContent).to.contain("export * from './TestService'");
    expect(indexContent).not.to.contain('getOrCreateService');
    expect(indexContent).not.to.contain('ServiceExports');
  });
});
