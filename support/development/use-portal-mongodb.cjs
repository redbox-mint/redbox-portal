const { createRequire, registerHooks } = require('node:module');
const { pathToFileURL } = require('node:url');

const portalEntry = new URL('../../app.js', pathToFileURL(__filename)).href;
const localPackages = new URL('./packages/', portalEntry).href;
const mongodb = createRequire(portalEntry).resolve('mongodb');
const bson = createRequire(mongodb).resolve('bson');

// npm links the local packages into the portal, so their standalone installs
// would otherwise shadow the portal's driver when Node follows those links.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(localPackages)) {
      if (specifier === 'mongodb') return nextResolve(mongodb, context);
      if (specifier === 'bson') return nextResolve(bson, context);
    }
    return nextResolve(specifier, context);
  },
});
