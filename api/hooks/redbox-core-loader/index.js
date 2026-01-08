/**
 * Sails hook for redbox-core-types integration.
 * 
 * This hook generates model, service and controller shim files from the classes
 * exported by @researchdatabox/redbox-core-types. The shims are generated before
 * the ORM hook loads, allowing Sails to use the TypeScript-defined implementations.
 * 
 * External hooks can register their own typed models by adding them to
 * sails.config.redboxHookModels in their configure() phase.
 */

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

const { WaterlineModels, Policies, Middleware, Responses } = require('@researchdatabox/redbox-core-types');

// These are skipped from core WaterlineModels unless registered via sails.config.redboxHookModels
const EXTERNAL_MODELS = [];

// Policies that might be overridden by external hooks
const EXTERNAL_POLICIES = [];

/**
 * Dynamically finds and registers models and policies from other redbox hooks.
 * This scans dependencies once to find hooks that reference 'hasModels' or 'hasPolicies'.
 */
async function findAndRegisterHooks(sails) {
  if (!sails.config.redboxHookModels) {
    sails.config.redboxHookModels = {};
  }
  if (!sails.config.redboxHookPolicies) {
    sails.config.redboxHookPolicies = {};
  }

  const appPath = sails.config.appPath || process.cwd();
  let packageJson;
  try {
    const packageJsonContent = await fs.readFile(path.join(appPath, 'package.json'), 'utf8');
    packageJson = JSON.parse(packageJsonContent);
  } catch (err) {
    sails.log.warn('redbox-core-loader: Could not load package.json to find hooks', err);
    return;
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
        sails.log.verbose(`redbox-core-loader: Found hook with models: ${depName}`);

        const hookModule = require(depName);
        if (typeof hookModule.registerRedboxModels === 'function') {
          const models = hookModule.registerRedboxModels();
          Object.assign(sails.config.redboxHookModels, models);
          sails.log.verbose(`redbox-core-loader: Registered models from ${depName}`);
        } else {
          sails.log.warn(`redbox-core-loader: Hook ${depName} has 'hasModels: true' but no 'registerRedboxModels' function`);
        }
      }

      // Check for policies
      if (depPackageJson.sails && depPackageJson.sails.hasPolicies === true) {
        sails.log.verbose(`redbox-core-loader: Found hook with policies: ${depName}`);

        const hookModule = require(depName);
        if (typeof hookModule.registerRedboxPolicies === 'function') {
          const policies = hookModule.registerRedboxPolicies();
          Object.assign(sails.config.redboxHookPolicies, policies);
          sails.log.verbose(`redbox-core-loader: Registered policies from ${depName}`);
        } else {
          sails.log.warn(`redbox-core-loader: Hook ${depName} has 'hasPolicies: true' but no 'registerRedboxPolicies' function`);
        }
      }

    } catch (err) {
      // Ignore dependencies that can't be resolved or loaded
    }
  }));
}

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
 * Generates policy shim files in api/policies/ from the Policies object
 * exported by @researchdatabox/redbox-core-types and from hook registrations.
 * 
 * Unlike models, policies are simple middleware functions, so we can directly
 * require and re-export them without needing complex shims.
 */
async function generatePolicyShims(sails, policiesDir) {
  // Get hook-registered policies from sails.config
  const hookPolicies = sails.config.redboxHookPolicies || {};

  // Collect all policy names from both sources
  const corePolicyNames = Object.keys(Policies);
  const hookPolicyNames = Object.keys(hookPolicies);
  const allPolicyNames = new Set([...corePolicyNames, ...hookPolicyNames]);

  let generated = 0;
  let skipped = 0;
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
 * Auto-generated by api/hooks/redbox-core-loader
 * Provided by: ${hookModuleName}
 * Do not edit manually - regenerated on each app start
 */
const { ${policyExportName} } = require('${hookModuleName}').Policies || require('${hookModuleName}');
module.exports = ${policyExportName};
`;
      promises.push(writeFileIfChanged(filePath, content).then(written => {
        if (written) generated++;
        fromHooks++;
      }));
      continue;
    }

    // Skip external policies that aren't registered via hooks
    if (EXTERNAL_POLICIES.includes(name)) {
      sails.log.verbose(`redbox-core-loader: Skipping ${name} (external policy, not registered)`);
      skipped++;
      continue;
    }

    // Generate shim from core Policies
    if (Policies[name]) {
      const filePath = path.join(policiesDir, `${name}.js`);
      const content = `'use strict';
/**
 * ${name} policy shim
 * Auto-generated by api/hooks/redbox-core-loader
 * Provided by: @researchdatabox/redbox-core-types
 * Do not edit manually - regenerated on each app start
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

  return { generated, skipped, fromHooks };
}

async function generateModelShims(sails, modelsDir) {
  // Get hook-registered models from sails.config
  const hookModels = sails.config.redboxHookModels || {};

  // First, collect all model names from both sources
  const coreModelNames = Object.keys(WaterlineModels);
  const hookModelNames = Object.keys(hookModels);
  const allModelNames = new Set([...coreModelNames, ...hookModelNames]);

  let generated = 0;
  let skipped = 0;
  let fromHooks = 0;

  const promises = [];

  for (const name of allModelNames) {
    // Check if this model is registered by a hook
    if (hookModels[name]) {
      // Generate shim from hook-provided model
      const filePath = path.join(modelsDir, `${name}.js`);
      const modelDef = hookModels[name];
      const content = `'use strict';
/**
 * ${name} model shim
 * Auto-generated by api/hooks/redbox-core-loader
 * Provided by: hook registration (sails.config.redboxHookModels)
 * Do not edit manually - regenerated on each app start
 */
module.exports = ${JSON.stringify({ ...modelDef, globalId: name }, null, 2)};
`;
      promises.push(writeFileIfChanged(filePath, content).then(written => {
        if (written) generated++;
        fromHooks++;
      }));
      continue;
    }

    // Skip external models that aren't registered via hooks (legacy compatibility)
    if (EXTERNAL_MODELS.includes(name)) {
      sails.log.verbose(`redbox-core-loader: Skipping ${name} (legacy external model, not registered)`);
      skipped++;
      continue;
    }

    // Generate shim from core WaterlineModels
    if (WaterlineModels[name]) {
      const filePath = path.join(modelsDir, `${name}.js`);
      const content = `'use strict';
/**
 * ${name} model shim
 * Auto-generated by api/hooks/redbox-core-loader
 * Provided by: @researchdatabox/redbox-core-types
 * Do not edit manually - regenerated on each app start
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

  return { generated, skipped, fromHooks };
}

async function generateMiddlewareShims(sails, middlewareDir) {
  let generated = 0;
  // Currently only redboxSession is needed
  if (Middleware.redboxSession) {
    const filePath = path.join(middlewareDir, 'redboxSession.js');
    const content = `'use strict';
/**
 * redboxSession middleware shim
 * Auto-generated by api/hooks/redbox-core-loader
 * Provided by: @researchdatabox/redbox-core-types
 * Do not edit manually - regenerated on each app start
 */
const { Middleware } = require('@researchdatabox/redbox-core-types');
module.exports = Middleware.redboxSession;
`;
    const written = await writeFileIfChanged(filePath, content);
    if (written) generated++;
  }
  return { generated };
}

async function generateResponseShims(sails, responsesDir) {
  let generated = 0;
  const responseNames = Object.keys(Responses || {});

  const promises = responseNames.map(async (name) => {
    const filePath = path.join(responsesDir, `${name}.js`);
    const content = `'use strict';
/**
 * ${name} response shim
 * Auto-generated by api/hooks/redbox-core-loader
 * Provided by: @researchdatabox/redbox-core-types
 * Do not edit manually - regenerated on each app start
 */
const { Responses } = require('@researchdatabox/redbox-core-types');
module.exports = Responses['${name}'];
`;
    const written = await writeFileIfChanged(filePath, content);
    if (written) generated++;
  });

  await Promise.all(promises);

  return { generated };
}

module.exports = function redboxCoreLoader(sails) {
  return {
    defaults: {
      __configKey__: {
        enabled: true,
      },
      // Initialize the redboxHookModels and redboxHookPolicies configs for hooks to populate
      redboxHookModels: {},
      redboxHookPolicies: {}
    },

    configure: function () {
      // Configuration moved to initialize to allow for async operations
    },

    initialize: async function (done) {
      if (!sails.config[this.configKey].enabled) {
        sails.log.verbose('redbox-core-loader: Disabled via config');
        return done();
      }

      sails.log.info('redbox-core-loader: Starting shim generation...');
      const startTime = performance.now();

      const coreModelCount = Object.keys(WaterlineModels || {}).length;
      const corePolicyCount = Object.keys(Policies || {}).length;
      sails.log.verbose(`redbox-core-loader: ${coreModelCount} core models available from @researchdatabox/redbox-core-types`);
      sails.log.verbose(`redbox-core-loader: ${corePolicyCount} core policies available from @researchdatabox/redbox-core-types`);

      try {
        // Run dependency scanning (single pass for both models and policies)
        const depScanStart = performance.now();
        await findAndRegisterHooks(sails);
        sails.log.info(`redbox-core-loader: Dependency scanning took ${(performance.now() - depScanStart).toFixed(2)}ms`);

        // Prepare directories concurrently
        const modelsDir = path.resolve(__dirname, '../../models');
        const policiesDir = path.resolve(__dirname, '../../policies');
        const middlewareDir = path.resolve(__dirname, '../../middleware');
        const responsesDir = path.resolve(__dirname, '../../responses');

        await Promise.all([
          fs.mkdir(modelsDir, { recursive: true }),
          fs.mkdir(policiesDir, { recursive: true }),
          fs.mkdir(middlewareDir, { recursive: true }),
          fs.mkdir(responsesDir, { recursive: true })
        ]);

        // Generate shims in parallel
        const genStart = performance.now();
        const [modelStats, policyStats, middlewareStats, responseStats] = await Promise.all([
          generateModelShims(sails, modelsDir),
          generatePolicyShims(sails, policiesDir),
          generateMiddlewareShims(sails, middlewareDir),
          generateResponseShims(sails, responsesDir)
        ]);
        sails.log.info(`redbox-core-loader: Shim generation took ${(performance.now() - genStart).toFixed(2)}ms`);

        sails.log.verbose(`redbox-core-loader: Generated ${modelStats.generated} model shims (${modelStats.fromHooks} from hooks), skipped ${modelStats.skipped} external`);
        sails.log.verbose(`redbox-core-loader: Generated ${policyStats.generated} policy shims (${policyStats.fromHooks} from hooks), skipped ${policyStats.skipped} external`);
        sails.log.verbose(`redbox-core-loader: Generated ${middlewareStats.generated} middleware shims`);
        sails.log.verbose(`redbox-core-loader: Generated ${responseStats.generated} response shims`);

        sails.log.info(`redbox-core-loader: Total initialization took ${(performance.now() - startTime).toFixed(2)}ms`);
        sails.log.verbose('redbox-core-loader: Initialization complete');

        return done();
      } catch (err) {
        sails.log.error('redbox-core-loader: Error during initialization', err);
        return done(err);
      }
    }
  };
};
