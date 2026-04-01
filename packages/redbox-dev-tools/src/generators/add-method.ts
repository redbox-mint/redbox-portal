import * as path from 'path';
import * as fs from 'fs';
import { Project, QuoteKind, SyntaxKind, ClassDeclaration, Scope } from 'ts-morph';
import { Generator, GeneratorOptions } from '../utils/generator';
import { RedboxPaths } from '../utils/paths';
import { updateRoutes, updateAuth, updateControllerIndex, updateServiceIndex, updateNavigationConfig, updateLanguageDefaults, NavigationMapping, LanguageDefaultEntry } from '../utils/config-helper';

export interface AddMethodGeneratorOptions extends GeneratorOptions {
  file: string;
  method: string;
  route?: string;
  http?: string;
  auth?: string[];
  navigation?: NavigationMapping[];
  languageDefaults?: LanguageDefaultEntry[];
  paths: RedboxPaths;
}

export class AddMethodGenerator extends Generator {
  private filePath: string;
  private method: string;
  private route?: string;
  private http?: string;
  private auth?: string[];
  private navigation: NavigationMapping[];
  private languageDefaults: LanguageDefaultEntry[];
  private paths: RedboxPaths;
  private project: Project;

  constructor(options: AddMethodGeneratorOptions) {
    super(options);
    this.filePath = path.isAbsolute(options.file) ? options.file : path.resolve(this.root, options.file);
    this.method = options.method;
    this.route = options.route;
    this.http = options.http || 'GET';
    this.auth = options.auth;
    this.navigation = options.navigation || [];
    this.languageDefaults = options.languageDefaults || [];
    this.paths = options.paths;
    this.project = new Project({
      manipulationSettings: {
        quoteKind: QuoteKind.Single,
      },
    });
  }

  public async generate(): Promise<void> {
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`File not found: ${this.filePath}`);
    }

    const sourceFile = this.project.addSourceFileAtPath(this.filePath);
    const relativePath = path.relative(this.root, this.filePath);

    // 1. Identify if it's a Controller or Service
    const isController = this.filePath.endsWith('Controller.ts');
    const isService = this.filePath.endsWith('Service.ts');

    if (!isController && !isService) {
      throw new Error('Target file must be a Controller or Service (.ts)');
    }

    // 2. Find the class
    const targetClass = sourceFile.getFirstDescendantByKind(SyntaxKind.ClassDeclaration);
    if (!targetClass) {
      throw new Error('Could not find a class in the target file');
    }
    this.updateClass(targetClass, isController);

    sourceFile.formatText();

    if (this.dryRun) {
      console.log(`  [UPDATE] ${relativePath} (dry run)`);
    } else {
      await sourceFile.save();
      console.log(`  [UPDATE] ${relativePath}`);
    }

    const fileName = path.basename(this.filePath, '.ts');
    const className = isController ? fileName.replace('Controller', '') : fileName.replace('Service', '');

    if (!this.dryRun) {
      if (isController) {
        await updateControllerIndex({
          project: this.project,
          paths: this.paths,
          root: this.root,
          controllerName: fileName,
          className: className,
          webservice: this.filePath.includes(path.join('controllers', 'webservice')),
          dryRun: this.dryRun
        });
      } else {
        await updateServiceIndex({
          project: this.project,
          paths: this.paths,
          root: this.root,
          serviceName: fileName,
          className: className,
          dryRun: this.dryRun
        });
      }
    }

    // 3. Update routes and auth if it's a controller and route is provided
    if (isController && this.route) {
      const trimmedRoute = this.route.trim();
      if (!trimmedRoute) {
        throw new Error('Route cannot be empty or whitespace.');
      }

      const controllerName = fileName;
      const webservice = this.filePath.includes(path.join('controllers', 'webservice'));

      await updateRoutes({
        project: this.project,
        paths: this.paths,
        root: this.root,
        route: trimmedRoute,
        controllerName: controllerName,
        action: this.method,
        webservice: webservice,
        dryRun: this.dryRun
      });

      if (this.auth && this.auth.length > 0) {
        await updateAuth({
          project: this.project,
          paths: this.paths,
          root: this.root,
          route: trimmedRoute,
          auth: this.auth,
          dryRun: this.dryRun
        });
      }

      if (this.navigation.length > 0) {
        const routePath = trimmedRoute.split(' ').pop();
        if (!routePath) {
          throw new Error(`Route is missing a path segment: '${trimmedRoute}'.`);
        }
        for (const nav of this.navigation) {
          const actionName = nav.action || this.method;
          if (actionName !== this.method) {
            console.warn(`  [NAV] Navigation mapping action '${actionName}' does not match method '${this.method}'. Skipping.`);
            continue;
          }
          await updateNavigationConfig({
            project: this.project,
            paths: this.paths,
            root: this.root,
            mapping: {
              ...nav,
              href: routePath
            },
            dryRun: this.dryRun
          });
        }
      }
    }

    if (this.languageDefaults.length > 0) {
      await updateLanguageDefaults({
        root: this.root,
        entries: this.languageDefaults,
        dryRun: this.dryRun
      });
    }
  }

  private updateClass(klass: ClassDeclaration, isController: boolean): void {
    // 1. Add method stub if it doesn't exist
    if (!klass.getMethod(this.method)) {
      if (isController) {
        klass.addMethod({
          name: this.method,
          scope: Scope.Public,
          isAsync: true,
          returnType: 'Promise<unknown>',
          parameters: [
            { name: 'req', type: 'Sails.Req' },
            { name: 'res', type: 'Sails.Res' }
          ],
          statements: `return this.sendResp(req, res, { data: { message: 'Action ${this.method} in ${klass.getName()}' } });`
        });
      } else {
        klass.addMethod({
          name: this.method,
          scope: Scope.Public,
          isAsync: true,
          returnType: 'Promise<Record<string, unknown>>',
          parameters: [
            { name: '..._args', type: 'unknown[]' }
          ],
          statements: [
            `sails.log.verbose(\`\${this.logHeader} ${this.method} called\`);`,
            `return { message: 'Method ${this.method} in ${klass.getName()}' };`
          ]
        });
      }
    }

    // 2. Update _exportedMethods
    const exportedMethodsProp = klass.getProperty('_exportedMethods');
    if (exportedMethodsProp) {
      const initializer = exportedMethodsProp.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
      if (initializer) {
        if (!initializer.getElements().some((e: any) => e.getText().replace(/['"]/g, '') === this.method)) {
          initializer.addElement(`'${this.method}'`);
        }
      }
    } else {
      // Create _exportedMethods if missing
      const hasInit = !!klass.getMethod('init');
      const methods = hasInit ? ['init', this.method] : [this.method];
      klass.addProperty({
        name: '_exportedMethods',
        scope: Scope.Protected,
        hasOverrideKeyword: true,
        type: 'string[]',
        initializer: `[${methods.map(m => `'${m}'`).join(', ')}]`
      });
    }
  }
}
