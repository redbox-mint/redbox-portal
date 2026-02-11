import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AngularAppGenerator } from '../../src/generators/angular-app';
import { resolvePaths } from '../../src/utils/paths';

describe('AngularAppGenerator', () => {
  let tempRoot: string;
  let coreTypesRoot: string;
  let angularRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-test-'));
    coreTypesRoot = path.join(tempRoot, 'packages', 'redbox-core-types');
    angularRoot = path.join(tempRoot, 'angular');
    
    fs.mkdirSync(path.join(coreTypesRoot, 'src', 'config'), { recursive: true });
    fs.mkdirSync(path.join(angularRoot, 'projects', 'researchdatabox'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'views', 'default', 'default', 'admin'), { recursive: true });
    
    // Create mock angular.json
    fs.writeFileSync(path.join(angularRoot, 'angular.json'), JSON.stringify({
      version: 1,
      projects: {}
    }));

    // Create mock routes.config.ts
    fs.writeFileSync(path.join(coreTypesRoot, 'src', 'config', 'routes.config.ts'), `
export const routes: any = {
    '/': 'RenderViewController.render',
};
`);

    // Create mock auth.config.ts
    fs.writeFileSync(path.join(coreTypesRoot, 'src', 'config', 'auth.config.ts'), `
export const auth: any = {
    rules: [],
};
`);

    // Create a mock package.json so resolvePaths is happy
    fs.writeFileSync(path.join(coreTypesRoot, 'package.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should scaffold an Angular app and update configs', async () => {
    const paths = resolvePaths({ root: tempRoot });
    const generator = new AngularAppGenerator({
      name: 'test-app',
      ejsView: 'testView',
      auth: ['Admin'],
      root: tempRoot,
      paths
    });

    await generator.generate();

    // Check Angular files
    const projectPath = path.join(angularRoot, 'projects', 'researchdatabox', 'test-app');
    expect(fs.existsSync(path.join(projectPath, 'src', 'main.ts'))).to.be.true;
    expect(fs.existsSync(path.join(projectPath, 'src', 'app', 'test-app.module.ts'))).to.be.true;
    expect(fs.existsSync(path.join(projectPath, 'src', 'app', 'test-app.component.ts'))).to.be.true;

    // Check angular.json
    const angularJson = JSON.parse(fs.readFileSync(path.join(angularRoot, 'angular.json'), 'utf-8'));
    expect(angularJson.projects['@researchdatabox/test-app']).to.exist;
    expect(angularJson.projects['@researchdatabox/test-app'].architect.build.options.outputPath.base).to.equal('../assets/angular/test-app');

    // Check EJS view
    const viewPath = path.join(tempRoot, 'views', 'default', 'default', 'admin', 'testView.ejs');
    expect(fs.existsSync(viewPath)).to.be.true;
    const viewContent = fs.readFileSync(viewPath, 'utf-8');
    expect(viewContent).to.contain("let appName = 'test-app';");
    expect(viewContent).to.contain("<test-app");

    // Check routes
    const routesContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'routes.config.ts'), 'utf-8');
    expect(routesContent).to.contain("'/:branding/:portal/admin/test-app'");
    expect(routesContent).to.contain("'view': 'admin/testView'");

    // Check auth
    const authContent = fs.readFileSync(path.join(coreTypesRoot, 'src', 'config', 'auth.config.ts'), 'utf-8');
    expect(authContent).to.contain("path: '/:branding/:portal/admin/test-app'");
    expect(authContent).to.contain("role: 'Admin'");
  });
});
