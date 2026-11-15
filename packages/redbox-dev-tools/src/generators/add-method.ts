import * as path from 'path';
import * as fs from 'fs';
import { Project, QuoteKind, SyntaxKind, ClassDeclaration, Scope } from 'ts-morph';
import { identifier } from '../utils/identifier';
import { controllerFactory } from '../utils/controller-factory';
import { Generator, GeneratorOptions } from '../utils/generator';
import { RedboxPaths } from '../utils/paths';
import {
  updateRoutes,
  updateAuth,
  updateServiceIndex,
  updateNavigationConfig,
  updateLanguageDefaults,
  NavigationMapping,
  LanguageDefaultEntry,
} from '../utils/config-helper';

export interface AddMethodGeneratorOptions extends GeneratorOptions {
  file: string;
  method: string;
  route?: string;
  http?: string;
  auth?: string[];
  public?: boolean;
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
  private public: boolean;
  private navigation: NavigationMapping[];
  private languageDefaults: LanguageDefaultEntry[];
  private paths: RedboxPaths;
  private project: Project;

  constructor(options: AddMethodGeneratorOptions) {
    super(options);
    this.filePath = path.isAbsolute(options.file) ? options.file : path.resolve(this.root, options.file);
    this.method = identifier(options.method);
    this.route = options.route;
    this.http = options.http || 'GET';
    this.auth = options.auth;
    this.public = !!options.public;
    if (this.public && this.auth?.length) throw new Error('Choose public access or protected role rules.');
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

    const info = isController ? controllerFactory(sourceFile) : undefined;
    const targetClass = info?.targetClass ?? sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ClassDeclaration);
    if (info) {
      // Validate a rerun before saving any controller/config changes.
      if (this.route)
        await updateRoutes({
          project: this.project,
          paths: this.paths,
          route: this.route.trim().includes(' ')
            ? this.route.trim()
            : `${this.http!.toLowerCase()} ${this.route.trim()}`,
          controllerName: path.basename(this.filePath, '.ts'),
          controllerIdentity: info.name,
          action: this.method,
          webservice: info.name.startsWith('webservice/'),
          access: this.public ? { kind: 'public' } : undefined,
          dryRun: true,
        });
      if (!info.actions.getElements().some(action => action.getText().replace(/["']/g, '') === this.method))
        info.actions.addElement(JSON.stringify(this.method));
      if (!info.input.getMethod(this.method))
        info.input.addMethod({
          name: this.method,
          parameters: [{ name: 'request', type: 'import("fastify").FastifyRequest' }],
          returnType: 'Promise<unknown>',
        });
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

    if (!this.dryRun) {
      // Existing API2 controllers already own their registration/bindings. In particular,
      // the scaffold registers exampleController directly; never register it a second time.
      if (!isController) {
        await updateServiceIndex({
          project: this.project,
          paths: this.paths,
          serviceName: fileName,
          dryRun: this.dryRun,
        });
      }
    }

    // 3. Update routes and auth if it's a controller and route is provided
    if (isController && this.route) {
      const trimmedRoute = this.route.trim().includes(' ')
        ? this.route.trim()
        : `${this.http!.toLowerCase()} ${this.route.trim()}`;
      if (!trimmedRoute) {
        throw new Error('Route cannot be empty or whitespace.');
      }

      const controllerName = fileName;
      const webservice = info!.name.startsWith('webservice/');

      await updateRoutes({
        project: this.project,
        paths: this.paths,
        route: trimmedRoute,
        controllerName: controllerName,
        controllerIdentity: info!.name,
        action: this.method,
        webservice: webservice,
        dryRun: this.dryRun,
        access: this.public ? { kind: 'public' } : undefined,
      });

      if (this.auth && this.auth.length > 0) {
        await updateAuth({
          project: this.project,
          paths: this.paths,
          root: this.root,
          route: trimmedRoute,
          auth: this.auth,
          dryRun: this.dryRun,
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
            console.warn(
              `  [NAV] Navigation mapping action '${actionName}' does not match method '${this.method}'. Skipping.`
            );
            continue;
          }
          await updateNavigationConfig({
            project: this.project,
            paths: this.paths,
            root: this.root,
            mapping: {
              ...nav,
              href: routePath,
            },
            dryRun: this.dryRun,
          });
        }
      }
    }

    if (this.languageDefaults.length > 0) {
      await updateLanguageDefaults({
        root: this.root,
        entries: this.languageDefaults,
        dryRun: this.dryRun,
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
            { name: 'request', type: 'import("fastify").FastifyRequest' },
            { name: 'reply', type: 'import("fastify").FastifyReply' },
          ],
          statements: `const result = await this.input.${this.method}(request);\nreturn reply.type('application/json; charset=utf-8').send(JSON.stringify(result));`,
        });
      } else {
        klass.addMethod({
          name: this.method,
          scope: Scope.Public,
          isAsync: true,
          returnType: 'Promise<Record<string, unknown>>',
          parameters: [{ name: '..._args', type: 'unknown[]' }],
          statements: [`return { message: 'Method ${this.method} in ${klass.getName()}' };`],
        });
      }
    }
  }
}
