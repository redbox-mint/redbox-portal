# Configuration and Customisation Guide

## Managing your customisations

Much like in ReDBox 1.8+, it is recommended that you keep your configuration changes in its own repository and overlay them as part of the deployment process.

See the sample customisation repository for an example.

## Managing portal configuration

The ReDBox Portal is built on the [SailsJS framework](https://sailsjs.com/) and therefore takes advantage of the highly extensible configuration framework provided.
Please see the [SailsJS documentation](https://sailsjs.com/documentation/reference/configuration) for more information on its structure and configuration options.

There are several configuration items that are specific to the ReDBox Portal:
1. `record.js` manages configuration around record management and the portal's interaction with the ReDBox and Mint services
2. `auth.js` manages configuration around authorisation and authentication
3. [emailnotification.js](https://github.com/redbox-mint/redbox-portal/wiki/Configuring-Email-Notifications) manages configuration of email notifications
4. [form.js](https://github.com/redbox-mint/redbox-portal/wiki/Configuring-Record-Forms) manages form configuration

## Configuration Defaults (redbox-core-types)

All core configuration defaults are now centralized in the `@researchdatabox/redbox-core-types` package:

- **Location**: `packages/redbox-core-types/src/config/`
- **65+ config modules** define TypeScript interfaces and default values
- **Shim generation**: The [Redbox Loader](Redbox-Loader) generates `config/*.js` shims that export these defaults

This means:
- Core defaults are type-safe and documented in TypeScript
- Changes to defaults are made in `redbox-core-types`
- Environment or deployment-specific overrides still work via `config/env/*.js`

### Example Config Structure

```typescript
// packages/redbox-core-types/src/config/appmode.config.ts
export interface AppModeConfig {
    bootstrapAlways: boolean;
    bootstrapOnce?: boolean;
}

export const appmode: AppModeConfig = {
    bootstrapAlways: true
};
```

The loader generates a shim:

```javascript
// config/appmode.js (auto-generated)
const { Config } = require('@researchdatabox/redbox-core-types');
module.exports.appmode = Config.appmode;
```

## Hook-Provided Configuration

Hooks can provide additional configuration by declaring `hasConfig: true` in their `package.json` and exporting a `registerRedboxConfig()` function:

```json
{
    "name": "my-redbox-hook",
    "sails": {
        "hasConfig": true
    }
}
```

```javascript
// Hook's index.js
module.exports.registerRedboxConfig = function() {
    return {
        record: {
            customSetting: 'value'
        }
    };
};
```

Hook configurations are merged with core defaults in alphabetical order by package name.

## Environment variables

It is possible to use environment variables to modify configuration, this is particularly useful when running the portal in a containerised environment such as Docker. Please see [Sails configuration documentation for more information](https://sailsjs.com/documentation/concepts/configuration#?setting-sailsconfig-values-directly-using-environment-variables).

### Environment specific files

You may override standard configuration item for a particular environment (e.g development, test and production) by creating or modifying the environment-specific config file in the location `config/env/<environment-name>.js`. You can specify the environment by setting the `NODE_ENV` environment variable.

Please see the [Sails configuration documentation](https://sailsjs.com/documentation/concepts/configuration#?environmentspecific-files-config-env) for more information.

## Debugging Configuration

To debug which layer is providing configuration values, enable config snapshots:

```bash
EXPORT_BOOTSTRAP_CONFIG_JSON=true npm start
```

This generates two files in `support/debug-config/`:

| File | Description |
|---|---|
| `pre-lift-config.json` | Config from core-types + hooks BEFORE Sails merges environment config |
| `post-bootstrap-config.json` | Final sails.config AFTER environment config and bootstrap |

Compare these files to identify where a setting is being overwritten.

## See Also

- [Redbox Core Types](Redbox-Core-Types) - Where config defaults are defined
- [Redbox Loader](Redbox-Loader) - How config shims are generated
- [Using a Sails Hook to customise ReDBox](Using-a-Sails-Hook-to-customise-ReDBox) - Adding config via hooks
