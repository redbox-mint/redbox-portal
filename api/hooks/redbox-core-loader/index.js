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

const fs = require('fs');
const path = require('path');

const { WaterlineModels, Policies, Middleware, Responses } = require('@researchdatabox/redbox-core-types');

// These are skipped from core WaterlineModels unless registered via sails.config.redboxHookModels
const EXTERNAL_MODELS = [];

// Policies that might be overridden by external hooks
const EXTERNAL_POLICIES = [];

/**
 * Dynamically finds and registers models from other redbox hooks.
 * This is needed because user hooks (like this one) often load before
 * installable hooks, meaning the installable hooks haven't had a chance
 * to write to sails.config.redboxHookModels yet.
 */
function findAndRegisterHookModels(sails) {
  if (!sails.config.redboxHookModels) {
    sails.config.redboxHookModels = {};
  }

  const appPath = sails.config.appPath || process.cwd();
  let packageJson;
  try {
    packageJson = require(path.join(appPath, 'package.json'));
  } catch (err) {
    sails.log.warn('redbox-core-loader: Could not load package.json to find hooks', err);
    return;
  }

  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };

  for (const depName of Object.keys(allDependencies)) {
    try {
      // Resolve the package.json of the dependency to check its configuration
      // We use require.resolve to find the path, ensuring we get the correct installed version
      // The paths option ensures we look from the app root
      const depPackageJsonPath = require.resolve(`${depName}/package.json`, { paths: [appPath] });
      const depPackageJson = require(depPackageJsonPath);

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
    } catch (err) {
      // Ignore dependencies that can't be resolved or loaded (they might not be installed or not be hooks)
      // sails.log.silly(`redbox-core-loader: Could not check dependency ${depName}: ${err.message}`);
    }
  }
}

/**
 * Dynamically finds and registers policies from other redbox hooks.
 * Similar to findAndRegisterHookModels, but for policies.
 * Hooks should export a 'registerRedboxPolicies' function and have
 * 'hasPolicies: true' in their package.json sails configuration.
 */
function findAndRegisterHookPolicies(sails) {
  if (!sails.config.redboxHookPolicies) {
    sails.config.redboxHookPolicies = {};
  }

  const appPath = sails.config.appPath || process.cwd();
  let packageJson;
  try {
    packageJson = require(path.join(appPath, 'package.json'));
  } catch (err) {
    sails.log.warn('redbox-core-loader: Could not load package.json to find hooks with policies', err);
    return;
  }

  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };

  for (const depName of Object.keys(allDependencies)) {
    try {
      const depPackageJsonPath = require.resolve(`${depName}/package.json`, { paths: [appPath] });
      const depPackageJson = require(depPackageJsonPath);

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
  }
}

/**
 * Generates policy shim files in api/policies/ from the Policies object
 * exported by @researchdatabox/redbox-core-types and from hook registrations.
 * 
 * Unlike models, policies are simple middleware functions, so we can directly
 * require and re-export them without needing complex shims.
 */
function generatePolicyShims(sails, policiesDir) {
  // Get hook-registered policies from sails.config
  const hookPolicies = sails.config.redboxHookPolicies || {};

  // Collect all policy names from both sources
  const corePolicyNames = Object.keys(Policies);
  const hookPolicyNames = Object.keys(hookPolicies);
  const allPolicyNames = new Set([...corePolicyNames, ...hookPolicyNames]);

  let generated = 0;
  let skipped = 0;
  let fromHooks = 0;

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
      fs.writeFileSync(filePath, content, 'utf8');
      generated++;
      fromHooks++;
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
      fs.writeFileSync(filePath, content, 'utf8');
      generated++;
    }
  }

  return { generated, skipped, fromHooks };
}

function generateModelShims(sails, modelsDir) {
  // Get hook-registered models from sails.config
  const hookModels = sails.config.redboxHookModels || {};

  // First, collect all model names from both sources
  const coreModelNames = Object.keys(WaterlineModels);
  const hookModelNames = Object.keys(hookModels);
  const allModelNames = new Set([...coreModelNames, ...hookModelNames]);

  let generated = 0;
  let skipped = 0;
  let fromHooks = 0;

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
      fs.writeFileSync(filePath, content, 'utf8');
      generated++;
      fromHooks++;
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
      fs.writeFileSync(filePath, content, 'utf8');
      generated++;
    }
  }

  return { generated, skipped, fromHooks };
}

function generateMiddlewareShims(sails, middlewareDir) {
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
    fs.writeFileSync(filePath, content, 'utf8');
    generated++;
  }
  return { generated };
}

function generateResponseShims(sails, responsesDir) {
  let generated = 0;
  const responseNames = Object.keys(Responses || {});

  for (const name of responseNames) {
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
    fs.writeFileSync(filePath, content, 'utf8');
    generated++;
  }
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
      if (!sails.config[this.configKey].enabled) {
        sails.log.verbose('redbox-core-loader: Disabled via config');
        return;
      }

      const coreModelCount = Object.keys(WaterlineModels || {}).length;
      const corePolicyCount = Object.keys(Policies || {}).length;
      sails.log.verbose(`redbox-core-loader: ${coreModelCount} core models available from @researchdatabox/redbox-core-types`);
      sails.log.verbose(`redbox-core-loader: ${corePolicyCount} core policies available from @researchdatabox/redbox-core-types`);

      // Generate model shims before ORM loads them
      // Note: At configure time, other hooks may not have registered their models yet,
      // so we generate core models now and hook models will be handled by the hook's own mechanism
      const modelsDir = path.resolve(__dirname, '../../models');
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }

      // Proactively find models from other hooks to avoid load order issues
      findAndRegisterHookModels(sails);

      const modelStats = generateModelShims(sails, modelsDir);
      sails.log.verbose(`redbox-core-loader: Generated ${modelStats.generated} model shims (${modelStats.fromHooks} from hooks), skipped ${modelStats.skipped} external`);

      // Generate policy shims before the policies hook loads them
      const policiesDir = path.resolve(__dirname, '../../policies');
      if (!fs.existsSync(policiesDir)) {
        fs.mkdirSync(policiesDir, { recursive: true });
      }

      // Proactively find policies from other hooks
      findAndRegisterHookPolicies(sails);

      const policyStats = generatePolicyShims(sails, policiesDir);
      sails.log.verbose(`redbox-core-loader: Generated ${policyStats.generated} policy shims (${policyStats.fromHooks} from hooks), skipped ${policyStats.skipped} external`);

      // Generate middleware shims
      const middlewareDir = path.resolve(__dirname, '../../middleware');
      if (!fs.existsSync(middlewareDir)) {
        fs.mkdirSync(middlewareDir, { recursive: true });
      }
      const middlewareStats = generateMiddlewareShims(sails, middlewareDir);
      sails.log.verbose(`redbox-core-loader: Generated ${middlewareStats.generated} middleware shims`);

      // Generate response shims
      const responsesDir = path.resolve(__dirname, '../../responses');
      if (!fs.existsSync(responsesDir)) {
        fs.mkdirSync(responsesDir, { recursive: true });
      }
      const responseStats = generateResponseShims(sails, responsesDir);
      sails.log.verbose(`redbox-core-loader: Generated ${responseStats.generated} response shims`);
    },

    initialize: function (done) {
      sails.log.verbose('redbox-core-loader: Initialization complete');
      return done();
    }
  };
};

