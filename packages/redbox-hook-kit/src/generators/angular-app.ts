import * as path from 'path';
import * as fs from 'fs';
import { Project, SyntaxKind } from 'ts-morph';
import { Generator, GeneratorOptions } from '../utils/generator';
import { RedboxPaths } from '../utils/paths';
import { updateRoutes, updateAuth } from '../utils/config-helper';

export interface AngularAppGeneratorOptions extends GeneratorOptions {
  name: string;
  ejsView: string;
  auth?: string[];
  paths: RedboxPaths;
}

export class AngularAppGenerator extends Generator {
  private name: string;
  private ejsView: string;
  private auth?: string[];
  private paths: RedboxPaths;
  private project: Project;

  constructor(options: AngularAppGeneratorOptions) {
    super(options);
    this.name = options.name.toLowerCase();
    this.ejsView = options.ejsView;
    this.auth = options.auth;
    this.paths = options.paths;
    this.project = new Project();
  }

  public async generate(): Promise<void> {
    // 1. Scaffold Angular app
    this.scaffoldAngularApp();

    // 2. Update angular.json
    this.updateAngularJson();

    // 3. Generate EJS view
    this.generateEjsView();

    // 4. Update route config
    await this.updateRouteConfig();

    // 5. Update auth config
    if (this.auth && this.auth.length > 0) {
      await this.updateAuthConfig();
    }
  }

  private scaffoldAngularApp(): void {
    const projectRoot = path.join(this.paths.angular, 'projects', 'researchdatabox', this.name);
    const srcRoot = path.join(projectRoot, 'src');
    const appRoot = path.join(srcRoot, 'app');

    const files = {
      'tsconfig.app.json': JSON.stringify({
        "extends": "../../../tsconfig.json",
        "compilerOptions": {
          "outDir": "../../../dist/out-tsc",
          "types": []
        },
        "files": [
          "src/main.ts"
        ],
        "include": [
          "src/**/*.d.ts"
        ]
      }, null, 2),
      'tsconfig.spec.json': JSON.stringify({
        "extends": "../../../tsconfig.json",
        "compilerOptions": {
          "outDir": "../../../dist/out-tsc",
          "types": [
            "jasmine"
          ]
        },
        "include": [
          "src/**/*.spec.ts",
          "src/**/*.d.ts"
        ]
      }, null, 2),
      'src/main.ts': `import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { ${this.toClassName(this.name)}Module } from './app/${this.name}.module';

platformBrowserDynamic().bootstrapModule(${this.toClassName(this.name)}Module)
  .catch(err => console.error(err));
`,
      'src/styles.scss': `/* Add application styles & imports to this file! */\n`,
      'src/favicon.ico': '',
      'src/assets/.gitkeep': '',
      'src/index.html': `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${this.toClassName(this.name)}</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/x-icon" href="favicon.ico">
</head>
<body>
  <${this.name}></${this.name}>
</body>
</html>
`,
      [`src/app/${this.name}.module.ts`]: `import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { APP_BASE_HREF, PlatformLocation, CommonModule } from '@angular/common';
import { RedboxPortalCoreModule, trimLastSlashFromUrl } from '@researchdatabox/portal-ng-common';
import { ${this.toClassName(this.name)}Component } from './${this.name}.component';

@NgModule({
  declarations: [
    ${this.toClassName(this.name)}Component
  ],
  imports: [
    BrowserModule,
    CommonModule,
    RedboxPortalCoreModule
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation]
    }
  ],
  bootstrap: [${this.toClassName(this.name)}Component]
})
export class ${this.toClassName(this.name)}Module { }
`,
      [`src/app/${this.name}.component.ts`]: `import { Component } from '@angular/core';

@Component({
  selector: '${this.name}',
  templateUrl: './${this.name}.component.html',
  styleUrls: ['./${this.name}.component.scss'],
  standalone: false
})
export class ${this.toClassName(this.name)}Component {
  title = '${this.name}';
}
`,
      [`src/app/${this.name}.component.html`]: `<div class="container-fluid">
  <h1>${this.toClassName(this.name)} App</h1>
  <p>${this.name} works!</p>
</div>
`,
      [`src/app/${this.name}.component.scss`]: ``,
    };

    for (const [relPath, content] of Object.entries(files)) {
      this.writeFile(path.join(projectRoot, relPath), content);
    }
  }

  private updateAngularJson(): void {
    const angularJsonPath = path.join(this.paths.angular, 'angular.json');
    if (!fs.existsSync(angularJsonPath)) {
      console.warn(`Warning: Could not find angular.json at ${angularJsonPath}`);
      return;
    }

    let angularJson: any;
    try {
      angularJson = JSON.parse(fs.readFileSync(angularJsonPath, 'utf-8'));
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error parsing angular.json at ${angularJsonPath}: ${message}`);
      return;
    }
    const projectName = `@researchdatabox/${this.name}`;

    if (typeof angularJson.projects !== 'object' || angularJson.projects === null) {
      angularJson.projects = {};
    }

    if (angularJson.projects[projectName]) {
      console.log(`  [SKIP] angular.json project ${projectName} already exists`);
      return;
    }

    angularJson.projects[projectName] = {
      "projectType": "application",
      "schematics": {
        "@schematics/angular:component": {
          "style": "scss"
        }
      },
      "root": `projects/researchdatabox/${this.name}`,
      "sourceRoot": `projects/researchdatabox/${this.name}/src`,
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@angular-devkit/build-angular:application",
          "options": {
            "outputPath": {
              "base": `../assets/angular/${this.name}`
            },
            "index": `projects/researchdatabox/${this.name}/src/index.html`,
            "polyfills": [
              "zone.js"
            ],
            "tsConfig": `projects/researchdatabox/${this.name}/tsconfig.app.json`,
            "inlineStyleLanguage": "scss",
            "assets": [
              `projects/researchdatabox/${this.name}/src/favicon.ico`,
              `projects/researchdatabox/${this.name}/src/assets`
            ],
            "styles": [
              `projects/researchdatabox/${this.name}/src/styles.scss`
            ],
            "scripts": [],
            "browser": `projects/researchdatabox/${this.name}/src/main.ts`
          },
          "configurations": {
            "production": {
              "budgets": [
                {
                  "type": "initial",
                  "maximumWarning": "500kb",
                  "maximumError": "1mb"
                },
                {
                  "type": "anyComponentStyle",
                  "maximumWarning": "2kb",
                  "maximumError": "4kb"
                }
              ],
              "outputHashing": "all"
            },
            "development": {
              "optimization": false,
              "extractLicenses": false,
              "sourceMap": true
            }
          },
          "defaultConfiguration": "production"
        }
      }
    };

    this.writeFile(angularJsonPath, JSON.stringify(angularJson, null, 2));
  }

  private generateEjsView(): void {
    const safeViewName = this.getSafeEjsViewName();
    const baseDir = path.join(this.root, 'views', 'default', 'default', 'admin');
    const viewPath = path.resolve(baseDir, `${safeViewName}.ejs`);
    if (!viewPath.startsWith(path.resolve(baseDir) + path.sep)) {
      throw new Error(`EJS view name resolves outside the admin views directory: ${safeViewName}`);
    }
    
    const content = `<% let appName = '${this.name}'; %>
<div class="row admin-layout">
  <div class="col-md-3 col-lg-2">
    <%- include('layout/sidebar.ejs') %>
  </div>
  <div class="col-md-9 col-lg-10 admin-main-content">
    <${this.name} <% if (typeof contentSecurityPolicyNonce !== "undefined" && contentSecurityPolicyNonce) {%>ngCspNonce="<%= contentSecurityPolicyNonce %>"<% } %>>
      <div class="col-xs-12">
        <img class="center-block" src="<%= BrandingService.getRootContext() %>/images/loading.svg" alt="<%= TranslationService.t('loading-alt-text') %>">
      </div>
    </${this.name}>
  </div>
</div>
<script src="<%= BrandingService.getRootContext() %>/angular/<%=appName%>/browser/polyfills<%=CacheService.getNgAppFileHash(appName, 'polyfills', '-') %>.js"
   type="module"></script>

<script src="<%= BrandingService.getRootContext() %>/angular/<%=appName%>/browser/main<%=CacheService.getNgAppFileHash(appName, 'main', '-') %>.js"
   type="module"></script>
<link rel="stylesheet" href="<%= BrandingService.getRootContext() %>/angular/<%= appName %>/browser/styles<%=CacheService.getNgAppFileHash(appName, 'styles', '-')%>.css">
`;

    this.writeFile(viewPath, content);
  }

  private async updateRouteConfig(): Promise<void> {
    const route = `/:branding/:portal/admin/${this.name}`; // Defaulting to admin path
    const safeViewName = this.getSafeEjsViewName();
    
    // We can't use updateRoutes directly because it assumes a controller.action string
    // But here we want a RouteTargetObject with locals.view
    
    const routesPath = path.join(this.paths.coreTypes, 'src', 'config', 'routes.config.ts');
    if (!fs.existsSync(routesPath)) return;

    const sourceFile = this.project.addSourceFileAtPath(routesPath);
    const routesVar = sourceFile.getVariableDeclaration('routes');
    if (!routesVar) return;

    const initializer = routesVar.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    if (!initializer) return;

    if (!initializer.getProperty(`'${route}'`) && !initializer.getProperty(`"${route}"`)) {
        initializer.addPropertyAssignment({
            name: `'${route}'`,
            initializer: `{
                controller: 'RenderViewController',
                action: 'render',
                locals: { 'view': 'admin/${safeViewName}' }
            }`
        });
    }

    sourceFile.formatText();
    if (!this.dryRun) {
        await sourceFile.save();
        console.log(`  [UPDATE] ${path.relative(this.root, routesPath)}`);
    }
  }

  private async updateAuthConfig(): Promise<void> {
    const route = `/:branding/:portal/admin/${this.name}`;
    await updateAuth({
        project: this.project,
        paths: this.paths,
        root: this.root,
        route: route,
        auth: this.auth!,
        dryRun: this.dryRun
    });
  }

  private toClassName(name: string): string {
    return name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  }

  private getSafeEjsViewName(): string {
    const trimmed = this.ejsView.trim();
    if (!trimmed) {
      throw new Error('EJS view name cannot be empty.');
    }
    if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
      throw new Error(`EJS view name contains invalid characters: '${this.ejsView}'`);
    }
    return trimmed;
  }
}
