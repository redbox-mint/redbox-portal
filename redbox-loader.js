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
let WaterlineModels, Policies, Middleware, Responses, Config;

function loadCoreTypes() {
    if (!WaterlineModels) {
        const coreTypes = require('@researchdatabox/redbox-core-types');
        WaterlineModels = coreTypes.WaterlineModels || {};
        Policies = coreTypes.Policies || {};
        Middleware = coreTypes.Middleware || {};
        Responses = coreTypes.Responses || {};
        Config = coreTypes.Config || {};
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

        } catch (err) {
            // Ignore dependencies that can't be resolved or loaded
            log.verbose(`Could not process dependency ${depName}: ${err.message}`);
        }
    }));

    return { hookModels, hookPolicies, hookBootstraps };
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
 * Generates config shim files in config/
 */
async function generateConfigShims(configDir) {
    loadCoreTypes();

    let generated = 0;
    const configNames = Object.keys(Config);

    const promises = configNames.map(async (name) => {
        const filePath = path.join(configDir, `${name}.js`);
        const content = `'use strict';
/**
 * ${name} config shim
 * Auto-generated by redbox-loader.js
 * Provided by: @researchdatabox/redbox-core-types
 * Do not edit manually - regenerated when .regenerate-shims marker exists
 */
const { Config } = require('@researchdatabox/redbox-core-types');
module.exports.${name} = Config.${name};
`;
        const written = await writeFileIfChanged(filePath, content);
        if (written) generated++;
    });

    await Promise.all(promises);

    return { generated, total: configNames.length };
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
${hookImports}

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
    const dirs = ['models', 'policies', 'middleware', 'responses'];

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
        // Scan dependencies for hook registrations
        const depScanStart = performance.now();
        const { hookModels, hookPolicies, hookBootstraps } = await findAndRegisterHooks(appPath);
        log.verbose(`Dependency scanning took ${(performance.now() - depScanStart).toFixed(2)}ms`);

        // Prepare directories
        const modelsDir = path.join(appPath, 'api', 'models');
        const policiesDir = path.join(appPath, 'api', 'policies');
        const middlewareDir = path.join(appPath, 'api', 'middleware');
        const responsesDir = path.join(appPath, 'api', 'responses');

        await Promise.all([
            fs.mkdir(modelsDir, { recursive: true }),
            fs.mkdir(policiesDir, { recursive: true }),
            fs.mkdir(middlewareDir, { recursive: true }),
            fs.mkdir(responsesDir, { recursive: true })
        ]);

        // Prepare config directory
        const configDir = path.join(appPath, 'config');

        // Generate shims in parallel
        const genStart = performance.now();
        const [modelStats, policyStats, middlewareStats, responseStats, configStats, bootstrapStats] = await Promise.all([
            generateModelShims(modelsDir, hookModels),
            generatePolicyShims(policiesDir, hookPolicies),
            generateMiddlewareShims(middlewareDir),
            generateResponseShims(responsesDir),
            generateConfigShims(configDir),
            generateBootstrapShim(configDir, hookBootstraps)
        ]);

        log.verbose(`Shim generation took ${(performance.now() - genStart).toFixed(2)}ms`);
        log.verbose(`Models: ${modelStats.generated}/${modelStats.total} written (${modelStats.fromHooks} from hooks)`);
        log.verbose(`Policies: ${policyStats.generated}/${policyStats.total} written (${policyStats.fromHooks} from hooks)`);
        log.verbose(`Middleware: ${middlewareStats.generated}/${middlewareStats.total} written`);
        log.verbose(`Responses: ${responseStats.generated}/${responseStats.total} written`);
        log.verbose(`Configs: ${configStats.generated}/${configStats.total} written`);
        log.verbose(`Bootstrap: ${bootstrapStats.generated}/${bootstrapStats.total} written (${bootstrapStats.hookCount} hook bootstraps)`);

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
            stats: { modelStats, policyStats, middlewareStats, responseStats, configStats, bootstrapStats },
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
    generateModelShims,
    generatePolicyShims,
    generateMiddlewareShims,
    generateResponseShims,
    generateConfigShims,
    generateBootstrapShim,
    shouldRegenerateShims,
    writeFileIfChanged
};
