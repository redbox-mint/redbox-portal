import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

export interface LoaderOptions {
    forceRegenerate?: boolean;
    verbose?: boolean;
}

export interface HookBootstrapRegistration {
    name: string;
    module: string;
}

export interface HookModuleRegistration {
    module: string;
}

export interface HookPolicyRegistration extends HookModuleRegistration {
    exportName?: string;
}

export interface HookServiceRegistration extends HookModuleRegistration {
    service: unknown;
}

export interface HookControllerRegistration extends HookModuleRegistration {
    controller: unknown;
}

export type HookModelRegistration = Record<string, unknown>;

export interface HookRegistrations {
    hookModels: Record<string, HookModelRegistration>;
    hookPolicies: Record<string, HookPolicyRegistration>;
    hookBootstraps: HookBootstrapRegistration[];
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
    bootstrapStats: BootstrapGenerationStats;
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

type CoreTypesRegistry = {
    WaterlineModels: Record<string, unknown>;
    Policies: Record<string, unknown>;
    Middleware: Record<string, unknown>;
    Responses: Record<string, unknown>;
    Config: Record<string, unknown>;
    ServiceExports: Record<string, unknown>;
    ControllerExports: Record<string, unknown>;
    WebserviceControllerExports: Record<string, unknown>;
    ControllerNames: string[];
    WebserviceControllerNames: string[];
    FormConfigExports: Record<string, unknown>;
};

let coreTypesCache: CoreTypesRegistry | undefined;

const log = {
    info: (...args: unknown[]) => console.log('[redbox-loader]', ...args),
    verbose: (...args: unknown[]) => {
        if (process.env.SHIM_VERBOSE === 'true') {
            console.log('[redbox-loader:verbose]', ...args);
        }
    },
    warn: (...args: unknown[]) => console.warn('[redbox-loader:warn]', ...args),
    error: (...args: unknown[]) => console.error('[redbox-loader:error]', ...args),
};

function loadCoreTypes(): CoreTypesRegistry {
    if (!coreTypesCache) {
        if (typeof global._ === 'undefined') {
            (global as typeof globalThis & { _: unknown })._ = require('lodash');
        }
        const globalWithSails = global as typeof globalThis & { sails?: unknown };
        if (typeof globalWithSails.sails === 'undefined') {
            globalWithSails.sails = {
                log,
                config: {
                    log: {
                        level: 'info',
                    },
                },
            };
        }

        let coreTypes: Partial<CoreTypesRegistry>;
        try {
            coreTypes = require('@researchdatabox/redbox-core') as Partial<CoreTypesRegistry>;
        } catch {
            // Source tests run via ts-node before dist exists, so fall back to the local package entrypoint.
            coreTypes = require(path.resolve(__dirname, '..', 'index')) as Partial<CoreTypesRegistry>;
        }
        coreTypesCache = {
            WaterlineModels: coreTypes.WaterlineModels ?? {},
            Policies: coreTypes.Policies ?? {},
            Middleware: coreTypes.Middleware ?? {},
            Responses: coreTypes.Responses ?? {},
            Config: coreTypes.Config ?? {},
            ServiceExports: coreTypes.ServiceExports ?? {},
            ControllerExports: coreTypes.ControllerExports ?? {},
            WebserviceControllerExports: coreTypes.WebserviceControllerExports ?? {},
            ControllerNames: coreTypes.ControllerNames ?? [],
            WebserviceControllerNames: coreTypes.WebserviceControllerNames ?? [],
            FormConfigExports: coreTypes.FormConfigExports ?? {},
        };
    }

    return coreTypesCache;
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

export async function findAndRegisterHooks(appPath: string): Promise<HookRegistrations> {
    const hookModels: Record<string, HookModelRegistration> = {};
    const hookPolicies: Record<string, HookPolicyRegistration> = {};
    const hookBootstraps: HookBootstrapRegistration[] = [];
    const hookServices: Record<string, HookServiceRegistration> = {};
    const hookControllers: Record<string, HookControllerRegistration> = {};
    const hookWebserviceControllers: Record<string, HookControllerRegistration> = {};
    const hookFormConfigs: Record<string, HookModuleRegistration> = {};

    let packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
        const packageJsonContent = await fs.readFile(path.join(appPath, 'package.json'), 'utf8');
        packageJson = JSON.parse(packageJsonContent) as typeof packageJson;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Could not load package.json to find hooks', message);
        return {
            hookModels,
            hookPolicies,
            hookBootstraps,
            hookServices,
            hookControllers,
            hookWebserviceControllers,
            hookFormConfigs,
        };
    }

    const allDependencies = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
    };

    await Promise.all(
        Object.keys(allDependencies).map(async depName => {
            try {
                let depPackageJsonPath: string;
                try {
                    depPackageJsonPath = require.resolve(`${depName}/package.json`, { paths: [appPath] });
                } catch {
                    return;
                }

                const depPackageJson = JSON.parse(
                    await fs.readFile(depPackageJsonPath, 'utf8')
                ) as {
                    sails?: {
                        hasModels?: boolean;
                        hasPolicies?: boolean;
                        hasBootstrap?: boolean;
                        hasServices?: boolean;
                        hasControllers?: boolean;
                        hasFormConfigs?: boolean;
                    };
                };

                if (depPackageJson.sails?.hasModels === true) {
                    log.verbose(`Found hook with models: ${depName}`);
                    const hookModule = require(depName) as {
                        registerRedboxModels?: () => Record<string, HookModelRegistration>;
                    };
                    if (typeof hookModule.registerRedboxModels === 'function') {
                        const models = hookModule.registerRedboxModels();
                        Object.assign(hookModels, models);
                        log.verbose(`Registered ${Object.keys(models).length} models from ${depName}`);
                    } else {
                        log.warn(`Hook ${depName} has 'hasModels: true' but no 'registerRedboxModels' function`);
                    }
                }

                if (depPackageJson.sails?.hasPolicies === true) {
                    log.verbose(`Found hook with policies: ${depName}`);
                    const hookModule = require(depName) as {
                        registerRedboxPolicies?: () => Record<string, HookPolicyRegistration>;
                    };
                    if (typeof hookModule.registerRedboxPolicies === 'function') {
                        const policies = hookModule.registerRedboxPolicies();
                        Object.assign(hookPolicies, policies);
                        log.verbose(`Registered ${Object.keys(policies).length} policies from ${depName}`);
                    } else {
                        log.warn(`Hook ${depName} has 'hasPolicies: true' but no 'registerRedboxPolicies' function`);
                    }
                }

                if (depPackageJson.sails?.hasBootstrap === true) {
                    log.verbose(`Found hook with bootstrap: ${depName}`);
                    const hookModule = require(depName) as {
                        registerRedboxBootstrap?: () => Promise<void>;
                    };
                    if (typeof hookModule.registerRedboxBootstrap === 'function') {
                        hookBootstraps.push({ name: depName, module: depName });
                        log.verbose(`Registered bootstrap from ${depName}`);
                    } else {
                        log.warn(`Hook ${depName} has 'hasBootstrap: true' but no 'registerRedboxBootstrap' function`);
                    }
                }

                if (depPackageJson.sails?.hasServices === true) {
                    log.verbose(`Found hook with services: ${depName}`);
                    const hookModule = require(depName) as {
                        registerRedboxServices?: () => Record<string, unknown>;
                    };
                    if (typeof hookModule.registerRedboxServices === 'function') {
                        const services = hookModule.registerRedboxServices();
                        for (const serviceName of Object.keys(services)) {
                            hookServices[serviceName] = { module: depName, service: services[serviceName] };
                        }
                        log.verbose(`Registered ${Object.keys(services).length} services from ${depName}`);
                    } else {
                        log.warn(`Hook ${depName} has 'hasServices: true' but no 'registerRedboxServices' function`);
                    }
                }

                if (depPackageJson.sails?.hasControllers === true) {
                    log.verbose(`Found hook with controllers: ${depName}`);
                    const hookModule = require(depName) as {
                        registerRedboxControllers?: () => Record<string, unknown>;
                        registerRedboxWebserviceControllers?: () => Record<string, unknown>;
                    };
                    if (typeof hookModule.registerRedboxControllers === 'function') {
                        const controllers = hookModule.registerRedboxControllers();
                        for (const controllerName of Object.keys(controllers)) {
                            hookControllers[controllerName] = { module: depName, controller: controllers[controllerName] };
                        }
                        log.verbose(`Registered ${Object.keys(controllers).length} controllers from ${depName}`);
                    }
                    if (typeof hookModule.registerRedboxWebserviceControllers === 'function') {
                        const wsControllers = hookModule.registerRedboxWebserviceControllers();
                        for (const controllerName of Object.keys(wsControllers)) {
                            hookWebserviceControllers[controllerName] = {
                                module: depName,
                                controller: wsControllers[controllerName],
                            };
                        }
                        log.verbose(`Registered ${Object.keys(wsControllers).length} webservice controllers from ${depName}`);
                    }
                }

                if (depPackageJson.sails?.hasFormConfigs === true) {
                    log.verbose(`Found hook with form configs: ${depName}`);
                    const hookModule = require(depName) as {
                        registerRedboxFormConfigs?: () => Record<string, unknown>;
                    };
                    if (typeof hookModule.registerRedboxFormConfigs === 'function') {
                        const formConfigs = hookModule.registerRedboxFormConfigs();
                        for (const formName of Object.keys(formConfigs)) {
                            hookFormConfigs[formName] = { module: depName };
                        }
                        log.verbose(`Registered ${Object.keys(formConfigs).length} form configs from ${depName}`);
                    } else {
                        log.warn(`Hook ${depName} has 'hasFormConfigs: true' but no 'registerRedboxFormConfigs' function`);
                    }
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.verbose(`Could not process dependency ${depName}: ${message}`);
            }
        })
    );

    return {
        hookModels,
        hookPolicies,
        hookBootstraps,
        hookServices,
        hookControllers,
        hookWebserviceControllers,
        hookFormConfigs,
    };
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
            const content = `'use strict';\n/**\n * ${name} policy shim\n * Auto-generated by redbox-loader.js\n * Provided by: ${hookModuleName}\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { ${policyExportName} } = require('${hookModuleName}').Policies || require('${hookModuleName}');\nmodule.exports = ${policyExportName};\n`;
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
            const content = `'use strict';\n/**\n * ${name} policy shim\n * Auto-generated by redbox-loader.js\n * Provided by: @researchdatabox/redbox-core\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { Policies } = require('@researchdatabox/redbox-core');\nmodule.exports = Policies['${name}'];\n`;
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
            const modelDef = hookModels[name];
            const content = `'use strict';\n/**\n * ${name} model shim\n * Auto-generated by redbox-loader.js\n * Provided by: hook registration\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nmodule.exports = ${JSON.stringify({ ...modelDef, globalId: name }, null, 2)};\n`;
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
            const content = `'use strict';\n/**\n * ${name} model shim\n * Auto-generated by redbox-loader.js\n * Provided by: @researchdatabox/redbox-core\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { WaterlineModels } = require('@researchdatabox/redbox-core');\nmodule.exports = { ...WaterlineModels['${name}'], globalId: '${name}' };\n`;
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
            const content = `'use strict';\n/**\n * ${name} middleware shim\n * Auto-generated by redbox-loader.js\n * Provided by: @researchdatabox/redbox-core\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { Middleware } = require('@researchdatabox/redbox-core');\nmodule.exports = Middleware['${name}'];\n`;
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
            const content = `'use strict';\n/**\n * ${name} response shim\n * Auto-generated by redbox-loader.js\n * Provided by: @researchdatabox/redbox-core\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { Responses } = require('@researchdatabox/redbox-core');\nmodule.exports = Responses['${name}'];\n`;
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
            const content = `'use strict';\n/**\n * ${name} service shim\n * Auto-generated by redbox-loader.js\n * Provided by: ${hookModuleName}\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nmodule.exports = require('${hookModuleName}').ServiceExports['${name}'];\n`;
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
            const content = `'use strict';\n/**\n * ${name} service shim\n * Auto-generated by redbox-loader.js\n * Provided by: @researchdatabox/redbox-core\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { ServiceExports } = require('@researchdatabox/redbox-core');\nmodule.exports = ServiceExports['${name}'];\n`;
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
    const { ControllerNames, WebserviceControllerNames, ControllerExports, WebserviceControllerExports } = loadCoreTypes();

    const allApiControllers = new Set([...ControllerNames, ...Object.keys(hookControllers)]);
    const allWSControllers = new Set([...WebserviceControllerNames, ...Object.keys(hookWebserviceControllers)]);

    let generated = 0;
    let fromHooks = 0;
    const promises: Array<Promise<void>> = [];

    for (const name of allApiControllers) {
        if (hookControllers[name]) {
            const filePath = path.join(controllersDir, `${name}.js`);
            const content = `'use strict';\n/**\n * ${name} controller shim - from hook\n * Auto-generated by redbox-loader.js\n * Provided by: ${hookControllers[name].module}\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { registerRedboxControllers } = require('${hookControllers[name].module}');\nmodule.exports = registerRedboxControllers()['${name}'];\n`;
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
            const content = `'use strict';\n/**\n * ${name} controller shim\n * Auto-generated by redbox-loader.js\n */\nconst { ControllerExports } = require('@researchdatabox/redbox-core');\nmodule.exports = ControllerExports['${name}'];\n`;
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
            const content = `'use strict';\n/**\n * ${name} webservice controller shim - from hook\n * Auto-generated by redbox-loader.js\n * Provided by: ${hookWebserviceControllers[name].module}\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n */\nconst { registerRedboxWebserviceControllers } = require('${hookWebserviceControllers[name].module}');\nmodule.exports = registerRedboxWebserviceControllers()['${name}'];\n`;
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
            const content = `'use strict';\n/**\n * ${name} webservice controller shim\n * Auto-generated by redbox-loader.js\n */\nconst { WebserviceControllerExports } = require('@researchdatabox/redbox-core');\nmodule.exports = WebserviceControllerExports['${name}'];\n`;
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
    const coreRequire = includeCoreExports ? "const { FormConfigExports } = require('@researchdatabox/redbox-core');\n\n" : '';

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

    const indexContent = `'use strict';\n/**\n * Form-config registry shim\n * Auto-generated by redbox-loader.js\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n *\n * Hook entries override core entries on name collision.\n */\n${coreRequire}${hookRequires ? `${hookRequires}\n\n` : ''}const forms = {\n${formsEntries}\n};\n\nmodule.exports = { forms };\n`;

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

    let packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
        const packageJsonContent = await fs.readFile(path.join(appPath, 'package.json'), 'utf8');
        packageJson = JSON.parse(packageJsonContent) as typeof packageJson;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Could not load package.json to find hook configs', message);
        return { hookConfigs };
    }

    const allDependencies = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
    };

    const dependencies = Object.keys(allDependencies).sort();

    for (const depName of dependencies) {
        try {
            let depPackageJsonPath: string;
            try {
                depPackageJsonPath = require.resolve(`${depName}/package.json`, { paths: [appPath] });
            } catch {
                continue;
            }

            const depPackageJson = JSON.parse(
                await fs.readFile(depPackageJsonPath, 'utf8')
            ) as { sails?: { hasConfig?: boolean } };

            if (depPackageJson.sails?.hasConfig === true) {
                log.verbose(`Found hook with config: ${depName}`);
                const hookModule = require(depName) as { registerRedboxConfig?: () => Record<string, unknown> };
                if (typeof hookModule.registerRedboxConfig === 'function') {
                    hookConfigs.push({ name: depName, module: depName });
                    log.verbose(`Registered config from ${depName}`);
                } else {
                    log.warn(`Hook ${depName} has 'hasConfig: true' but no 'registerRedboxConfig' function`);
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.verbose(`Could not process dependency ${depName} for config: ${message}`);
        }
    }

    return { hookConfigs };
}

export async function generateConfigShims(
    configDir: string,
    hookConfigs: HookConfigRegistration[]
): Promise<GenerationStats> {
    const { Config } = loadCoreTypes();

    let generated = 0;
    const configNames = Object.keys(Config);

    const hookImports = hookConfigs
        .map(hook => {
            const varName = hook.name.replace(/[@/-]/g, '_') + '_config';
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
                const varName = hook.name.replace(/[@/-]/g, '_') + '_config';
                return `${varName}['${name}'] || {}`;
            });

            const mergeStatement =
                hookMerges.length > 0 ? `_.merge({}, Config.${name} || {}, ${hookMerges.join(', ')})` : `Config.${name}`;

            const content = `'use strict';\n/**\n * ${name} config shim\n * Auto-generated by redbox-loader.js\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n *\n * Merges: core config + hook configs (alphabetical order)\n * Debug view: see support/debug-config/resolved.js\n */\nconst _ = require('lodash');\nconst { Config } = require('@researchdatabox/redbox-core');\n${hookImports}\n\nmodule.exports.${name} = ${mergeStatement};\n`;
            const written = await writeFileIfChanged(filePath, content);
            if (written) {
                generated++;
            }
        })
    );

    const datastoresFilePath = path.join(configDir, 'datastores.js');
    const datastoresContent = `'use strict';\n/**\n * datastores config shim\n * Auto-generated by redbox-loader.js\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n *\n * NOTE: This uses direct export without _.merge to preserve adapter object references.\n * Using _.merge would create copies of adapter objects, causing Sails to see\n * multiple adapters with the same identity.\n */\nconst { Config } = require('@researchdatabox/redbox-core');\nmodule.exports.datastores = Config.datastores;\n`;
    const datastoresWritten = await writeFileIfChanged(datastoresFilePath, datastoresContent);
    if (datastoresWritten) {
        generated++;
    }

    return { generated, total: configNames.length };
}

function serializeForSnapshot(value: unknown, seen = new WeakSet()): unknown {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value === 'function') {
        return `[Function: ${value.name || 'anonymous'}]`;
    }
    if (typeof value !== 'object') {
        return value;
    }
    if (seen.has(value as object)) {
        return '[Circular]';
    }
    seen.add(value as object);
    if (Array.isArray(value)) {
        return value.map(v => serializeForSnapshot(v, seen));
    }
    const result: Record<string, unknown> = {};
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

    const _ = require('lodash') as typeof import('lodash');
    let mergedConfig = _.cloneDeep(Config);

    for (const hook of hookConfigs) {
        try {
            const hookModule = require(hook.module) as { registerRedboxConfig?: () => Record<string, unknown> };
            if (typeof hookModule.registerRedboxConfig === 'function') {
                const hookConfig = hookModule.registerRedboxConfig();
                mergedConfig = _.merge(mergedConfig, hookConfig);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.warn(`Could not load config from ${hook.name} for snapshot: ${message}`);
        }
    }

    const snapshot = {
        _meta: {
            exportedAt: new Date().toISOString(),
            stage: 'pre-lift',
            description: 'Config from core-types + hooks BEFORE Sails merges environment config',
            sources: ['@researchdatabox/redbox-core', ...hookConfigs.map(h => h.name)],
        },
        ...(serializeForSnapshot(mergedConfig) as Record<string, unknown>),
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
        .map(hook => `const ${hook.name.replace(/[@/-]/g, '_')}_bootstrap = require('${hook.module}').registerRedboxBootstrap();`)
        .join('\n');

    const hookCalls = hookBootstraps
        .map(hook => {
            const varName = hook.name.replace(/[@/-]/g, '_');
            return `        await ${varName}_bootstrap();\n        sails.log.verbose("Hook bootstrap complete: ${hook.name}");`;
        })
        .join('\n');

    const content = `'use strict';\n/**\n * Bootstrap config shim\n * Auto-generated by redbox-loader.js\n * Provided by: @researchdatabox/redbox-core\n * Do not edit manually - regenerated when .regenerate-shims marker exists\n *\n * An asynchronous bootstrap function that runs before your Sails app gets lifted.\n * This gives you an opportunity to set up your data model, run jobs, or perform some special logic.\n */\nconst { coreBootstrap, preLiftSetup } = require('@researchdatabox/redbox-core');\nconst fs = require('fs').promises;\nconst path = require('path');\n${hookImports}\n\n/**\n * Serializes config for JSON export, handling functions and circular refs\n */\nfunction serializeConfig(obj, seen = new WeakSet()) {\n    if (obj === null || obj === undefined) return obj;\n    if (typeof obj === 'function') return '[Function: ' + (obj.name || 'anonymous') + ']';\n    if (typeof obj !== 'object') return obj;\n    if (seen.has(obj)) return '[Circular]';\n    seen.add(obj);\n    if (Array.isArray(obj)) return obj.map(v => serializeConfig(v, seen));\n    const result = {};\n    for (const [key, value] of Object.entries(obj)) {\n        result[key] = serializeConfig(value, seen);\n    }\n    return result;\n}\n\nmodule.exports.bootstrap = function(cb) {\n    // Pre-lift configuration setup\n    preLiftSetup();\n\n    // Run bootstrap sequence\n    (async () => {\n        // Core bootstrap first\n        await coreBootstrap();\n        sails.log.verbose("Core bootstrap complete.");\n\n        // Hook bootstraps run after core\n${hookCalls}\n\n        // Export config snapshot if EXPORT_BOOTSTRAP_CONFIG_JSON is set\n        if (process.env.EXPORT_BOOTSTRAP_CONFIG_JSON === 'true') {\n            const configSnapshot = {\n                _meta: {\n                    exportedAt: new Date().toISOString(),\n                    stage: 'post-bootstrap',\n                    description: 'Final merged sails.config AFTER Sails loads environment config and runs bootstrap',\n                    environment: process.env.NODE_ENV || 'development'\n                },\n                ...serializeConfig(sails.config)\n            };\n            const debugDir = path.join(process.cwd(), 'support', 'debug-config');\n            await fs.mkdir(debugDir, { recursive: true });\n            const snapshotPath = path.join(debugDir, 'post-bootstrap-config.json');\n            await fs.writeFile(snapshotPath, JSON.stringify(configSnapshot, null, 2));\n            sails.log.info('Exported config snapshot to ' + snapshotPath);\n        }\n    })().then(() => {\n        // It's very important to trigger this callback method when you are finished\n        // with the bootstrap! (otherwise your server will never lift)\n        cb();\n    }).catch(error => {\n        sails.log.verbose("Bootstrap failed!!!");\n        sails.log.error(error);\n        cb(error);\n    });\n};\n`;

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

    try {
        const depScanStart = performance.now();
        const {
            hookModels,
            hookPolicies,
            hookBootstraps,
            hookServices,
            hookControllers,
            hookWebserviceControllers,
            hookFormConfigs,
        } = await findAndRegisterHooks(appPath);
        const { hookConfigs } = await findAndRegisterHookConfigs(appPath);
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
            bootstrapStats,
        ] = await Promise.all([
            generateModelShims(modelsDir, hookModels),
            generatePolicyShims(policiesDir, hookPolicies),
            generateMiddlewareShims(middlewareDir),
            generateResponseShims(responsesDir),
            generateServiceShims(servicesDir, hookServices),
            generateControllerShims(controllersDir, hookControllers, hookWebserviceControllers),
            generateFormConfigShims(formConfigDir, hookFormConfigs),
            generateConfigShims(configDir, hookConfigs),
            generateBootstrapShim(configDir, hookBootstraps),
        ]);

        log.verbose(`Shim generation took ${(performance.now() - genStart).toFixed(2)}ms`);
        log.verbose(`Models: ${modelStats.generated}/${modelStats.total} written (${modelStats.fromHooks} from hooks)`);
        log.verbose(`Policies: ${policyStats.generated}/${policyStats.total} written (${policyStats.fromHooks} from hooks)`);
        log.verbose(`Middleware: ${middlewareStats.generated}/${middlewareStats.total} written`);
        log.verbose(`Responses: ${responseStats.generated}/${responseStats.total} written`);
        log.verbose(`Services: ${serviceStats.generated}/${serviceStats.total} written (${serviceStats.fromHooks} from hooks)`);
        log.verbose(`Controllers: ${controllerStats.generated}/${controllerStats.total} written (${controllerStats.fromHooks} from hooks)`);
        log.verbose(
            `Form-config: index ${formConfigStats.generated ? 'written' : 'unchanged'}; entries ${formConfigStats.indexCount} (${formConfigStats.fromHooks} from hooks)`
        );
        log.verbose(`Config Shims: ${configShimStats.generated}/${configShimStats.total} written`);
        log.verbose(`Bootstrap: ${bootstrapStats.generated}/${bootstrapStats.total} written (${bootstrapStats.hookCount} hook bootstraps)`);

        await generatePreLiftSnapshot(appPath, hookConfigs);

        if (deleteMarker) {
            const markerPath = path.join(appPath, '.regenerate-shims');
            try {
                await fs.unlink(markerPath);
                log.verbose('Deleted .regenerate-shims marker file');
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.warn('Could not delete .regenerate-shims marker:', message);
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
                bootstrapStats,
            },
            totalTimeMs: Number.parseFloat(totalTime),
        };
    } catch (err) {
        log.error('Failed to generate shims:', err);
        throw err;
    }
}
