import * as path from 'path';
import { Project, QuoteKind } from 'ts-morph';
import { identifier } from '../utils/identifier';
import { Generator, GeneratorOptions } from '../utils/generator';
import { RedboxPaths } from '../utils/paths';
import {
  updateRoutes,
  updateAuth,
  updateControllerIndex,
  updateControllerRegistration,
  updateNavigationConfig,
  updateLanguageDefaults,
  NavigationMapping,
  LanguageDefaultEntry,
} from '../utils/config-helper';
import type { RouteAccess } from '@researchdatabox/redbox-core/http';

export interface RouteMapping {
  action: string;
  verb?: string; // GET, POST, PUT, DELETE, etc. Defaults to GET
  path: string;
  auth?: string[]; // Roles for this specific route (overrides controller-level auth)
  csrf?: boolean; // Optional override for CSRF protection (mainly for webservice routes)
  access?: RouteAccess;
}

export interface ControllerGeneratorOptions extends GeneratorOptions {
  name: string;
  actions?: string[];
  webservice?: boolean;
  /** @deprecated Use routes instead */
  route?: string;
  routes?: RouteMapping[];
  auth?: string[];
  public?: boolean;
  navigation?: NavigationMapping[];
  languageDefaults?: LanguageDefaultEntry[];
  className?: string;
  paths: RedboxPaths;
}

export class ControllerGenerator extends Generator {
  private name: string;
  private className: string;
  private actions: string[];
  private webservice: boolean;
  private routes: RouteMapping[];
  private auth?: string[];
  private public: boolean;
  private navigation: NavigationMapping[];
  private languageDefaults: LanguageDefaultEntry[];
  private paths: RedboxPaths;
  private project: Project;

  constructor(options: ControllerGeneratorOptions) {
    super(options);
    this.name = identifier(options.name);
    this.actions = options.actions || [];
    this.webservice = !!options.webservice;
    this.auth = options.auth;
    this.public = !!options.public;
    if (this.public && this.auth?.length) throw new Error('Choose public access or protected role rules.');
    this.navigation = options.navigation || [];
    this.languageDefaults = options.languageDefaults || [];
    this.paths = options.paths;
    const inferredClassName = this.name.endsWith('Controller') ? this.name.replace('Controller', '') : this.name;
    this.className = identifier(options.className || inferredClassName, 'class');
    this.project = new Project({
      manipulationSettings: {
        quoteKind: QuoteKind.Single,
      },
    });

    // Handle backwards compatibility: convert single route to routes array
    if (options.routes && options.routes.length > 0) {
      this.routes = options.routes;
    } else if (options.route) {
      // Legacy: single route maps to first action or 'index'
      const action = this.actions && this.actions.length > 0 ? this.actions[0] : 'index';
      this.routes = [{ action, path: options.route, verb: 'get' }];
    } else {
      this.routes = [];
    }
    if (
      this.routes.some(
        route =>
          (route.access?.kind === 'public' || (!route.access && this.public)) && (route.auth ?? this.auth)?.length
      )
    )
      throw new Error('Choose public access or protected role rules.');
    this.routes = this.routes.map(route => ({ ...route, action: identifier(route.action) }));
    this.actions = [
      ...new Set([...this.actions.map(action => identifier(action)), ...this.routes.map(route => route.action)]),
    ];
  }

  public async generate(): Promise<void> {
    const controllerName = this.name.endsWith('Controller') ? this.name : `${this.name}Controller`;
    const className = this.className;

    const controllerDir = path.join(this.paths.coreTypes, 'src', 'controllers', this.webservice ? 'webservice' : '');

    const controllerPath = path.join(controllerDir, `${controllerName}.ts`);

    const content = this.generateControllerContent(className);
    for (const route of this.routes)
      await updateRoutes({
        project: this.project,
        paths: this.paths,
        route: `${route.verb?.toLowerCase() ?? 'get'} ${route.path}`,
        controllerName,
        action: route.action,
        webservice: this.webservice,
        csrf: route.csrf,
        access: route.access ?? (this.public ? { kind: 'public' } : undefined),
        dryRun: true,
      });
    this.writeFile(controllerPath, content);

    if (!this.dryRun) {
      await updateControllerIndex({
        project: this.project,
        paths: this.paths,
        controllerName: controllerName,
        webservice: this.webservice,
        dryRun: this.dryRun,
      });
      await updateControllerRegistration({
        project: this.project,
        paths: this.paths,
        controllerName,
        className,
        webservice: this.webservice,
      });

      // Process each route mapping
      for (const routeMapping of this.routes) {
        const routeKey = routeMapping.verb
          ? `${routeMapping.verb.toLowerCase()} ${routeMapping.path}`
          : routeMapping.path;

        await updateRoutes({
          project: this.project,
          paths: this.paths,
          route: routeKey,
          controllerName: controllerName,
          action: routeMapping.action,
          webservice: this.webservice,
          csrf: routeMapping.csrf,
          access: routeMapping.access ?? (this.public ? { kind: 'public' } : undefined),
          dryRun: this.dryRun,
        });

        // Apply auth rules: use route-specific auth if provided, otherwise controller-level auth
        const routeAuth = routeMapping.auth || this.auth;
        if (routeAuth && routeAuth.length > 0) {
          await updateAuth({
            project: this.project,
            paths: this.paths,
            root: this.root,
            route: routeKey,
            auth: routeAuth,
            dryRun: this.dryRun,
          });
        }
      }

      if (this.navigation.length > 0) {
        for (const nav of this.navigation) {
          const actionName =
            nav.action ||
            (this.routes.length === 1
              ? this.routes[0].action
              : this.actions.length === 1
                ? this.actions[0]
                : undefined);
          if (!actionName) {
            console.warn('  [NAV] Navigation mapping missing action and cannot be inferred. Skipping.');
            continue;
          }
          const routeMapping = this.routes.find(r => r.action === actionName);
          if (!routeMapping) {
            console.warn(`  [NAV] No route mapping found for action '${actionName}'. Skipping.`);
            continue;
          }
          await updateNavigationConfig({
            project: this.project,
            paths: this.paths,
            root: this.root,
            mapping: {
              ...nav,
              href: routeMapping.path,
            },
            dryRun: this.dryRun,
          });
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
  }

  private generateControllerContent(className: string): string {
    const actionsCode = this.actions
      .map(
        action => `
  public async ${action}(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    // Read the live request after hooks; typed failures reach the host's safe error boundary.
    const result = await this.input.${action}(request);
    return reply.type('application/json; charset=utf-8').send(JSON.stringify(result));
  }`
      )
      .join('\n');
    return `import type { FastifyRequest, FastifyReply } from 'fastify';
import { defineController } from '@researchdatabox/redbox-core/http';

export interface ${className}Input {
  /** Supply the selected application operation; constructors acquire no resources. */
${this.actions.map(action => `  ${action}(request: FastifyRequest): Promise<unknown>;`).join('\n')}
}

export class ${className} {
  public constructor(private readonly input: ${className}Input) {}
${actionsCode}
}

export const controller = defineController({
  name: ${JSON.stringify(`${this.webservice ? 'webservice/' : ''}${this.name.endsWith('Controller') ? this.name : this.name + 'Controller'}`)},
  actions: ${JSON.stringify(this.actions)},
  create: (input: ${className}Input) => new ${className}(input),
});
`;
  }
}
