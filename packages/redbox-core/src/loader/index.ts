import { promises as fs } from 'fs';
import fsSync from 'fs';
import type { Dirent } from 'fs';
import _ from 'lodash';
import path from 'path';
import { performance } from 'perf_hooks';
import { handlebarsCompile } from '@researchdatabox/sails-ng-common';

import {
  actionRegistrationSource,
  actionRegistrationSourceFromModule,
  buildActionRegistry,
  compareCodeUnits,
  registerRedboxActions as registerCoreRedboxActions,
  type ActionRegistrationSource,
  type RedboxActionRegistry,
} from '../action-registry';
import { getHookProcessingOrder } from '../hooks/hookDiscovery';
import {
  isRuntimeArray,
  isRuntimeRecord,
  loadRuntimeModule,
  readRuntimeProperty,
  runtimeFunction,
  writeRuntimeProperty,
  type RuntimeFunction,
  type RuntimeRecord,
  type RuntimeValue,
} from '../runtimeValues';

export type { RedboxMigration } from './MigrationRunner';

export interface LoaderOptions {
  forceRegenerate?: boolean;
  verbose?: boolean;
}

export interface HookBootstrapRegistration {
  name: string;
  module: string;
}

export interface HookMigrationRegistration {
  name: string;
  module: string;
}

export interface HookApiRouteRegistration extends HookModuleRegistration {
  name: string;
}

export interface HookModuleRegistration {
  module: string;
}

export interface HookPolicyRegistration extends HookModuleRegistration {
  exportName?: string;
}

export interface HookServiceRegistration extends HookModuleRegistration {}

export interface HookControllerRegistration extends HookModuleRegistration {}

export interface HookModelRegistration extends HookModuleRegistration {}

export interface HookActionRegistration extends HookModuleRegistration {
  packageName: string;
  moduleName: string;
}

export interface ActionRegistrations {
  actionRegistry: RedboxActionRegistry;
  hookActions: HookActionRegistration[];
}

export interface HookRegistrations {
  hookModels: Record<string, HookModelRegistration>;
  hookPolicies: Record<string, HookPolicyRegistration>;
  hookBootstraps: HookBootstrapRegistration[];
  hookMigrations: HookMigrationRegistration[];
  hookApiRoutes: HookApiRouteRegistration[];
  hookServices: Record<string, HookServiceRegistration>;
  hookControllers: Record<string, HookControllerRegistration>;
  hookWebserviceControllers: Record<string, HookControllerRegistration>;
  hookFormConfigs: Record<string, HookModuleRegistration>;
}

export interface HookConfigRegistration {
  name: string;
  module: string;
}

export interface HookConfigRegistrations {
  hookConfigs: HookConfigRegistration[];
}

export interface GenerationStats {
  generated: number;
  total: number;
}

export interface HookGenerationStats extends GenerationStats {
  fromHooks: number;
}

export interface FormConfigGenerationStats extends HookGenerationStats {
  indexCount: number;
  loadDefaultForms: boolean;
}

export interface BootstrapGenerationStats extends GenerationStats {
  hookCount: number;
}

export interface RegenerationDecision {
  shouldRegenerate: boolean;
  reason: string;
  deleteMarker: boolean;
}

export interface GenerateAllShimsStats {
  modelStats: HookGenerationStats;
  policyStats: HookGenerationStats;
  middlewareStats: GenerationStats;
  responseStats: GenerationStats;
  serviceStats: HookGenerationStats;
  controllerStats: HookGenerationStats;
  formConfigStats: FormConfigGenerationStats;
  configShimStats: GenerationStats;
  apiRouteHookStats: GenerationStats;
  bootstrapStats: BootstrapGenerationStats;
  migrationStats: GenerationStats;
  actionRegistryStats: GenerationStats;
}

export interface GenerateAllShimsSkippedResult {
  skipped: true;
  reason: string;
}

export interface GenerateAllShimsSuccessResult {
  skipped: false;
  reason: string;
  stats: GenerateAllShimsStats;
  totalTimeMs: number;
}

export type GenerateAllShimsResult = GenerateAllShimsSkippedResult | GenerateAllShimsSuccessResult;

type RedboxConfigMap = RuntimeRecord;

const retiredControllerShimFilename = `${['Action', 'Controller'].join('')}.js`;
const retiredConfigShimFilename = `${['act', 'ion'].join('')}.js`;

interface RuntimeMergeLibrary {
  isPlainObject(value: RuntimeValue): boolean;
  merge(target: RuntimeRecord, ...sources: RuntimeRecord[]): RuntimeRecord;
  mergeWith(
    target: RuntimeRecord,
    ...sourcesAndCustomizer: Array<RuntimeRecord | ((left: RuntimeValue, right: RuntimeValue) => RuntimeValue)>
  ): RuntimeRecord;
  cloneDeep(value: RuntimeRecord): RuntimeRecord;
}

function requiredRuntimeCallable(value: RuntimeValue, label: string): RuntimeFunction {
  const callable = runtimeFunction(value);
  if (callable === undefined) {
    throw new TypeError(`${label} is unavailable.`);
  }
  return callable;
}

function requiredLibraryFunction(library: RuntimeValue, functionName: string): RuntimeFunction {
  return requiredRuntimeCallable(readRuntimeProperty(library, functionName), `Lodash ${functionName}`);
}

function requiredRuntimeRecord(value: RuntimeValue, operation: string): RuntimeRecord {
  if (!isRuntimeRecord(value)) {
    throw new TypeError(`Lodash ${operation} did not return an object.`);
  }
  return value;
}

const lodashIsPlainObject = requiredLibraryFunction(_, 'isPlainObject');
const lodashMerge = requiredLibraryFunction(_, 'merge');
const lodashMergeWith = requiredLibraryFunction(_, 'mergeWith');
const lodashCloneDeep = requiredLibraryFunction(_, 'cloneDeep');
const loaderTemplateCompiler = requiredRuntimeCallable(handlebarsCompile, 'The Handlebars compiler');

const runtimeMerge: RuntimeMergeLibrary = Object.freeze({
  isPlainObject(value: RuntimeValue): boolean {
    return lodashIsPlainObject.invoke(value) === true;
  },
  merge(target: RuntimeRecord, ...sources: RuntimeRecord[]): RuntimeRecord {
    return requiredRuntimeRecord(lodashMerge.invoke(target, ...sources), 'merge');
  },
  mergeWith(
    target: RuntimeRecord,
    ...sourcesAndCustomizer: Array<RuntimeRecord | ((left: RuntimeValue, right: RuntimeValue) => RuntimeValue)>
  ): RuntimeRecord {
    return requiredRuntimeRecord(lodashMergeWith.invoke(target, ...sourcesAndCustomizer), 'mergeWith');
  },
  cloneDeep(value: RuntimeRecord): RuntimeRecord {
    return requiredRuntimeRecord(lodashCloneDeep.invoke(value), 'cloneDeep');
  },
});

function isPlainRuntimeRecord(value: RuntimeValue): value is RuntimeRecord {
  return isRuntimeRecord(value) && runtimeMerge.isPlainObject(value);
}

function normalizeAgendaJobsConfig(jobs: RuntimeValue): RedboxConfigMap {
  const normalized: RedboxConfigMap = {};
  if (isRuntimeArray(jobs)) {
    for (const job of jobs) {
      if (!isPlainRuntimeRecord(job)) {
        continue;
      }
      const jobName = String(job.name ?? '').trim();
      if (jobName === '') {
        continue;
      }
      const { name: _name, ...jobConfig } = job;
      normalized[jobName] = jobConfig;
    }
    return normalized;
  }
  if (isPlainRuntimeRecord(jobs)) {
    for (const [jobName, jobConfig] of Object.entries(jobs)) {
      if (!isPlainRuntimeRecord(jobConfig)) {
        continue;
      }
      const { name: _name, ...jobRecord } = jobConfig;
      normalized[jobName] = jobRecord;
    }
  }
  return normalized;
}

function mergeAgendaQueueConfig(...configs: RedboxConfigMap[]): RedboxConfigMap {
  const mergedConfig = runtimeMerge.merge(
    {},
    ...configs.map(config => {
      const { jobs: _jobs, ...rest } = config;
      return rest;
    })
  );
  const jobsByName: RedboxConfigMap = {};

  for (const config of configs) {
    const jobs = normalizeAgendaJobsConfig(config.jobs);
    for (const [jobName, jobConfig] of Object.entries(jobs)) {
      jobsByName[jobName] = runtimeMerge.merge(
        {},
        runtimeRecordOrEmpty(jobsByName[jobName]),
        runtimeRecordOrEmpty(jobConfig)
      );
    }
  }

  return {
    ...mergedConfig,
    jobs: jobsByName,
  };
}

export function mergeRedboxConfig(name: string, ...configs: RedboxConfigMap[]): RedboxConfigMap {
  if (name === 'agendaQueue') {
    return mergeAgendaQueueConfig(...configs);
  }
  if (name === 'brandingConfigurationDefaults') {
    return runtimeMerge.mergeWith({}, ...configs, (_objValue: RuntimeValue, srcValue: RuntimeValue) => {
      if (isRuntimeArray(srcValue)) {
        return srcValue;
      }
      return undefined;
    });
  }
  return runtimeMerge.merge({}, ...configs);
}

type CoreTypesRegistry = {
  WaterlineModels: RuntimeRecord;
  Policies: RuntimeRecord;
  Middleware: RuntimeRecord;
  Responses: RuntimeRecord;
  Config: RuntimeRecord;
  ServiceExports: RuntimeRecord;
  ControllerExports: RuntimeRecord;
  WebserviceControllerExports: RuntimeRecord;
  ControllerNames: string[];
  WebserviceControllerNames: string[];
  FormConfigExports: RuntimeRecord;
};

let coreTypesCache: CoreTypesRegistry | undefined;
const loaderTemplateCache = new Map<string, string>();
const loaderTemplateDir = path.resolve(__dirname, '..', '..', 'redbox-loader-templates');

const log = {
  info: (...args: RuntimeValue[]) => console.log('[redbox-loader]', ...args),
  verbose: (...args: RuntimeValue[]) => {
    if (process.env.SHIM_VERBOSE === 'true') {
      console.log('[redbox-loader:verbose]', ...args);
    }
  },
  warn: (...args: RuntimeValue[]) => console.warn('[redbox-loader:warn]', ...args),
  error: (...args: RuntimeValue[]) => console.error('[redbox-loader:error]', ...args),
};

async function readLoaderTemplate(templateName: string): Promise<string> {
  const cached = loaderTemplateCache.get(templateName);
  if (cached != null) {
    return cached;
  }

  const templatePath = path.join(loaderTemplateDir, templateName);
  const template = await fs.readFile(templatePath, 'utf8');
  loaderTemplateCache.set(templateName, template);
  return template;
}

async function renderLoaderTemplate(templateName: string, replacements: Record<string, string>): Promise<string> {
  const compiled = loaderTemplateCompiler.invoke(await readLoaderTemplate(templateName), { noEscape: true });
  const template = requiredRuntimeCallable(compiled, 'The compiled Handlebars template');
  const rendered = template.invoke(replacements);
  if (typeof rendered !== 'string') {
    throw new TypeError('The compiled Handlebars template did not return text.');
  }
  return rendered;
}

function loadCoreTypes(): CoreTypesRegistry {
  if (!coreTypesCache) {
    if (readRuntimeProperty(globalThis, '_') === undefined) {
      writeRuntimeProperty(globalThis, '_', _);
    }
    if (readRuntimeProperty(globalThis, 'sails') === undefined) {
      writeRuntimeProperty(globalThis, 'sails', {
        log,
        config: {
          log: {
            level: 'info',
          },
        },
      });
    }

    let coreTypesModule: RuntimeValue;
    try {
      coreTypesModule = loadRuntimeModule('@researchdatabox/redbox-core');
    } catch {
      // Source tests run via ts-node before dist exists, so fall back to the local package entrypoint.
      coreTypesModule = loadRuntimeModule(path.resolve(__dirname, '..', 'index'));
    }
    coreTypesCache = {
      WaterlineModels: runtimeRecordOrEmpty(readRuntimeProperty(coreTypesModule, 'WaterlineModels')),
      Policies: runtimeRecordOrEmpty(readRuntimeProperty(coreTypesModule, 'Policies')),
      Middleware: runtimeRecordOrEmpty(readRuntimeProperty(coreTypesModule, 'Middleware')),
      Responses: runtimeRecordOrEmpty(readRuntimeProperty(coreTypesModule, 'Responses')),
      Config: runtimeRecordOrEmpty(readRuntimeProperty(coreTypesModule, 'Config')),
      ServiceExports: runtimeRecordOrEmpty(readRuntimeProperty(coreTypesModule, 'ServiceExports')),
      ControllerExports: runtimeRecordOrEmpty(readRuntimeProperty(coreTypesModule, 'ControllerExports')),
      WebserviceControllerExports: runtimeRecordOrEmpty(
        readRuntimeProperty(coreTypesModule, 'WebserviceControllerExports')
      ),
      ControllerNames: runtimeStringArrayOrEmpty(readRuntimeProperty(coreTypesModule, 'ControllerNames')),
      WebserviceControllerNames: runtimeStringArrayOrEmpty(
        readRuntimeProperty(coreTypesModule, 'WebserviceControllerNames')
      ),
      FormConfigExports: runtimeRecordOrEmpty(readRuntimeProperty(coreTypesModule, 'FormConfigExports')),
    };
  }

  return coreTypesCache;
}

function runtimeRecordOrEmpty(value: RuntimeValue): RuntimeRecord {
  return isRuntimeRecord(value) ? value : {};
}

function runtimeStringArrayOrEmpty(value: RuntimeValue): string[] {
  if (!isRuntimeArray(value) || value.some(entry => typeof entry !== 'string')) {
    return [];
  }
  return value.map(entry => String(entry));
}

export async function writeFileIfChanged(filePath: string, content: string): Promise<boolean> {
  try {
    const current = await fs.readFile(filePath, 'utf8').catch(() => null);
    if (current !== content) {
      await fs.writeFile(filePath, content, 'utf8');
      return true;
    }
  } catch {
    await fs.writeFile(filePath, content, 'utf8');
    return true;
  }
  return false;
}

async function isDirEmpty(dirPath: string): Promise<boolean> {
  try {
    const files = await fs.readdir(dirPath);
    return files.length === 0;
  } catch {
    return true;
  }
}

function sanitizePackageNameForVar(name: string, suffix: string): string {
  return `${name.replace(/[^a-zA-Z0-9_]/g, '_')}_${suffix}`;
}

function resolveDependencyModulePath(depName: string, appPath: string): string | null {
  try {
    return require.resolve(depName, { paths: [appPath] });
  } catch {
    return null;
  }
}

function actionModuleName(rootPath: string, modulePath: string): string {
  const relativePath = path.relative(rootPath, modulePath).split(path.sep).join('/');
  return relativePath === '' ? 'index' : relativePath;
}

export function findAndRegisterActions(appPath: string): ActionRegistrations {
  const hookActions: HookActionRegistration[] = [];
  const sources: ActionRegistrationSource[] = [
    actionRegistrationSource('@researchdatabox/redbox-core', 'action-registry/core-actions', registerCoreRedboxActions),
  ];
  const hooks = getHookProcessingOrder(appPath)
    .filter(hook => hook.sails.hasActions === true)
    .sort((left, right) => compareCodeUnits(left.name, right.name));

  for (const hookPackage of hooks) {
    const modulePath = resolveDependencyModulePath(hookPackage.name, appPath);
    if (modulePath === null) {
      throw new Error(`Could not resolve action hook module ${hookPackage.name}.`);
    }
    const moduleName = actionModuleName(hookPackage.rootPath, modulePath);
    hookActions.push({ packageName: hookPackage.name, module: hookPackage.module, moduleName });
    sources.push(actionRegistrationSourceFromModule(loadRuntimeModule(modulePath), hookPackage.name, moduleName));
  }

  return {
    actionRegistry: buildActionRegistry(sources),
    hookActions,
  };
}

export async function generateActionRegistryConfigShim(
  configDir: string,
  hookActions: readonly HookActionRegistration[]
): Promise<GenerationStats> {
  const filePath = path.join(configDir, 'actionRegistry.js');
  const hookModules = hookActions
    .map((hook, index) => `const hookModule_${index} = require(${JSON.stringify(hook.module)});`)
    .join('\n');
  const hookSources = hookActions
    .map(
      (hook, index) =>
        `  ActionRegistry.actionRegistrationSourceFromModule(hookModule_${index}, ${JSON.stringify(hook.packageName)}, ${JSON.stringify(hook.moduleName)}),`
    )
    .join('\n');
  const content = [
    `'use strict';`,
    `/**`,
    ` * Action registry config shim`,
    ` * Auto-generated by @researchdatabox/redbox-core loader`,
    ` * Do not edit manually - regenerated when .regenerate-shims marker exists`,
    ` */`,
    `const { ActionRegistry, registerRedboxActions: registerCoreRedboxActions } = require('@researchdatabox/redbox-core');`,
    hookModules,
    ``,
    `const actionRegistry = ActionRegistry.buildActionRegistry([`,
    `  ActionRegistry.actionRegistrationSource('@researchdatabox/redbox-core', 'action-registry/core-actions', registerCoreRedboxActions),`,
    hookSources,
    `]);`,
    ``,
    `module.exports.actionRegistry = actionRegistry;`,
    `module.exports.actionDescriptors = actionRegistry.descriptorMetadata;`,
    ``,
  ].join('\n');
  const written = await writeFileIfChanged(filePath, content);
  return { generated: written ? 1 : 0, total: 1 };
}

function hookRegistrationFunction(moduleExports: RuntimeValue, exportName: string): RuntimeFunction | undefined {
  return runtimeFunction(readRuntimeProperty(moduleExports, exportName));
}

function invokeHookRecordRegistration(registration: RuntimeFunction): RuntimeRecord | undefined {
  const registeredValues = registration.invoke();
  return isRuntimeRecord(registeredValues) ? registeredValues : undefined;
}

export async function findAndRegisterHooks(appPath: string): Promise<HookRegistrations> {
  const hookModels: Record<string, HookModelRegistration> = {};
  const hookPolicies: Record<string, HookPolicyRegistration> = {};
  const hookBootstraps: HookBootstrapRegistration[] = [];
  const hookMigrations: HookMigrationRegistration[] = [];
  const hookApiRoutes: HookApiRouteRegistration[] = [];
  const hookServices: Record<string, HookServiceRegistration> = {};
  const hookControllers: Record<string, HookControllerRegistration> = {};
  const hookWebserviceControllers: Record<string, HookControllerRegistration> = {};
  const hookFormConfigs: Record<string, HookModuleRegistration> = {};

  const hooks = getHookProcessingOrder(appPath);

  for (const hookPackage of hooks) {
    const depName = hookPackage.name;
    try {
      const depModulePath = resolveDependencyModulePath(depName, appPath);
      if (!depModulePath) {
        continue;
      }

      const hookModule = loadRuntimeModule(depModulePath);

      if (hookPackage.sails.hasModels === true) {
        log.verbose(`Found hook with models: ${depName}`);
        const registration = hookRegistrationFunction(hookModule, 'registerRedboxModels');
        if (registration !== undefined) {
          const models = invokeHookRecordRegistration(registration);
          if (models === undefined) {
            log.warn(`Hook ${depName} returned invalid model registrations`);
            continue;
          }
          for (const modelName of Object.keys(models)) {
            hookModels[modelName] = { module: depName };
          }
          log.verbose(`Registered ${Object.keys(models).length} models from ${depName}`);
        } else {
          log.warn(`Hook ${depName} has 'hasModels: true' but no 'registerRedboxModels' function`);
        }
      }

      if (hookPackage.sails.hasPolicies === true) {
        log.verbose(`Found hook with policies: ${depName}`);
        const registration = hookRegistrationFunction(hookModule, 'registerRedboxPolicies');
        if (registration !== undefined) {
          const policies = invokeHookRecordRegistration(registration);
          if (policies === undefined) {
            log.warn(`Hook ${depName} returned invalid policy registrations`);
            continue;
          }
          for (const policyName of Object.keys(policies)) {
            hookPolicies[policyName] = { module: depName };
          }
          log.verbose(`Registered ${Object.keys(policies).length} policies from ${depName}`);
        } else {
          log.warn(`Hook ${depName} has 'hasPolicies: true' but no 'registerRedboxPolicies' function`);
        }
      }

      if (hookPackage.sails.hasBootstrap === true) {
        log.verbose(`Found hook with bootstrap: ${depName}`);
        if (hookRegistrationFunction(hookModule, 'registerRedboxBootstrap') !== undefined) {
          hookBootstraps.push({ name: depName, module: depName });
          log.verbose(`Registered bootstrap from ${depName}`);
        } else {
          log.warn(`Hook ${depName} has 'hasBootstrap: true' but no 'registerRedboxBootstrap' function`);
        }
      }

      if (hookPackage.sails.hasMigrations === true) {
        log.verbose(`Found hook with migrations: ${depName}`);
        if (hookRegistrationFunction(hookModule, 'registerRedboxMigrations') !== undefined) {
          hookMigrations.push({ name: depName, module: depName });
          log.verbose(`Registered migrations from ${depName}`);
        } else {
          log.warn(`Hook ${depName} has 'hasMigrations: true' but no 'registerRedboxMigrations' function`);
        }
      }

      if (hookPackage.sails.hasApiRoutes === true) {
        log.verbose(`Found hook with api routes: ${depName}`);
        if (hookRegistrationFunction(hookModule, 'registerHookApiRoutes') !== undefined) {
          hookApiRoutes.push({ name: depName, module: depName });
          log.verbose(`Registered api routes from ${depName}`);
        } else {
          log.warn(`Hook ${depName} has 'hasApiRoutes: true' but no 'registerHookApiRoutes' function`);
        }
      }

      if (hookPackage.sails.hasServices === true) {
        log.verbose(`Found hook with services: ${depName}`);
        const registration = hookRegistrationFunction(hookModule, 'registerRedboxServices');
        if (registration !== undefined) {
          const services = invokeHookRecordRegistration(registration);
          if (services === undefined) {
            log.warn(`Hook ${depName} returned invalid service registrations`);
            continue;
          }
          for (const serviceName of Object.keys(services)) {
            hookServices[serviceName] = { module: depName };
          }
          log.verbose(`Registered ${Object.keys(services).length} services from ${depName}`);
        } else {
          log.warn(`Hook ${depName} has 'hasServices: true' but no 'registerRedboxServices' function`);
        }
      }

      if (hookPackage.sails.hasControllers === true) {
        log.verbose(`Found hook with controllers: ${depName}`);
        const controllerRegistration = hookRegistrationFunction(hookModule, 'registerRedboxControllers');
        if (controllerRegistration !== undefined) {
          const controllers = invokeHookRecordRegistration(controllerRegistration);
          if (controllers === undefined) {
            log.warn(`Hook ${depName} returned invalid controller registrations`);
            continue;
          }
          for (const controllerName of Object.keys(controllers)) {
            hookControllers[controllerName] = { module: depName };
          }
          log.verbose(`Registered ${Object.keys(controllers).length} controllers from ${depName}`);
        }
        const webserviceRegistration = hookRegistrationFunction(hookModule, 'registerRedboxWebserviceControllers');
        if (webserviceRegistration !== undefined) {
          const wsControllers = invokeHookRecordRegistration(webserviceRegistration);
          if (wsControllers === undefined) {
            log.warn(`Hook ${depName} returned invalid webservice controller registrations`);
            continue;
          }
          for (const controllerName of Object.keys(wsControllers)) {
            hookWebserviceControllers[controllerName] = { module: depName };
          }
          log.verbose(`Registered ${Object.keys(wsControllers).length} webservice controllers from ${depName}`);
        }
      }

      if (hookPackage.sails.hasFormConfigs === true) {
        log.verbose(`Found hook with form configs: ${depName}`);
        const registration = hookRegistrationFunction(hookModule, 'registerRedboxFormConfigs');
        if (registration !== undefined) {
          const formConfigs = invokeHookRecordRegistration(registration);
          if (formConfigs === undefined) {
            log.warn(`Hook ${depName} returned invalid form config registrations`);
            continue;
          }
          for (const formName of Object.keys(formConfigs)) {
            hookFormConfigs[formName] = { module: depName };
          }
          log.verbose(`Registered ${Object.keys(formConfigs).length} form configs from ${depName}`);
        } else {
          log.warn(`Hook ${depName} has 'hasFormConfigs: true' but no 'registerRedboxFormConfigs' function`);
        }
      }
    } catch {
      log.verbose(`Could not process dependency ${depName}`);
    }
  }

  return {
    hookModels,
    hookPolicies,
    hookBootstraps,
    hookMigrations,
    hookApiRoutes,
    hookServices,
    hookControllers,
    hookWebserviceControllers,
    hookFormConfigs,
  };
}

export async function discoverLocalMigrationFiles(appPath: string): Promise<string[]> {
  const migrationsDir = path.join(appPath, 'api', 'migrations');
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true }).catch(missingDirectoryEntries);
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => entry.name)
    .sort();
}

function missingDirectoryEntries(error: RuntimeValue): Dirent[] {
  if (readRuntimeProperty(error, 'code') === 'ENOENT') {
    return [];
  }
  throw error;
}

export async function generateMigrationConfigShim(
  configDir: string,
  appPath: string,
  hookMigrations: HookMigrationRegistration[]
): Promise<GenerationStats> {
  const filePath = path.join(configDir, 'migrations.js');
  const localMigrationFiles = await discoverLocalMigrationFiles(appPath);

  const hookImports = hookMigrations
    .map(hook => {
      const varName = sanitizePackageNameForVar(hook.name, 'migrations');
      return `const ${varName} = require('${hook.module}').registerRedboxMigrations();`;
    })
    .join('\n');

  const localImports = localMigrationFiles
    .map((fileName, index) => `const appMigration_${index} = require('../api/migrations/${fileName}');`)
    .join('\n');

  const migrationSourceEntries = [
    ...hookMigrations.map(
      hook => `  { source: 'hook:${hook.name}', migrations: ${sanitizePackageNameForVar(hook.name, 'migrations')} },`
    ),
    ...localMigrationFiles.map(
      (fileName, index) => `  { source: 'api/migrations/${fileName}', migrations: [appMigration_${index}] },`
    ),
  ].join('\n');

  const content = [
    `'use strict';`,
    `/**`,
    ` * Migration config shim`,
    ` * Auto-generated by @researchdatabox/redbox-core loader`,
    ` * Do not edit manually - regenerated when .regenerate-shims marker exists`,
    ` */`,
    hookImports,
    localImports,
    ``,
    `const migrationSources = [`,
    migrationSourceEntries,
    `];`,
    ``,
    `const seenMigrationNames = new Map();`,
    `const migrations = [];`,
    `for (const { source, migrations: sourceMigrations } of migrationSources) {`,
    `  if (!Array.isArray(sourceMigrations)) {`,
    `    throw new Error('Invalid Redbox migration export from ' + source + '. Expected an array of migrations (registerRedboxMigrations() must be synchronous).');`,
    `  }`,
    `  for (const migration of sourceMigrations) {`,
    `    if (!migration || typeof migration.name !== 'string' || typeof migration.up !== 'function') {`,
    `      throw new Error('Invalid Redbox migration export from ' + source + '. Each migration must include name and up().');`,
    `    }`,
    `    if (seenMigrationNames.has(migration.name)) {`,
    `      const message = 'Duplicate Redbox migration name: ' + migration.name + ' (from ' + source + ', first defined in ' + seenMigrationNames.get(migration.name) + ')';`,
    `      if (process.env.NODE_ENV === 'production') {`,
    `        throw new Error(message);`,
    `      }`,
    `      console.warn('[redbox-loader:warn]', message);`,
    `      continue;`,
    `    }`,
    `    seenMigrationNames.set(migration.name, source);`,
    `    migrations.push(migration);`,
    `  }`,
    `}`,
    ``,
    `migrations.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));`,
    ``,
    `module.exports.migrations = migrations;`,
    ``,
  ].join('\n');

  const written = await writeFileIfChanged(filePath, content);
  return { generated: written ? 1 : 0, total: 1 };
}

export async function generateApiRouteHookConfig(
  configDir: string,
  hookApiRoutes: HookApiRouteRegistration[]
): Promise<GenerationStats> {
  const filePath = path.join(configDir, 'apiRoutesHooks.js');

  const hookImports = hookApiRoutes
    .map(hook => {
      const varName = sanitizePackageNameForVar(hook.name, 'apiRoutes');
      return `const ${varName} = require('${hook.module}').registerHookApiRoutes;`;
    })
    .join('\n');

  const hookProviders = hookApiRoutes.map(hook => sanitizePackageNameForVar(hook.name, 'apiRoutes'));
  const content = `'use strict';\n/**\n * apiRoutesHooks config shim\n * Auto-generated by @researchdatabox/redbox-core loader\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n *\n * Provides hook-contributed API route factories for buildMergedApiRouteConfig().\n */\n${hookImports ? `${hookImports}\n\n` : ''}module.exports.apiRoutesHooks = [${hookProviders.join(', ')}];\n`;

  const written = await writeFileIfChanged(filePath, content);
  return { generated: written ? 1 : 0, total: 1 };
}

export async function generatePolicyShims(
  policiesDir: string,
  hookPolicies: Record<string, HookPolicyRegistration>
): Promise<HookGenerationStats> {
  const { Policies } = loadCoreTypes();

  const corePolicyNames = Object.keys(Policies);
  const hookPolicyNames = Object.keys(hookPolicies);
  const allPolicyNames = new Set([...corePolicyNames, ...hookPolicyNames]);

  let generated = 0;
  let fromHooks = 0;
  const promises: Array<Promise<void>> = [];

  for (const name of allPolicyNames) {
    if (hookPolicies[name]) {
      const filePath = path.join(policiesDir, `${name}.js`);
      const hookModuleName = hookPolicies[name].module;
      const policyExportName = hookPolicies[name].exportName ?? name;
      const content = `'use strict';\n/**\n * ${name} policy shim\n * Auto-generated by @researchdatabox/redbox-core loader\n * Provided by: ${hookModuleName}\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { ${policyExportName} } = require('${hookModuleName}').Policies || require('${hookModuleName}');\nmodule.exports = ${policyExportName};\n`;
      promises.push(
        writeFileIfChanged(filePath, content).then(written => {
          if (written) {
            generated++;
            fromHooks++;
          }
        })
      );
      continue;
    }

    if (Policies[name]) {
      const filePath = path.join(policiesDir, `${name}.js`);
      const content = `'use strict';\n/**\n * ${name} policy shim\n * Auto-generated by @researchdatabox/redbox-core loader\n * Provided by: @researchdatabox/redbox-core\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { Policies } = require('@researchdatabox/redbox-core');\nmodule.exports = Policies['${name}'];\n`;
      promises.push(
        writeFileIfChanged(filePath, content).then(written => {
          if (written) {
            generated++;
          }
        })
      );
    }
  }

  await Promise.all(promises);
  return { generated, fromHooks, total: allPolicyNames.size };
}

export async function generateModelShims(
  modelsDir: string,
  hookModels: Record<string, HookModelRegistration>
): Promise<HookGenerationStats> {
  const { WaterlineModels } = loadCoreTypes();

  const coreModelNames = Object.keys(WaterlineModels);
  const hookModelNames = Object.keys(hookModels);
  const allModelNames = new Set([...coreModelNames, ...hookModelNames]);

  let generated = 0;
  let fromHooks = 0;
  const promises: Array<Promise<void>> = [];

  for (const name of allModelNames) {
    if (hookModels[name]) {
      const filePath = path.join(modelsDir, `${name}.js`);
      const hookModuleName = hookModels[name].module;
      const content = `'use strict';\n/**\n * ${name} model shim\n * Auto-generated by @researchdatabox/redbox-core loader\n * Provided by: ${hookModuleName}\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nmodule.exports = { ...require('${hookModuleName}').registerRedboxModels()['${name}'], globalId: '${name}' };\n`;
      promises.push(
        writeFileIfChanged(filePath, content).then(written => {
          if (written) {
            generated++;
            fromHooks++;
          }
        })
      );
      continue;
    }

    if (WaterlineModels[name]) {
      const filePath = path.join(modelsDir, `${name}.js`);
      const content = `'use strict';\n/**\n * ${name} model shim\n * Auto-generated by @researchdatabox/redbox-core loader\n * Provided by: @researchdatabox/redbox-core\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { WaterlineModels } = require('@researchdatabox/redbox-core');\nmodule.exports = { ...WaterlineModels['${name}'], globalId: '${name}' };\n`;
      promises.push(
        writeFileIfChanged(filePath, content).then(written => {
          if (written) {
            generated++;
          }
        })
      );
    }
  }

  await Promise.all(promises);
  return { generated, fromHooks, total: allModelNames.size };
}

export async function generateMiddlewareShims(middlewareDir: string): Promise<GenerationStats> {
  const { Middleware } = loadCoreTypes();

  let generated = 0;
  const middlewareNames = Object.keys(Middleware);

  await Promise.all(
    middlewareNames.map(async name => {
      const filePath = path.join(middlewareDir, `${name}.js`);
      const content = `'use strict';\n/**\n * ${name} middleware shim\n * Auto-generated by @researchdatabox/redbox-core loader\n * Provided by: @researchdatabox/redbox-core\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { Middleware } = require('@researchdatabox/redbox-core');\nmodule.exports = Middleware['${name}'];\n`;
      const written = await writeFileIfChanged(filePath, content);
      if (written) {
        generated++;
      }
    })
  );

  return { generated, total: middlewareNames.length };
}

export async function generateResponseShims(responsesDir: string): Promise<GenerationStats> {
  const { Responses } = loadCoreTypes();

  let generated = 0;
  const responseNames = Object.keys(Responses);

  await Promise.all(
    responseNames.map(async name => {
      const filePath = path.join(responsesDir, `${name}.js`);
      const content = `'use strict';\n/**\n * ${name} response shim\n * Auto-generated by @researchdatabox/redbox-core loader\n * Provided by: @researchdatabox/redbox-core\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { Responses } = require('@researchdatabox/redbox-core');\nmodule.exports = Responses['${name}'];\n`;
      const written = await writeFileIfChanged(filePath, content);
      if (written) {
        generated++;
      }
    })
  );

  return { generated, total: responseNames.length };
}

export async function generateServiceShims(
  servicesDir: string,
  hookServices: Record<string, HookServiceRegistration>
): Promise<HookGenerationStats> {
  const { ServiceExports } = loadCoreTypes();

  const coreServiceNames = Object.keys(ServiceExports);
  const hookServiceNames = Object.keys(hookServices);
  const allServiceNames = new Set([...coreServiceNames, ...hookServiceNames]);

  let generated = 0;
  let fromHooks = 0;
  const promises: Array<Promise<void>> = [];

  for (const name of allServiceNames) {
    if (hookServices[name]) {
      const filePath = path.join(servicesDir, `${name}.js`);
      const hookModuleName = hookServices[name].module;
      const content = `'use strict';\n/**\n * ${name} service shim\n * Auto-generated by @researchdatabox/redbox-core loader\n * Provided by: ${hookModuleName}\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nmodule.exports = require('${hookModuleName}').ServiceExports['${name}'];\n`;
      promises.push(
        writeFileIfChanged(filePath, content).then(written => {
          if (written) {
            generated++;
            fromHooks++;
          }
        })
      );
      continue;
    }

    if (ServiceExports[name]) {
      const filePath = path.join(servicesDir, `${name}.js`);
      const content = `'use strict';\n/**\n * ${name} service shim\n * Auto-generated by @researchdatabox/redbox-core loader\n * Provided by: @researchdatabox/redbox-core\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { ServiceExports } = require('@researchdatabox/redbox-core');\nmodule.exports = ServiceExports['${name}'];\n`;
      promises.push(
        writeFileIfChanged(filePath, content).then(written => {
          if (written) {
            generated++;
          }
        })
      );
    }
  }

  await Promise.all(promises);
  return { generated, fromHooks, total: allServiceNames.size };
}

export async function generateControllerShims(
  controllersDir: string,
  hookControllers: Record<string, HookControllerRegistration>,
  hookWebserviceControllers: Record<string, HookControllerRegistration>
): Promise<HookGenerationStats> {
  const { ControllerNames, WebserviceControllerNames, ControllerExports, WebserviceControllerExports } =
    loadCoreTypes();

  await fs.rm(path.join(controllersDir, retiredControllerShimFilename), { force: true });

  const allApiControllers = new Set([...ControllerNames, ...Object.keys(hookControllers)]);
  const allWSControllers = new Set([...WebserviceControllerNames, ...Object.keys(hookWebserviceControllers)]);

  let generated = 0;
  let fromHooks = 0;
  const promises: Array<Promise<void>> = [];

  for (const name of allApiControllers) {
    if (hookControllers[name]) {
      const filePath = path.join(controllersDir, `${name}.js`);
      const content = `'use strict';\n/**\n * ${name} controller shim - from hook\n * Auto-generated by @researchdatabox/redbox-core loader\n * Provided by: ${hookControllers[name].module}\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { registerRedboxControllers } = require('${hookControllers[name].module}');\nmodule.exports = registerRedboxControllers()['${name}'];\n`;
      promises.push(
        writeFileIfChanged(filePath, content).then(written => {
          if (written) {
            generated++;
            fromHooks++;
          }
        })
      );
      continue;
    }

    if (ControllerExports[name]) {
      const filePath = path.join(controllersDir, `${name}.js`);
      const content = `'use strict';\n/**\n * ${name} controller shim\n * Auto-generated by @researchdatabox/redbox-core loader\n */\nconst { ControllerExports } = require('@researchdatabox/redbox-core');\nmodule.exports = ControllerExports['${name}'];\n`;
      promises.push(
        writeFileIfChanged(filePath, content).then(written => {
          if (written) {
            generated++;
          }
        })
      );
    }
  }

  const wsDir = path.join(controllersDir, 'webservice');
  await fs.mkdir(wsDir, { recursive: true });

  for (const name of allWSControllers) {
    if (hookWebserviceControllers[name]) {
      const filePath = path.join(wsDir, `${name}.js`);
      const content = `'use strict';\n/**\n * ${name} webservice controller shim - from hook\n * Auto-generated by @researchdatabox/redbox-core loader\n * Provided by: ${hookWebserviceControllers[name].module}\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { registerRedboxWebserviceControllers } = require('${hookWebserviceControllers[name].module}');\nmodule.exports = registerRedboxWebserviceControllers()['${name}'];\n`;
      promises.push(
        writeFileIfChanged(filePath, content).then(written => {
          if (written) {
            generated++;
            fromHooks++;
          }
        })
      );
      continue;
    }

    if (WebserviceControllerExports[name]) {
      const filePath = path.join(wsDir, `${name}.js`);
      const content = `'use strict';\n/**\n * ${name} webservice controller shim\n * Auto-generated by @researchdatabox/redbox-core loader\n */\nconst { WebserviceControllerExports } = require('@researchdatabox/redbox-core');\nmodule.exports = WebserviceControllerExports['${name}'];\n`;
      promises.push(
        writeFileIfChanged(filePath, content).then(written => {
          if (written) {
            generated++;
          }
        })
      );
    }
  }

  await Promise.all(promises);
  return { generated, fromHooks, total: allApiControllers.size + allWSControllers.size };
}

export async function generateFormConfigShims(
  formConfigDir: string,
  hookFormConfigs: Record<string, HookModuleRegistration>
): Promise<FormConfigGenerationStats> {
  const { FormConfigExports } = loadCoreTypes();

  const coreFormNames = Object.keys(FormConfigExports);
  const hookFormNames = Object.keys(hookFormConfigs);

  await fs.mkdir(formConfigDir, { recursive: true });

  const loadDefaultForms = String(process.env.LOAD_DEFAULT_FORMS).toLowerCase() === 'true';
  const indexFormNames = new Set([...(loadDefaultForms ? coreFormNames : []), ...hookFormNames]);
  const orderedFormNames = Array.from(indexFormNames).sort();

  const hookModules = new Map<string, string>();
  let hookModuleIndex = 0;
  for (const name of hookFormNames) {
    const moduleName = hookFormConfigs[name].module;
    if (!hookModules.has(moduleName)) {
      hookModules.set(moduleName, `hookFormConfigs_${hookModuleIndex++}`);
    }
  }

  const hookRequires = Array.from(hookModules.entries())
    .map(([moduleName, varName]) => `const ${varName} = require('${moduleName}').registerRedboxFormConfigs();`)
    .join('\n');
  const includeCoreExports = loadDefaultForms && coreFormNames.length > 0;
  const coreRequire = includeCoreExports
    ? "const { FormConfigExports } = require('@researchdatabox/redbox-core');\n\n"
    : '';

  const formsEntries = orderedFormNames
    .map(name => {
      if (hookFormConfigs[name]) {
        const moduleName = hookFormConfigs[name].module;
        const varName = hookModules.get(moduleName);
        return `  '${name}': ${varName}['${name}'],`;
      }
      return `  '${name}': FormConfigExports['${name}'],`;
    })
    .join('\n');

  const formsObject = `{\n${formsEntries}\n}`;
  const indexContent = await renderLoaderTemplate('form-config-index.js.hbs', {
    coreRequire,
    hookRequires: hookRequires ? `${hookRequires}\n\n` : '',
    formsObject,
  });

  const indexWritten = await writeFileIfChanged(path.join(formConfigDir, 'index.js'), indexContent);
  const generated = indexWritten ? 1 : 0;
  const fromHooks = hookFormNames.length;

  const modeLabel = loadDefaultForms ? 'core+hook' : 'hook-only';
  log.info(`Form-config shim mode: ${modeLabel} (LOAD_DEFAULT_FORMS=${process.env.LOAD_DEFAULT_FORMS || 'unset'})`);
  log.info(
    `Form-config registry entries: ${indexFormNames.size} (core ${loadDefaultForms ? coreFormNames.length : 0}, hook ${hookFormNames.length})`
  );
  if (indexFormNames.size === 0) {
    log.warn('Form-config registry is empty after applying LOAD_DEFAULT_FORMS.');
  }

  return {
    generated,
    fromHooks,
    total: indexFormNames.size,
    indexCount: indexFormNames.size,
    loadDefaultForms,
  };
}

export async function findAndRegisterHookConfigs(appPath: string): Promise<HookConfigRegistrations> {
  const hookConfigs: HookConfigRegistration[] = [];

  const hooks = getHookProcessingOrder(appPath);

  for (const hookPackage of hooks) {
    const depName = hookPackage.name;
    try {
      const depModulePath = resolveDependencyModulePath(depName, appPath);
      if (!depModulePath) {
        continue;
      }

      if (hookPackage.sails.hasConfig === true) {
        log.verbose(`Found hook with config: ${depName}`);
        const hookModule = loadRuntimeModule(depModulePath);
        if (hookRegistrationFunction(hookModule, 'registerRedboxConfig') !== undefined) {
          hookConfigs.push({ name: depName, module: depName });
          log.verbose(`Registered config from ${depName}`);
        } else {
          log.warn(`Hook ${depName} has 'hasConfig: true' but no 'registerRedboxConfig' function`);
        }
      }
    } catch {
      log.verbose(`Could not process dependency ${depName} for config`);
    }
  }

  return { hookConfigs };
}

export async function generateConfigShims(
  configDir: string,
  hookConfigs: HookConfigRegistration[]
): Promise<GenerationStats> {
  const { Config } = loadCoreTypes();

  await fs.rm(path.join(configDir, retiredConfigShimFilename), { force: true });

  let generated = 0;
  const configNames = Object.keys(Config);

  const hookImports = hookConfigs
    .map(hook => {
      const varName = sanitizePackageNameForVar(hook.name, 'config');
      return `const ${varName} = require('${hook.module}').registerRedboxConfig();`;
    })
    .join('\n');

  await Promise.all(
    configNames.map(async name => {
      const filePath = path.join(configDir, `${name}.js`);
      if (name === 'form' || name === 'datastores') {
        return;
      }

      const hookMerges = hookConfigs.map(hook => {
        const varName = sanitizePackageNameForVar(hook.name, 'config');
        return `${varName}['${name}'] || {}`;
      });

      const mergeArgs = [`Config.${name} || {}`, ...hookMerges];
      const mergeStatement =
        hookMerges.length > 0 ? `mergeRedboxConfig('${name}', ${mergeArgs.join(', ')})` : `Config.${name}`;

      const content = `'use strict';\n/**\n * ${name} config shim\n * Auto-generated by @researchdatabox/redbox-core loader\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n *\n * Merges: core config + hook configs (root hookLoadPriority precedence; unlisted hooks use package-name fallback)\n * Debug view: see support/debug-config/resolved.js\n */\nconst { Config, mergeRedboxConfig } = require('@researchdatabox/redbox-core');\n${hookImports}\n\nmodule.exports.${name} = ${mergeStatement};\n`;
      const written = await writeFileIfChanged(filePath, content);
      if (written) {
        generated++;
      }
    })
  );

  const datastoresFilePath = path.join(configDir, 'datastores.js');
  const datastoresContent = `'use strict';\n/**\n * datastores config shim\n * Auto-generated by @researchdatabox/redbox-core loader\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n *\n * NOTE: This uses direct export without _.merge to preserve adapter object references.\n * Using _.merge would create copies of adapter objects, causing Sails to see\n * multiple adapters with the same identity.\n */\nconst { Config } = require('@researchdatabox/redbox-core');\nmodule.exports.datastores = Config.datastores;\n`;
  const datastoresWritten = await writeFileIfChanged(datastoresFilePath, datastoresContent);
  if (datastoresWritten) {
    generated++;
  }

  return { generated, total: configNames.length };
}

function serializeForSnapshot(value: RuntimeValue, seen = new WeakSet<object>()): RuntimeValue {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);
  if (isRuntimeArray(value)) {
    return value.map(v => serializeForSnapshot(v, seen));
  }
  if (!isRuntimeRecord(value)) {
    return String(value);
  }
  const result: RuntimeRecord = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = serializeForSnapshot(val, seen);
  }
  return result;
}

export async function generatePreLiftSnapshot(appPath: string, hookConfigs: HookConfigRegistration[]): Promise<void> {
  if (process.env.EXPORT_BOOTSTRAP_CONFIG_JSON !== 'true') {
    return;
  }

  const { Config } = loadCoreTypes();
  const debugDir = path.join(appPath, 'support', 'debug-config');
  await fs.mkdir(debugDir, { recursive: true });
  const filePath = path.join(debugDir, 'pre-lift-config.json');

  let mergedConfig = runtimeMerge.cloneDeep(Config);

  for (const hook of hookConfigs) {
    try {
      const hookModule = loadRuntimeModule(hook.module);
      const registration = hookRegistrationFunction(hookModule, 'registerRedboxConfig');
      if (registration !== undefined) {
        const hookConfig = invokeHookRecordRegistration(registration);
        if (hookConfig === undefined) {
          log.warn(`Could not load config from ${hook.name} for snapshot: invalid registration result`);
          continue;
        }
        mergedConfig = Object.keys(hookConfig).reduce((config, name) => {
          config[name] = mergeRedboxConfig(
            name,
            runtimeRecordOrEmpty(config[name]),
            runtimeRecordOrEmpty(hookConfig[name])
          );
          return config;
        }, mergedConfig);
      }
    } catch {
      log.warn(`Could not load config from ${hook.name} for snapshot`);
    }
  }

  const snapshot: RuntimeRecord = {
    _meta: {
      exportedAt: new Date().toISOString(),
      stage: 'pre-lift',
      description: 'Config from core-types + hooks BEFORE Sails merges environment config',
      sources: ['@researchdatabox/redbox-core', ...hookConfigs.map(h => h.name)],
    },
    ...runtimeRecordOrEmpty(serializeForSnapshot(mergedConfig)),
  };

  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
  log.info(`Exported pre-lift config snapshot to ${filePath}`);
}

export async function generateBootstrapShim(
  configDir: string,
  hookBootstraps: HookBootstrapRegistration[]
): Promise<BootstrapGenerationStats> {
  const filePath = path.join(configDir, 'bootstrap.js');

  const hookImports = hookBootstraps
    .map(
      hook =>
        `const ${sanitizePackageNameForVar(hook.name, 'bootstrap')} = require('${hook.module}').registerRedboxBootstrap();`
    )
    .join('\n');

  const hookCalls = hookBootstraps
    .map(hook => {
      const varName = sanitizePackageNameForVar(hook.name, 'bootstrap');
      return `    { name: ${JSON.stringify(hook.name)}, bootstrap: ${varName} },`;
    })
    .join('\n');

  const content = await renderLoaderTemplate('bootstrap-shim.js.hbs', {
    hookImports: hookImports ? `${hookImports}\n\n` : '',
    hookCalls: hookCalls ? `${hookCalls}\n` : '',
  });

  const written = await writeFileIfChanged(filePath, content);
  return { generated: written ? 1 : 0, total: 1, hookCount: hookBootstraps.length };
}

export async function shouldRegenerateShims(appPath: string, forceRegenerate = false): Promise<RegenerationDecision> {
  const markerPath = path.join(appPath, '.regenerate-shims');

  if (process.env.NODE_ENV !== 'production') {
    return { shouldRegenerate: true, reason: 'NODE_ENV !== production', deleteMarker: false };
  }

  if (fsSync.existsSync(markerPath)) {
    return { shouldRegenerate: true, reason: '.regenerate-shims marker file exists', deleteMarker: true };
  }

  if (forceRegenerate) {
    return { shouldRegenerate: true, reason: 'REGENERATE_SHIMS=true', deleteMarker: false };
  }

  const apiPath = path.join(appPath, 'api');
  const dirs = ['models', 'policies', 'middleware', 'responses', 'services', 'controllers', 'form-config'];
  for (const dir of dirs) {
    const dirPath = path.join(apiPath, dir);
    if (await isDirEmpty(dirPath)) {
      return { shouldRegenerate: true, reason: `api/${dir}/ is empty`, deleteMarker: false };
    }
  }

  if (!fsSync.existsSync(path.join(appPath, 'config', 'actionRegistry.js'))) {
    return { shouldRegenerate: true, reason: 'config/actionRegistry.js is missing', deleteMarker: false };
  }

  return { shouldRegenerate: false, reason: 'shims already exist', deleteMarker: false };
}

export async function generateAllShims(appPath: string, options: LoaderOptions = {}): Promise<GenerateAllShimsResult> {
  const startTime = performance.now();
  const { shouldRegenerate, reason, deleteMarker } = await shouldRegenerateShims(appPath, options.forceRegenerate);

  if (!shouldRegenerate) {
    log.info(`Skipping shim generation (${reason})`);
    return { skipped: true, reason };
  }

  log.info(`Starting shim generation (${reason})...`);

  const depScanStart = performance.now();
  const {
    hookModels,
    hookPolicies,
    hookBootstraps,
    hookMigrations,
    hookApiRoutes,
    hookServices,
    hookControllers,
    hookWebserviceControllers,
    hookFormConfigs,
  } = await findAndRegisterHooks(appPath);
  const { hookConfigs } = await findAndRegisterHookConfigs(appPath);
  const { hookActions } = findAndRegisterActions(appPath);
  log.verbose(`Dependency scanning took ${(performance.now() - depScanStart).toFixed(2)}ms`);
  log.verbose(`Found ${hookConfigs.length} hooks with config`);

  const modelsDir = path.join(appPath, 'api', 'models');
  const policiesDir = path.join(appPath, 'api', 'policies');
  const middlewareDir = path.join(appPath, 'api', 'middleware');
  const responsesDir = path.join(appPath, 'api', 'responses');
  const servicesDir = path.join(appPath, 'api', 'services');
  const controllersDir = path.join(appPath, 'api', 'controllers');
  const formConfigDir = path.join(appPath, 'api', 'form-config');
  const configDir = path.join(appPath, 'config');

  await Promise.all([
    fs.mkdir(modelsDir, { recursive: true }),
    fs.mkdir(policiesDir, { recursive: true }),
    fs.mkdir(middlewareDir, { recursive: true }),
    fs.mkdir(responsesDir, { recursive: true }),
    fs.mkdir(servicesDir, { recursive: true }),
    fs.mkdir(controllersDir, { recursive: true }),
    fs.mkdir(formConfigDir, { recursive: true }),
    fs.mkdir(configDir, { recursive: true }),
  ]);

  const genStart = performance.now();
  const [
    modelStats,
    policyStats,
    middlewareStats,
    responseStats,
    serviceStats,
    controllerStats,
    formConfigStats,
    configShimStats,
    apiRouteHookStats,
    bootstrapStats,
    migrationStats,
    actionRegistryStats,
  ] = await Promise.all([
    generateModelShims(modelsDir, hookModels),
    generatePolicyShims(policiesDir, hookPolicies),
    generateMiddlewareShims(middlewareDir),
    generateResponseShims(responsesDir),
    generateServiceShims(servicesDir, hookServices),
    generateControllerShims(controllersDir, hookControllers, hookWebserviceControllers),
    generateFormConfigShims(formConfigDir, hookFormConfigs),
    generateConfigShims(configDir, hookConfigs),
    generateApiRouteHookConfig(configDir, hookApiRoutes),
    generateBootstrapShim(configDir, hookBootstraps),
    generateMigrationConfigShim(configDir, appPath, hookMigrations),
    generateActionRegistryConfigShim(configDir, hookActions),
  ]);

  log.verbose(`Shim generation took ${(performance.now() - genStart).toFixed(2)}ms`);
  log.verbose(`Models: ${modelStats.generated}/${modelStats.total} written (${modelStats.fromHooks} from hooks)`);
  log.verbose(`Policies: ${policyStats.generated}/${policyStats.total} written (${policyStats.fromHooks} from hooks)`);
  log.verbose(`Middleware: ${middlewareStats.generated}/${middlewareStats.total} written`);
  log.verbose(`Responses: ${responseStats.generated}/${responseStats.total} written`);
  log.verbose(
    `Services: ${serviceStats.generated}/${serviceStats.total} written (${serviceStats.fromHooks} from hooks)`
  );
  log.verbose(
    `Controllers: ${controllerStats.generated}/${controllerStats.total} written (${controllerStats.fromHooks} from hooks)`
  );
  log.verbose(
    `Form-config: index ${formConfigStats.generated ? 'written' : 'unchanged'}; entries ${formConfigStats.indexCount} (${formConfigStats.fromHooks} from hooks)`
  );
  log.verbose(`Config Shims: ${configShimStats.generated}/${configShimStats.total} written`);
  log.verbose(
    `API route hooks: ${apiRouteHookStats.generated}/${apiRouteHookStats.total} written (${hookApiRoutes.length} hooks)`
  );
  log.verbose(
    `Bootstrap: ${bootstrapStats.generated}/${bootstrapStats.total} written (${bootstrapStats.hookCount} hook bootstraps)`
  );
  log.verbose(
    `Migrations: ${migrationStats.generated}/${migrationStats.total} written (${hookMigrations.length} hooks)`
  );
  log.verbose(
    `Action registry: ${actionRegistryStats.generated}/${actionRegistryStats.total} written (${hookActions.length} hooks)`
  );

  await generatePreLiftSnapshot(appPath, hookConfigs);

  if (deleteMarker) {
    const markerPath = path.join(appPath, '.regenerate-shims');
    try {
      await fs.unlink(markerPath);
      log.verbose('Deleted .regenerate-shims marker file');
    } catch {
      log.warn('Could not delete .regenerate-shims marker');
    }
  }

  const totalTime = (performance.now() - startTime).toFixed(2);
  log.info(`Shim generation complete in ${totalTime}ms`);

  return {
    skipped: false,
    reason,
    stats: {
      modelStats,
      policyStats,
      middlewareStats,
      responseStats,
      serviceStats,
      controllerStats,
      formConfigStats,
      configShimStats,
      apiRouteHookStats,
      bootstrapStats,
      migrationStats,
      actionRegistryStats,
    },
    totalTimeMs: Number.parseFloat(totalTime),
  };
}
