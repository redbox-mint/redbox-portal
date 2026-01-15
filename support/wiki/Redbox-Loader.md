# Redbox Loader

The `redbox-loader.js` module generates shim files for models, policies, middleware, responses, and configuration BEFORE Sails.js lifts. This eliminates race conditions with hook loading order.

## Overview

When ReDBox Portal starts, the loader runs **before** `sails.lift()` to:
1. Scan dependencies for registered hooks
2. Generate shim files that bridge Sails.js to `@researchdatabox/redbox-core-types`
3. Ensure all components are in place before the ORM and policies load

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Start                        │
├─────────────────────────────────────────────────────────────┤
│  1. redbox-loader.generateAllShims()                        │
│     ├── Scan package.json dependencies for hooks            │
│     ├── Generate api/models/*.js shims                      │
│     ├── Generate api/policies/*.js shims                    │
│     ├── Generate api/middleware/*.js shims                  │
│     ├── Generate api/responses/*.js shims                   │
│     ├── Generate config/*.js shims                          │
│     └── Generate config/bootstrap.js shim                   │
├─────────────────────────────────────────────────────────────┤
│  2. sails.lift()                                            │
│     ├── Sails loads generated shim files                    │
│     ├── ORM initializes with model definitions              │
│     └── Bootstrap executes coreBootstrap()                  │
└─────────────────────────────────────────────────────────────┘
```

## Regeneration Triggers

Shims are regenerated when (in priority order):

| Trigger | Description |
|---|---|
| `NODE_ENV !== 'production'` | Always regenerate in development |
| `.regenerate-shims` file exists | Marker file triggers regeneration, then is deleted |
| `REGENERATE_SHIMS=true` env var | Force regeneration via environment variable |
| Empty shim directory | If `api/models/`, `api/policies/`, etc. are empty |

In production mode, shims are cached unless explicitly triggered.

## What Gets Generated

### Model Shims (`api/models/`)

```javascript
// Example: api/models/User.js
const { WaterlineModels } = require('@researchdatabox/redbox-core-types');
module.exports = { ...WaterlineModels['User'], globalId: 'User' };
```

### Policy Shims (`api/policies/`)

```javascript
// Example: api/policies/isAuthenticated.js
const { Policies } = require('@researchdatabox/redbox-core-types');
module.exports = Policies['isAuthenticated'];
```

### Config Shims (`config/`)

```javascript
// Example: config/appmode.js
const { Config } = require('@researchdatabox/redbox-core-types');
module.exports.appmode = Config.appmode;
```

Config shims also merge hook-provided configurations in alphabetical order.

### Bootstrap Shim (`config/bootstrap.js`)

Calls `coreBootstrap()` and any hook-provided bootstrap functions.

## Hook Discovery

The loader scans `package.json` dependencies for hooks that declare capabilities:

```json
{
    "name": "my-redbox-hook",
    "sails": {
        "hasModels": true,
        "hasPolicies": true,
        "hasBootstrap": true,
        "hasConfig": true
    }
}
```

Hooks must export registration functions:

| Flag | Required Export |
|---|---|
| `hasModels` | `registerRedboxModels()` → returns model definitions object |
| `hasPolicies` | `registerRedboxPolicies()` → returns policies object |
| `hasBootstrap` | `registerRedboxBootstrap()` → returns async bootstrap function |
| `hasConfig` | `registerRedboxConfig()` → returns config object to merge |

## Debugging

### Verbose Logging

```bash
SHIM_VERBOSE=true npm start
```

Outputs detailed information about shim generation timing and counts.

### Config Snapshots

```bash
EXPORT_BOOTSTRAP_CONFIG_JSON=true npm start
```

Generates two config snapshots in `support/debug-config/`:

| File | Description |
|---|---|
| `pre-lift-config.json` | Config from core-types + hooks BEFORE Sails merges environment config |
| `post-bootstrap-config.json` | Final sails.config AFTER Sails loads environment config and runs bootstrap |

This helps debug which layer is setting (or overwriting) configuration values.

## Usage

The loader is called in `app.js` before Sails lifts:

```javascript
const redboxLoader = require('./redbox-loader');

(async () => {
    await redboxLoader.generateAllShims(__dirname);
    sails.lift(rc('sails'));
})();
```

## See Also

- [Redbox Core Types](Redbox-Core-Types) - Source of models, policies, and config
- [Using a Sails Hook to customise ReDBox](Using-a-Sails-Hook-to-customise-ReDBox) - Creating hooks
