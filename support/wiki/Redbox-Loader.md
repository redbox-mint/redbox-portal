# Redbox Loader

The loader exported by `@researchdatabox/redbox-core` generates shim files for models, services, policies, middleware, responses, controllers, and configuration BEFORE Sails.js lifts. This eliminates race conditions with hook loading order.

## Overview

When ReDBox Portal starts, the loader runs **before** `sails.lift()` to:
1. Scan dependencies for registered hooks
2. Generate shim files that bridge Sails.js to `@researchdatabox/redbox-core`
3. Ensure all components are in place before the ORM, services, and policies load

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Start                        │
├─────────────────────────────────────────────────────────────┤
│  1. generateAllShims() from @researchdatabox/redbox-core    │
│     ├── Scan package.json dependencies for hooks            │
│     ├── Generate api/models/*.js shims                      │
│     ├── Generate api/services/*.js shims                    │
│     ├── Generate api/policies/*.js shims                    │
│     ├── Generate api/middleware/*.js shims                  │
│     ├── Generate api/responses/*.js shims                   │
│     ├── Generate api/controllers/*.js shims                 │
│     ├── Generate api/form-config/*.js shims                 │
│     ├── Generate config/*.js shims                          │
│     └── Generate config/bootstrap.js shim                   │
├─────────────────────────────────────────────────────────────┤
│  2. sails.lift()                                            │
│     ├── Sails loads generated shim files                    │
│     ├── ORM initializes with model definitions              │
│     ├── Services become available as global sails services  │
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
const { WaterlineModels } = require('@researchdatabox/redbox-core');
module.exports = { ...WaterlineModels['User'], globalId: 'User' };
```

### Policy Shims (`api/policies/`)

```javascript
// Example: api/policies/isAuthenticated.js
const { Policies } = require('@researchdatabox/redbox-core');
module.exports = Policies['isAuthenticated'];
```

### Service Shims (`api/services/`)

Service shims expose the core services from `@researchdatabox/redbox-core` to Sails.js. These include business logic for records, workflows, users, integrations, and more.

```javascript
// Example: api/services/RecordsService.js
const { ServiceExports } = require('@researchdatabox/redbox-core');
module.exports = ServiceExports['RecordsService'];
```

Services are lazy-instantiated when first accessed, ensuring proper initialization order.

**Generated Services:**

| Service | Description |
|---|---|
| `RecordsService` | Core record CRUD operations |
| `UsersService` | User account management |
| `FormsService` | Dynamic form handling |
| `WorkflowStepsService` | Workflow state transitions |
| `SolrSearchService` | Search indexing |
| `EmailService` | Email delivery |
| `CacheService` | In-memory and database caching |
| ... | 32 additional services |

See [Redbox Core Types - Services](redbox-core#core-services) for the complete service list.

### Controller Shims (`api/controllers/`)

Controller shims expose controllers from `@researchdatabox/redbox-core` to Sails.js. Webservice controllers are generated under `api/controllers/webservice/`.

```javascript
// Example: api/controllers/RecordController.js
const { ControllerExports } = require('@researchdatabox/redbox-core');
module.exports = ControllerExports['RecordController'];
```

```javascript
// Example: api/controllers/webservice/RecordController.js
const { WebserviceControllerExports } = require('@researchdatabox/redbox-core');
module.exports = WebserviceControllerExports['RecordController'];
```

Controller shim generation uses `ControllerNames` and `WebserviceControllerNames` to avoid instantiating controllers during shim creation.

### Config Shims (`config/`)

```javascript
// Example: config/appmode.js
const { Config } = require('@researchdatabox/redbox-core');
module.exports.appmode = Config.appmode;
```

Config shims also merge hook-provided configurations according to the installation's root `package.json` `hookLoadPriority` list. The first listed hook has the highest precedence, so generated config shims process lower-precedence hooks first and higher-precedence hooks later. If `hookLoadPriority` is missing, the loader keeps the previous package-name fallback behavior.

### Form-Config Shims (`api/form-config/`)

Form-config shims expose typed form definitions from core-types and hooks. The
generated `api/form-config/index.js` provides a map compatible with legacy
`config/form.js` consumers.

```javascript
// Example: api/form-config/default-1.0-draft.js
const { FormConfigExports } = require('@researchdatabox/redbox-core');
module.exports = FormConfigExports['default-1.0-draft'];
```

```javascript
// Example: api/form-config/index.js
const forms = {
    'default-1.0-draft': require('./default-1.0-draft.js'),
};

module.exports = { forms };
```

`LOAD_DEFAULT_FORMS=true` includes core + hook forms in the registry. When
`LOAD_DEFAULT_FORMS` is false or unset, only hook forms are included.

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
        "hasServices": true,
        "hasControllers": true,
        "hasBootstrap": true,
        "hasConfig": true,
        "hasFormConfigs": true
    }
}
```

Hooks must export registration functions:

| Flag | Required Export | Description |
|---|---|---|
| `hasModels` | `registerRedboxModels()` | Returns model definitions object |
| `hasPolicies` | `registerRedboxPolicies()` | Returns policies object |
| `hasServices` | `registerRedboxServices()` | Returns services object (hook services take precedence over core) |
| `hasControllers` | `registerRedboxControllers()` / `registerRedboxWebserviceControllers()` | Returns controller export objects (hook controllers take precedence) |
| `hasBootstrap` | `registerRedboxBootstrap()` | Returns async bootstrap function |
| `hasApiRoutes` | `registerHookApiRoutes()` | Returns an array of contract-first API route definitions |
| `hasConfig` | `registerRedboxConfig()` | Returns config object to merge |
| `hasFormConfigs` | `registerRedboxFormConfigs()` | Returns form config registry |

### Hook Load Priority

Installations can define hook precedence in the root portal `package.json`:

```json
{
    "hookLoadPriority": [
        "redbox-hook-jcu",
        "sails-hook-redbox-pdfgen"
    ]
}
```

The first listed hook has the highest precedence. Listed hooks override unlisted hooks, and unlisted hooks keep the previous deterministic package-name fallback. Merge and shim generation paths process hooks from lowest to highest precedence because those registries are last-write-wins. Direct lookup paths such as hook views and assets search highest precedence first.

Migrations are collected in hook processing order, but final migration execution remains sorted by migration name/timestamp.

### Service Override Precedence

When a hook provides a service with the same name as a core service, the **hook service takes precedence**. This allows hooks to override or extend core functionality:

```javascript
// Hook providing a custom RecordsService
module.exports.registerRedboxServices = function() {
    return {
        RecordsService: new MyCustomRecordsService().exports()
    };
};
```

The generated shim will point to the hook's implementation instead of core-types.

### Controller Override Precedence

When a hook provides a controller with the same name as a core controller, the hook controller takes precedence. This applies independently to API and webservice controllers.

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
const { generateAllShims } = require('@researchdatabox/redbox-core');

(async () => {
    await generateAllShims(__dirname);
    sails.lift(rc('sails'));
})();
```

## See Also

- [Redbox Core Types](redbox-core) - Source of models, policies, and config
- [Controllers Architecture](Controllers-Architecture) - Controller exports, shims, and lifecycle
- [Using a Sails Hook to customise ReDBox](Using-a-Sails-Hook-to-customise-ReDBox) - Creating hooks
