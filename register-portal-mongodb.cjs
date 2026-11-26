const { createRequire, registerHooks } = require('node:module');
const { pathToFileURL } = require('node:url');

const resolverURL = pathToFileURL(__filename).href;
const portalRoot = new URL('.', resolverURL).href;
const bson = createRequire(require.resolve('mongodb')).resolve('bson');

// Linked packages can have standalone installs that shadow the portal driver.
// Use the same BSON entry for import and require so both share its constructors.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const { parentURL } = context;
    if (parentURL?.startsWith(portalRoot) && parentURL !== resolverURL) {
      if (specifier === 'mongodb' || specifier.startsWith('mongodb/')) {
        return nextResolve(require.resolve(specifier), context);
      }
      if (specifier === 'bson') {
        return nextResolve(bson, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
