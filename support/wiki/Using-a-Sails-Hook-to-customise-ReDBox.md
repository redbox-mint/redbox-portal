## Using a Sails hook to customise ReDBox

To allow us to make customisations to a ReDBox instance, we take advantage of the [sails installable hook](https://sailsjs.com/documentation/concepts/extending-sails/hooks) feature.
This allows us to package our changes as an NPM package and using npm install, 
have them applied to the instance during the lifting process.

### Getting Started with TypeScript

The recommended way to develop hooks is using the [Redbox Hook Kit](Redbox-Hook-Kit):

```bash
# Initialize a new hook project
npx @researchdatabox/redbox-hook-kit init

# Install dependencies
npm install --save-dev @researchdatabox/redbox-hook-kit
npm install @researchdatabox/redbox-core-types

# Build TypeScript
npm run build
```

### Development

A code project is setup in Bitbucket that contains the hook code.
This should be of the format `redbox-hook-[project name]`, 
where `[project-name]` is replaced with the project, feature, or client name.

Each hook contains a `docker-compose.yml` intended for development.
It loads the customised container (i.e. with hook installed) and 
volume mounts the local code so that you can make changes.

For example:

```yaml
services:
  rbportal:
    image: qcifengineering/redbox-portal:develop
    volumes:
      - "../../:/opt/redbox-portal/node_modules/redbox-hook-[project-name]"
```

To run the app use the `runForDev.sh` script or `docker-compose -f support/development/docker-compose.yml up`.

### Hook Capabilities

Hooks can provide various components to ReDBox by declaring capabilities in `package.json`. The [Redbox Loader](Redbox-Loader) discovers these flags and generates appropriate shims.

#### package.json Configuration

```json
{
    "name": "redbox-hook-myproject",
    "sails": {
        "hasModels": true,
        "hasPolicies": true,
        "hasServices": true,
        "hasControllers": true,
        "hasBootstrap": true,
        "hasConfig": true
    }
}
```

#### Required Export Functions

Each capability flag requires a corresponding export function:

| Flag | Export Function | Returns |
|---|---|---|
| `hasModels` | `registerRedboxModels()` | Object of Waterline model definitions |
| `hasPolicies` | `registerRedboxPolicies()` | Object of policy functions |
| `hasServices` | `registerRedboxServices()` | Object of service exports (can override core services) |
| `hasControllers` | `registerRedboxControllers()` / `registerRedboxWebserviceControllers()` | Object of controller exports (can override core controllers) |
| `hasBootstrap` | `registerRedboxBootstrap()` | Async function to run at startup |
| `hasConfig` | `registerRedboxConfig()` | Configuration object to merge |

#### Example: Providing Models

```javascript
module.exports.registerRedboxModels = function() {
    return {
        MyCustomModel: {
            attributes: {
                name: { type: 'string', required: true },
                value: { type: 'json' }
            }
        }
    };
};
```

#### Example: Providing Policies

```javascript
module.exports.registerRedboxPolicies = function() {
    return {
        myCustomPolicy: function(req, res, next) {
            // Policy logic
            return next();
        }
    };
};
```

#### Example: Providing Services

Hooks can provide custom services or override core services. Hook services take precedence over core services with the same name.

**TypeScript Example (Recommended):**

```typescript
import { Services as services } from '@researchdatabox/redbox-core-types';

export module Services {
    export class MyCustomService extends services.Core.Service {
        protected _exportedMethods: any = ['doSomething', 'doSomethingElse'];

        public doSomething(param: string): Observable<any> {
            // Custom business logic
            return of({ result: param });
        }

        public doSomethingElse(): void {
            sails.log.info('Custom service method called');
        }
    }
}

// In your hook's index.ts or main export file:
module.exports.registerRedboxServices = function() {
    return {
        MyCustomService: new Services.MyCustomService().exports()
    };
};
```

**Overriding a Core Service:**

```typescript
// Override RecordsService to add custom behavior
import { RecordsService } from '@researchdatabox/redbox-core-types';

export module Services {
    export class CustomRecordsService extends RecordsService.Services.Records {
        protected _exportedMethods: any = [
            ...super._exportedMethods,
            'myCustomMethod'
        ];

        public myCustomMethod(oid: string): Observable<any> {
            // Custom record handling
            return this.getMeta(oid);
        }
    }
}

module.exports.registerRedboxServices = function() {
    return {
        RecordsService: new Services.CustomRecordsService().exports()
    };
};
```

#### Example: Providing Controllers

Hooks can provide API controllers or webservice controllers. Hook controllers take precedence over core controllers with the same name.

```typescript
import { Controllers as controllers } from '@researchdatabox/redbox-core-types';

export module Controllers {
    export class MyController extends controllers.Core.Controller {
        protected _exportedMethods: any = ['index'];

        public index(req: any, res: any) {
            return res.json({ ok: true });
        }
    }
}

module.exports.registerRedboxControllers = function() {
    return {
        MyController: new Controllers.MyController().exports()
    };
};
```

```typescript
module.exports.registerRedboxWebserviceControllers = function() {
    return {
        MyWebserviceController: new Controllers.MyWebserviceController().exports()
    };
};
```

#### Example: Providing Bootstrap

```javascript
module.exports.registerRedboxBootstrap = function() {
    return async function() {
        // Bootstrap logic runs after coreBootstrap()
        console.log('My hook bootstrap running...');
    };
};
```

#### Example: Providing Config

```javascript
module.exports.registerRedboxConfig = function() {
    return {
        record: {
            customFeature: {
                enabled: true
            }
        }
    };
};
```

### Form Configuration changes

Form configuration changes are kept in the `form-config` directory.
Files are loaded using require and merged using `lodash` merge to update the form configuration.

### Sails Configuration Changes

Sails configuration changes are kept in the `config` directory.
Files are loaded using require and merged using `lodash` merge to update the form configuration.

For hooks using the new `hasConfig` capability, configuration can also be provided programmatically via `registerRedboxConfig()`.

### Asset and View Changes

Assets and Views are kept in the `assets` and `views` directories.
These files are copied into `/opt/redbox-portal/assets` and `/opt/redbox-portal/views` respectively as part of the startup.

## See Also

- [Redbox Hook Kit](Redbox-Hook-Kit) - TypeScript development toolkit
- [Redbox Core Types](Redbox-Core-Types) - Core types and base classes
- [Redbox Loader](Redbox-Loader) - How hooks are discovered and loaded
