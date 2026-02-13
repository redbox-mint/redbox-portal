import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AngularServiceGenerator } from '../../src/generators/angular-service';
import { resolvePaths } from '../../src/utils/paths';

describe('AngularServiceGenerator', () => {
  let tempRoot: string;
  let coreTypesRoot: string;
  let angularRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-test-'));
    coreTypesRoot = path.join(tempRoot, 'packages', 'redbox-core-types');
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
    const paths = resolvePaths({ root: tempRoot });
    const generator = new AngularServiceGenerator({
      name: 'my-data',
      app: 'test-app',
      methods: ['getData', 'saveData'],
      root: tempRoot,
      paths
    });

    await generator.generate();

    const servicePath = path.join(angularRoot, 'projects', 'researchdatabox', 'test-app', 'src', 'app', 'my-data.service.ts');
    expect(fs.existsSync(servicePath)).to.be.true;

    const content = fs.readFileSync(servicePath, 'utf-8');
    expect(content).to.contain('export class MyDataService extends HttpClientService');
    expect(content).to.contain('this.enableCsrfHeader()');
    expect(content).to.contain('public async getData()');
    expect(content).to.contain('public async saveData()');
    expect(content).to.contain("providedIn: 'root'");
  });
});
