let expect: typeof import('chai').expect;
let path: typeof import('path');
let fs: typeof import('fs');
let os: typeof import('os');
let angularServiceGeneratorModule: typeof import('../../src/generators/angular-service');
let pathsModule: typeof import('../../src/utils/paths');

export { };

describe('AngularServiceGenerator', () => {
  let tempRoot: string;
  let coreTypesRoot: string;
  let angularRoot: string;

  before(async () => {
    ({ expect } = await import('chai'));
    path = await import('path');
    fs = await import('fs');
    os = await import('os');
    angularServiceGeneratorModule = await import('../../src/generators/angular-service');
    pathsModule = await import('../../src/utils/paths');
  });

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-test-'));
    coreTypesRoot = path.join(tempRoot, 'packages', 'redbox-core');
    angularRoot = path.join(tempRoot, 'angular');

    fs.mkdirSync(path.join(angularRoot, 'projects', 'researchdatabox', 'test-app', 'src', 'app'), { recursive: true });

    // Create a mock package.json so resolvePaths is happy
    fs.mkdirSync(coreTypesRoot, { recursive: true });
    fs.writeFileSync(path.join(coreTypesRoot, 'package.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should generate an Angular service extending HttpClientService', async () => {
    const paths = pathsModule.resolvePaths({ root: tempRoot });
    const generator = new angularServiceGeneratorModule.AngularServiceGenerator({
      name: 'my-data',
      app: 'test-app',
      methods: ['getData', 'saveData'],
      root: tempRoot,
      paths,
    });

    await generator.generate();

    const servicePath = path.join(
      angularRoot,
      'projects',
      'researchdatabox',
      'test-app',
      'src',
      'app',
      'my-data.service.ts'
    );
    expect(fs.existsSync(servicePath)).to.be.true;

    const content = fs.readFileSync(servicePath, 'utf-8');
    expect(content).to.contain('export class MyDataService extends HttpClientService');
    expect(content).to.contain('this.enableCsrfHeader()');
    expect(content).to.contain('public async getData()');
    expect(content).to.contain('public async saveData()');
    expect(content).to.contain("providedIn: 'root'");
  });
});
