/**
 * ReDBox Loader - Pre-Lift Shim Generator
 * 
 * This module generates model, service, policy, middleware, and response shim files
 * from classes exported by @researchdatabox/redbox-core-types and external hooks.
 * 
 * It runs BEFORE sails.lift() to eliminate race conditions with hook loading order.
 * 
 * Usage:
 *   const redboxLoader = require('./redbox-loader');
 *   await redboxLoader.generateAllShims(__dirname, { verbose: true });
 *   sails.lift(rc('sails'));
 * 
 * Regeneration triggers (in priority order):
 *   1. .regenerate-shims marker file exists → regenerate, then delete marker
 *   2. REGENERATE_SHIMS=true env var → regenerate
 *   3. Any shim directory is empty → regenerate
 *   4. Otherwise → skip regeneration
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// Lazy-loaded to avoid circular dependency issues at startup
let WaterlineModels, Policies, Middleware, Responses, Config, ServiceExports;

function loadCoreTypes() {
    if (!WaterlineModels) {
        const coreTypes = require('@researchdatabox/redbox-core-types');
        WaterlineModels = coreTypes.WaterlineModels || {};
        Policies = coreTypes.Policies || {};
        Middleware = coreTypes.Middleware || {};
        Responses = coreTypes.Responses || {};
        Config = coreTypes.Config || {};
        ServiceExports = coreTypes.ServiceExports || {};
    }
}

// Simple console logger that mimics sails.log interface
const log = {
    info: (...args) => console.log('[redbox-loader]', ...args),
    verbose: (...args) => {
        if (process.env.SHIM_VERBOSE === 'true') {
            console.log('[redbox-loader:verbose]', ...args);
        }
    },
    warn: (...args) => console.warn('[redbox-loader:warn]', ...args),
    error: (...args) => console.error('[redbox-loader:error]', ...args),
};

/**
 * Helper to write file only if content changed to save I/O
 */
async function writeFileIfChanged(filePath, content) {
    try {
        const current = await fs.readFile(filePath, 'utf8').catch(() => null);
        if (current !== content) {
            await fs.writeFile(filePath, content, 'utf8');
            return true; // written
        }
    } catch (e) {
        await fs.writeFile(filePath, content, 'utf8');
        return true;
    }
    return false; // skipped
}

/**
 * Check if a directory is empty or doesn't exist
 */
async function isDirEmpty(dirPath) {
    try {
        const files = await fs.readdir(dirPath);
        return files.length === 0;
    } catch (e) {
        return true; // doesn't exist = empty
    }
}

/**
 * Dynamically finds and registers models, policies, and bootstraps from other redbox hooks.
 * Scans dependencies for hooks with sails.hasModels, sails.hasPolicies, or sails.hasBootstrap in their package.json.
 */
async function findAndRegisterHooks(appPath) {
    const hookModels = {};
    const hookPolicies = {};
    const hookBootstraps = [];
    const hookServices = {};

    let packageJson;
    try {
        const packageJsonContent = await fs.readFile(path.join(appPath, 'package.json'), 'utf8');
        packageJson = JSON.parse(packageJsonContent);
    } catch (err) {
        log.warn('Could not load package.json to find hooks', err.message);
        return { hookModels, hookPolicies };
    }

    const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
    };

    const dependencies = Object.keys(allDependencies);

    // Process dependencies concurrently
    await Promise.all(dependencies.map(async (depName) => {
        try {
            // Resolve the package.json of the dependency to check its configuration
            let depPackageJsonPath;
            try {
                depPackageJsonPath = require.resolve(`${depName}/package.json`, { paths: [appPath] });
            } catch (e) {
                // Module not found or other resolve error
                return;
            }

            const depPackageJsonContent = await fs.readFile(depPackageJsonPath, 'utf8');
            const depPackageJson = JSON.parse(depPackageJsonContent);

            // Check for models
            if (depPackageJson.sails && depPackageJson.sails.hasModels === true) {
                log.verbose(`Found hook with models: ${depName}`);

                const hookModule = require(depName);
                if (typeof hookModule.registerRedboxModels === 'function') {
                    const models = hookModule.registerRedboxModels();
                    Object.assign(hookModels, models);
                    log.verbose(`Registered ${Object.keys(models).length} models from ${depName}`);
                } else {
                    log.warn(`Hook ${depName} has 'hasModels: true' but no 'registerRedboxModels' function`);
                }
            }

            // Check for policies
            if (depPackageJson.sails && depPackageJson.sails.hasPolicies === true) {
                log.verbose(`Found hook with policies: ${depName}`);

                const hookModule = require(depName);
                if (typeof hookModule.registerRedboxPolicies === 'function') {
                    const policies = hookModule.registerRedboxPolicies();
                    Object.assign(hookPolicies, policies);
                    log.verbose(`Registered ${Object.keys(policies).length} policies from ${depName}`);
                } else {
                    log.warn(`Hook ${depName} has 'hasPolicies: true' but no 'registerRedboxPolicies' function`);
                }
            }

            // Check for bootstrap
            if (depPackageJson.sails && depPackageJson.sails.hasBootstrap === true) {
                log.verbose(`Found hook with bootstrap: ${depName}`);

                const hookModule = require(depName);
                if (typeof hookModule.registerRedboxBootstrap === 'function') {
                    hookBootstraps.push({
                        name: depName,
                        module: depName
                    });
                    log.verbose(`Registered bootstrap from ${depName}`);
                } else {
                    log.warn(`Hook ${depName} has 'hasBootstrap: true' but no 'registerRedboxBootstrap' function`);
                }
            }

            // Check for services
            if (depPackageJson.sails && depPackageJson.sails.hasServices === true) {
                log.verbose(`Found hook with services: ${depName}`);

                const hookModule = require(depName);
                if (typeof hookModule.registerRedboxServices === 'function') {
                    const services = hookModule.registerRedboxServices();
                    // Store service with module reference for shim generation
                    for (const serviceName of Object.keys(services)) {
                        hookServices[serviceName] = {
                            module: depName,
                            service: services[serviceName]
                        };
                    }
                    log.verbose(`Registered ${Object.keys(services).length} services from ${depName}`);
                } else {
                    log.warn(`Hook ${depName} has 'hasServices: true' but no 'registerRedboxServices' function`);
                }
            }

        } catch (err) {
            // Ignore dependencies that can't be resolved or loaded
            log.verbose(`Could not process dependency ${depName}: ${err.message}`);
        }
    }));

    return { hookModels, hookPolicies, hookBootstraps, hookServices };
}

/**
 * Generates policy shim files in api/policies/
 */
async function generatePolicyShims(policiesDir, hookPolicies) {
    loadCoreTypes();

    const corePolicyNames = Object.keys(Policies);
    const hookPolicyNames = Object.keys(hookPolicies);
    const allPolicyNames = new Set([...corePolicyNames, ...hookPolicyNames]);

    let generated = 0;
    let fromHooks = 0;

    const promises = [];

    for (const name of allPolicyNames) {
        // Check if this policy is registered by a hook (hooks take precedence)
        if (hookPolicies[name]) {
            const filePath = path.join(policiesDir, `${name}.js`);
            const hookModuleName = hookPolicies[name].module;
            const policyExportName = hookPolicies[name].exportName || name;
            const content = `'use strict';
/**
 * ${name} policy shim
 * Auto-generated by redbox-loader.js
 * Provided by: ${hookModuleName}
 * Do not edit manually - regenerated when .regenerate-shims marker exists
 */
const { ${policyExportName} } = require('${hookModuleName}').Policies || require('${hookModuleName}');
module.exports = ${policyExportName};
`;
            promises.push(writeFileIfChanged(filePath, content).then(written => {
                if (written) {
                    generated++;
                    fromHooks++;
                }
            }));
            continue;
        }

        // Generate shim from core Policies
        if (Policies[name]) {
            const filePath = path.join(policiesDir, `${name}.js`);
            const content = `'use strict';
/**
 * ${name} policy shim
 * Auto-generated by redbox-loader.js
 * Provided by: @researchdatabox/redbox-core-types
 * Do not edit manually - regenerated when .regenerate-shims marker exists
 */
const { Policies } = require('@researchdatabox/redbox-core-types');
module.exports = Policies['${name}'];
`;
            promises.push(writeFileIfChanged(filePath, content).then(written => {
                if (written) generated++;
            }));
        }
    }

    await Promise.all(promises);

    return { generated, fromHooks, total: allPolicyNames.size };
}

/**
 * Generates model shim files in api/models/
 */
async function generateModelShims(modelsDir, hookModels) {
    loadCoreTypes();

    const coreModelNames = Object.keys(WaterlineModels);
    const hookModelNames = Object.keys(hookModels);
    const allModelNames = new Set([...coreModelNames, ...hookModelNames]);

    let generated = 0;
    let fromHooks = 0;

    const promises = [];

    for (const name of allModelNames) {
        // Check if this model is registered by a hook
        if (hookModels[name]) {
            const filePath = path.join(modelsDir, `${name}.js`);
            const modelDef = hookModels[name];
            const content = `'use strict';
/**
 * ${name} model shim
 * Auto-generated by redbox-loader.js
 * Provided by: hook registration
 * Do not edit manually - regenerated when .regenerate-shims marker exists
 */
module.exports = ${JSON.stringify({ ...modelDef, globalId: name }, null, 2)};
`;
            promises.push(writeFileIfChanged(filePath, content).then(written => {
                if (written) {
                    generated++;
                    fromHooks++;
                }
            }));
            continue;
        }

        // Generate shim from core WaterlineModels
        if (WaterlineModels[name]) {
            const filePath = path.join(modelsDir, `${name}.js`);
            const content = `'use strict';
/**
 * ${name} model shim
 * Auto-generated by redbox-loader.js
 * Provided by: @researchdatabox/redbox-core-types
 * Do not edit manually - regenerated when .regenerate-shims marker exists
 */
const { WaterlineModels } = require('@researchdatabox/redbox-core-types');
module.exports = { ...WaterlineModels['${name}'], globalId: '${name}' };
`;
            promises.push(writeFileIfChanged(filePath, content).then(written => {
                if (written) generated++;
            }));
        }
    }

    await Promise.all(promises);

    return { generated, fromHooks, total: allModelNames.size };
}

/**
 * Generates middleware shim files in api/middleware/
 */
async function generateMiddlewareShims(middlewareDir) {
    loadCoreTypes();

    let generated = 0;
    const middlewareNames = Object.keys(Middleware);

    const promises = middlewareNames.map(async (name) => {
        const filePath = path.join(middlewareDir, `${name}.js`);
        const content = `'use strict';
/**
 * ${name} middleware shim
 * Auto-generated by redbox-loader.js
 * Provided by: @researchdatabox/redbox-core-types
 * Do not edit manually - regenerated when .regenerate-shims marker exists
 */
const { Middleware } = require('@researchdatabox/redbox-core-types');
module.exports = Middleware['${name}'];
`;
        const written = await writeFileIfChanged(filePath, content);
        if (written) generated++;
    });

    await Promise.all(promises);

    return { generated, total: middlewareNames.length };
}

/**
 * Generates response shim files in api/responses/
 */
async function generateResponseShims(responsesDir) {
    loadCoreTypes();

    let generated = 0;
    const responseNames = Object.keys(Responses);

    const promises = responseNames.map(async (name) => {
        const filePath = path.join(responsesDir, `${name}.js`);
        const content = `'use strict';
/**
 * ${name} response shim
 * Auto-generated by redbox-loader.js
 * Provided by: @researchdatabox/redbox-core-types
 * Do not edit manually - regenerated when .regenerate-shims marker exists
 */
const { Responses } = require('@researchdatabox/redbox-core-types');
module.exports = Responses['${name}'];
`;
        const written = await writeFileIfChanged(filePath, content);
        if (written) generated++;
    });

    await Promise.all(promises);

    return { generated, total: responseNames.length };
}

/**
 * Generates service shim files in api/services/
 * @param {string} servicesDir - Path to api/services directory
 * @param {Object} hookServices - Services registered by hooks
 */
async function generateServiceShims(servicesDir, hookServices) {
    loadCoreTypes();

    const coreServiceNames = Object.keys(ServiceExports);
    const hookServiceNames = Object.keys(hookServices);
    const allServiceNames = new Set([...coreServiceNames, ...hookServiceNames]);

    let generated = 0;
    let fromHooks = 0;

    const promises = [];

    for (const name of allServiceNames) {
        // Hook services take precedence
        if (hookServices[name]) {
            const filePath = path.join(servicesDir, `${name}.js`);
            const hookModuleName = hookServices[name].module;
            const content = `'use strict';
/**
 * ${name} service shim
 * Auto-generated by redbox-loader.js
 * Provided by: ${hookModuleName}
 * Do not edit manually - regenerated when .regenerate-shims marker exists
 */
module.exports = require('${hookModuleName}').ServiceExports['${name}'];
`;
            promises.push(writeFileIfChanged(filePath, content).then(written => {
                if (written) {
                    generated++;
                    fromHooks++;
                }
            }));
            continue;
        }

        // Generate shim from core ServiceExports
        if (ServiceExports[name]) {
            const filePath = path.join(servicesDir, `${name}.js`);
            const content = `'use strict';
/**
 * ${name} service shim
 * Auto-generated by redbox-loader.js
 * Provided by: @researchdatabox/redbox-core-types
 * Do not edit manually - regenerated when .regenerate-shims marker exists
 */
const { ServiceExports } = require('@researchdatabox/redbox-core-types');
module.exports = ServiceExports['${name}'];
`;
            promises.push(writeFileIfChanged(filePath, content).then(written => {
                if (written) generated++;
            }));
        }
    }

    await Promise.all(promises);

    return { generated, fromHooks, total: allServiceNames.size };
}

/**
 * Finds and registers hook configurations from dependencies.
 * Scans dependencies for hooks with sails.hasConfig === true in their package.json.
 * @param {string} appPath - Root application path
 * @returns {Promise<{hookConfigs: Array<{name: string, module: string}>}>}
 */
async function findAndRegisterHookConfigs(appPath) {
    const hookConfigs = [];

    let packageJson;
    try {
        const packageJsonContent = await fs.readFile(path.join(appPath, 'package.json'), 'utf8');
        packageJson = JSON.parse(packageJsonContent);
    } catch (err) {
        log.warn('Could not load package.json to find hook configs', err.message);
        return { hookConfigs };
    }

    const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
    };

    const dependencies = Object.keys(allDependencies).sort(); // Alphabetical for deterministic order

    for (const depName of dependencies) {
        try {
            let depPackageJsonPath;
            try {
                depPackageJsonPath = require.resolve(`${depName}/package.json`, { paths: [appPath] });
            } catch (e) {
                continue;
            }

            const depPackageJsonContent = await fs.readFile(depPackageJsonPath, 'utf8');
            const depPackageJson = JSON.parse(depPackageJsonContent);

            if (depPackageJson.sails && depPackageJson.sails.hasConfig === true) {
                log.verbose(`Found hook with config: ${depName}`);

                const hookModule = require(depName);
                if (typeof hookModule.registerRedboxConfig === 'function') {
                    hookConfigs.push({
                        name: depName,
                        module: depName
                    });
                    log.verbose(`Registered config from ${depName}`);
                } else {
                    log.warn(`Hook ${depName} has 'hasConfig: true' but no 'registerRedboxConfig' function`);
                }
            }
        } catch (err) {
            log.verbose(`Could not process dependency ${depName} for config: ${err.message}`);
        }
    }

    return { hookConfigs };
}

/**
 * Generates individual config shim files that export config from redbox-core-types.
 * These are the basic shims needed for Sails to load configuration.
 * The resolved.js file in support/debug-config/ provides the unified view for debugging.
 * @param {string} configDir - Path to config directory
 * @param {Array<{name: string, module: string}>} hookConfigs - Hook config registrations
 * @returns {Promise<{generated: number, total: number}>}
 */
async function generateConfigShims(configDir, hookConfigs) {
    loadCoreTypes();

    let generated = 0;
    const configNames = Object.keys(Config);

    // Build hook import statements
    const hookImports = hookConfigs.map(hook => {
        const varName = hook.name.replace(/[@/-]/g, '_') + '_config';
        return `const ${varName} = require('${hook.module}').registerRedboxConfig();`;
    }).join('\n');

    const promises = configNames.map(async (name) => {
        const filePath = path.join(configDir, `${name}.js`);
        // Skip form.js as it has custom require() chain
        // Skip datastores.js as _.merge breaks adapter object references - use direct export
        if (name === 'form' || name === 'datastores') {
            return;
        }

        // Build hook merge for this specific config key
        const hookMerges = hookConfigs.map(hook => {
            const varName = hook.name.replace(/[@/-]/g, '_') + '_config';
            return `${varName}['${name}'] || {}`;
        });

        const mergeStatement = hookMerges.length > 0
            ? `_.merge({}, Config.${name} || {}, ${hookMerges.join(', ')})`
            : `Config.${name}`;

        const content = `'use strict';
/**
 * ${name} config shim
 * Auto-generated by redbox-loader.js
 * Do not edit manually - regenerated when .regenerate-shims marker exists
 *
 * Merges: core config + hook configs (alphabetical order)
 * Debug view: see support/debug-config/resolved.js
 */
const _ = require('lodash');
const { Config } = require('@researchdatabox/redbox-core-types');
${hookImports}

module.exports.${name} = ${mergeStatement};
`;
        const written = await writeFileIfChanged(filePath, content);
        if (written) generated++;
    });

    await Promise.all(promises);

    // Generate special datastores shim with direct export (no merge) to preserve adapter references
    const datastoresFilePath = path.join(configDir, 'datastores.js');
    const datastoresContent = `'use strict';
/**
 * datastores config shim
 * Auto-generated by redbox-loader.js
 * Do not edit manually - regenerated when .regenerate-shims marker exists
 *
 * NOTE: This uses direct export without _.merge to preserve adapter object references.
 * Using _.merge would create copies of adapter objects, causing Sails to see
 * multiple adapters with the same identity.
 */
const { Config } = require('@researchdatabox/redbox-core-types');
module.exports.datastores = Config.datastores;
`;
    const datastoresWritten = await writeFileIfChanged(datastoresFilePath, datastoresContent);
    if (datastoresWritten) generated++;

    return { generated, total: configNames.length };
}

/**
 * Serializes a value to JSON, marking functions appropriately.
 */
function serializeForSnapshot(value, seen = new WeakSet()) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
    if (typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) return value.map(v => serializeForSnapshot(v, seen));
    const result = {};
    for (const [key, val] of Object.entries(value)) {
        result[key] = serializeForSnapshot(val, seen);
    }
    return result;
}

/**
 * Generates a pre-lift config snapshot showing config from core-types + hooks
 * before Sails merges in environment-specific config.
 * Only generated when EXPORT_BOOTSTRAP_CONFIG_JSON=true
 * @param {string} appPath - Path to app directory
 * @param {Array<{name: string, module: string}>} hookConfigs - Hook config registrations
 */
async function generatePreLiftSnapshot(appPath, hookConfigs) {
    if (process.env.EXPORT_BOOTSTRAP_CONFIG_JSON !== 'true') {
        return;
    }

    loadCoreTypes();

    const debugDir = path.join(appPath, 'support', 'debug-config');
    await fs.mkdir(debugDir, { recursive: true });
    const filePath = path.join(debugDir, 'pre-lift-config.json');

    // Build merged config from core + hooks (same logic as config shims)
    const _ = require('lodash');
    let mergedConfig = _.cloneDeep(Config);

    // Merge hook configs
    for (const hook of hookConfigs) {
        try {
            const hookModule = require(hook.module);
            if (typeof hookModule.registerRedboxConfig === 'function') {
                const hookConfig = hookModule.registerRedboxConfig();
                mergedConfig = _.merge(mergedConfig, hookConfig);
            }
        } catch (err) {
            log.warn(`Could not load config from ${hook.name} for snapshot: ${err.message}`);
        }
    }

    const snapshot = {
        _meta: {
            exportedAt: new Date().toISOString(),
            stage: 'pre-lift',
            description: 'Config from core-types + hooks BEFORE Sails merges environment config',
            sources: ['@researchdatabox/redbox-core-types', ...hookConfigs.map(h => h.name)]
        },
        ...serializeForSnapshot(mergedConfig)
    };

    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
    log.info(`Exported pre-lift config snapshot to ${filePath}`);
}

/**
 * Generates the bootstrap.js shim file in config/
 * This file orchestrates the bootstrap process, calling coreBootstrap and hook bootstraps.
 */
async function generateBootstrapShim(configDir, hookBootstraps) {
    const filePath = path.join(configDir, 'bootstrap.js');

    // Build hook import statements
    const hookImports = hookBootstraps.map(hook =>
        `const ${hook.name.replace(/[@/-]/g, '_')}_bootstrap = require('${hook.module}').registerRedboxBootstrap();`
    ).join('\n');

    // Build hook bootstrap calls
    const hookCalls = hookBootstraps.map(hook => {
        const varName = hook.name.replace(/[@/-]/g, '_');
        return `        await ${varName}_bootstrap();\n        sails.log.verbose("Hook bootstrap complete: ${hook.name}");`;
    }).join('\n');

    const content = `'use strict';
/**
 * Bootstrap config shim
 * Auto-generated by redbox-loader.js
 * Provided by: @researchdatabox/redbox-core-types
 * Do not edit manually - regenerated when .regenerate-shims marker exists
 *
 * An asynchronous bootstrap function that runs before your Sails app gets lifted.
 * This gives you an opportunity to set up your data model, run jobs, or perform some special logic.
 */
const { coreBootstrap, preLiftSetup } = require('@researchdatabox/redbox-core-types');
const fs = require('fs').promises;
const path = require('path');
${hookImports}

/**
 * Serializes config for JSON export, handling functions and circular refs
 */
function serializeConfig(obj, seen = new WeakSet()) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'function') return '[Function: ' + (obj.name || 'anonymous') + ']';
    if (typeof obj !== 'object') return obj;
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);
    if (Array.isArray(obj)) return obj.map(v => serializeConfig(v, seen));
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        result[key] = serializeConfig(value, seen);
    }
    return result;
}

module.exports.bootstrap = function(cb) {
    // Pre-lift configuration setup
    preLiftSetup();

    // Run bootstrap sequence
    (async () => {
        // Core bootstrap first
        await coreBootstrap();
        sails.log.verbose("Core bootstrap complete.");

        // Hook bootstraps run after core
${hookCalls}

        // Export config snapshot if EXPORT_BOOTSTRAP_CONFIG_JSON is set
        if (process.env.EXPORT_BOOTSTRAP_CONFIG_JSON === 'true') {
            const configSnapshot = {
                _meta: {
                    exportedAt: new Date().toISOString(),
                    stage: 'post-bootstrap',
                    description: 'Final merged sails.config AFTER Sails loads environment config and runs bootstrap',
                    environment: process.env.NODE_ENV || 'development'
                },
                ...serializeConfig(sails.config)
            };
            const debugDir = path.join(process.cwd(), 'support', 'debug-config');
            await fs.mkdir(debugDir, { recursive: true });
            const snapshotPath = path.join(debugDir, 'post-bootstrap-config.json');
            await fs.writeFile(snapshotPath, JSON.stringify(configSnapshot, null, 2));
            sails.log.info('Exported config snapshot to ' + snapshotPath);
        }
    })().then(() => {
        // It's very important to trigger this callback method when you are finished
        // with the bootstrap! (otherwise your server will never lift)
        cb();
    }).catch(error => {
        sails.log.verbose("Bootstrap failed!!!");
        sails.log.error(error);
        cb(error);
    });
};
`;

    const written = await writeFileIfChanged(filePath, content);
    return { generated: written ? 1 : 0, total: 1, hookCount: hookBootstraps.length };
}

/**
 * Determines if shims need to be regenerated.
 * 
 * @param {string} appPath - Root application path
 * @param {boolean} forceRegenerate - Force regeneration via env var
 * @returns {{ shouldRegenerate: boolean, reason: string, deleteMarker: boolean }}
 */
async function shouldRegenerateShims(appPath, forceRegenerate) {
    const markerPath = path.join(appPath, '.regenerate-shims');

    if (process.env.NODE_ENV !== 'production') {
        return { shouldRegenerate: true, reason: 'NODE_ENV !== production', deleteMarker: false };
    }

    // Check for marker file
    if (fsSync.existsSync(markerPath)) {
        return { shouldRegenerate: true, reason: '.regenerate-shims marker file exists', deleteMarker: true };
    }

    // Check for env var
    if (forceRegenerate) {
        return { shouldRegenerate: true, reason: 'REGENERATE_SHIMS=true', deleteMarker: false };
    }

    // Check if any shim directory is empty
    const apiPath = path.join(appPath, 'api');
    const dirs = ['models', 'policies', 'middleware', 'responses', 'services'];

    for (const dir of dirs) {
        const dirPath = path.join(apiPath, dir);
        if (await isDirEmpty(dirPath)) {
            return { shouldRegenerate: true, reason: `api/${dir}/ is empty`, deleteMarker: false };
        }
    }

    return { shouldRegenerate: false, reason: 'shims already exist', deleteMarker: false };
}

/**
 * Main entry point - generates all shims if needed.
 * 
 * @param {string} appPath - Root application path
 * @param {Object} options - Configuration options
 * @param {boolean} options.forceRegenerate - Force regeneration even if cache valid
 * @param {boolean} options.verbose - Enable verbose logging (also via SHIM_VERBOSE=true)
 */
async function generateAllShims(appPath, options = {}) {
    const startTime = performance.now();

    // Check if we need to regenerate
    const { shouldRegenerate, reason, deleteMarker } = await shouldRegenerateShims(
        appPath,
        options.forceRegenerate
    );

    if (!shouldRegenerate) {
        log.info(`Skipping shim generation (${reason})`);
        return { skipped: true, reason };
    }

    log.info(`Starting shim generation (${reason})...`);

    try {
        // Scan dependencies for hook registrations (models, policies, bootstraps, services)
        const depScanStart = performance.now();
        const { hookModels, hookPolicies, hookBootstraps, hookServices } = await findAndRegisterHooks(appPath);

        // Scan for hook configs
        const { hookConfigs } = await findAndRegisterHookConfigs(appPath);
        log.verbose(`Dependency scanning took ${(performance.now() - depScanStart).toFixed(2)}ms`);
        log.verbose(`Found ${hookConfigs.length} hooks with config`);

        // Prepare directories
        const modelsDir = path.join(appPath, 'api', 'models');
        const policiesDir = path.join(appPath, 'api', 'policies');
        const middlewareDir = path.join(appPath, 'api', 'middleware');
        const responsesDir = path.join(appPath, 'api', 'responses');
        const servicesDir = path.join(appPath, 'api', 'services');

        await Promise.all([
            fs.mkdir(modelsDir, { recursive: true }),
            fs.mkdir(policiesDir, { recursive: true }),
            fs.mkdir(middlewareDir, { recursive: true }),
            fs.mkdir(responsesDir, { recursive: true }),
            fs.mkdir(servicesDir, { recursive: true })
        ]);

        // Prepare config directory
        const configDir = path.join(appPath, 'config');

        // Generate shims in parallel
        const genStart = performance.now();
        const [modelStats, policyStats, middlewareStats, responseStats, serviceStats, configShimStats, bootstrapStats] = await Promise.all([
            generateModelShims(modelsDir, hookModels),
            generatePolicyShims(policiesDir, hookPolicies),
            generateMiddlewareShims(middlewareDir),
            generateResponseShims(responsesDir),
            generateServiceShims(servicesDir, hookServices),
            generateConfigShims(configDir, hookConfigs),
            generateBootstrapShim(configDir, hookBootstraps)
        ]);

        log.verbose(`Shim generation took ${(performance.now() - genStart).toFixed(2)}ms`);
        log.verbose(`Models: ${modelStats.generated}/${modelStats.total} written (${modelStats.fromHooks} from hooks)`);
        log.verbose(`Policies: ${policyStats.generated}/${policyStats.total} written (${policyStats.fromHooks} from hooks)`);
        log.verbose(`Middleware: ${middlewareStats.generated}/${middlewareStats.total} written`);
        log.verbose(`Responses: ${responseStats.generated}/${responseStats.total} written`);
        log.verbose(`Services: ${serviceStats.generated}/${serviceStats.total} written (${serviceStats.fromHooks} from hooks)`);
        log.verbose(`Config Shims: ${configShimStats.generated}/${configShimStats.total} written`);
        log.verbose(`Bootstrap: ${bootstrapStats.generated}/${bootstrapStats.total} written (${bootstrapStats.hookCount} hook bootstraps)`);

        // Generate pre-lift config snapshot if EXPORT_BOOTSTRAP_CONFIG_JSON=true
        await generatePreLiftSnapshot(appPath, hookConfigs);

        // Delete marker file if it triggered the regeneration
        if (deleteMarker) {
            const markerPath = path.join(appPath, '.regenerate-shims');
            try {
                await fs.unlink(markerPath);
                log.verbose('Deleted .regenerate-shims marker file');
            } catch (e) {
                log.warn('Could not delete .regenerate-shims marker:', e.message);
            }
        }

        const totalTime = (performance.now() - startTime).toFixed(2);
        log.info(`Shim generation complete in ${totalTime}ms`);

        return {
            skipped: false,
            reason,
            stats: { modelStats, policyStats, middlewareStats, responseStats, serviceStats, configShimStats, bootstrapStats },
            totalTimeMs: parseFloat(totalTime)
        };

    } catch (err) {
        log.error('Failed to generate shims:', err);
        throw err;
    }
}

module.exports = {
    generateAllShims,
    // Exported for testing
    findAndRegisterHooks,
    findAndRegisterHookConfigs,
    generateModelShims,
    generatePolicyShims,
    generateMiddlewareShims,
    generateResponseShims,
    generateServiceShims,
    generateConfigShims,
    generateBootstrapShim,
    generatePreLiftSnapshot,
    shouldRegenerateShims,
    writeFileIfChanged
};
