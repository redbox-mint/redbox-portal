# Services Architecture

This document provides a deep dive into the ReDBox Portal service layer architecture, including how services are defined, loaded, and how to extend or override them in hooks.

## Overview

ReDBox Portal uses a service-oriented architecture where business logic is encapsulated in TypeScript services. All services are centralized in the `@researchdatabox/redbox-core-types` package and loaded into Sails.js via the [Redbox Loader](Redbox-Loader) shim generation system.

## Service Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Service Lifecycle                                │
├─────────────────────────────────────────────────────────────────────┤
│  1. Build Time: TypeScript services compiled to JavaScript          │
│     └── packages/redbox-core-types/src/services/*.ts                │
│                                                                     │
│  2. Pre-Lift: redbox-loader generates service shims                 │
│     └── ServiceExports → api/services/*.js shims                    │
│                                                                     │
│  3. Sails Lift: Services loaded as Sails globals                    │
│     └── Available as sails.services.RecordsService, etc.            │
│                                                                     │
│  4. Bootstrap: Service bootstrap() methods called                   │
│     └── Initialization, cache warming, etc.                         │
│                                                                     │
│  5. Runtime: Services available globally                            │
│     └── RecordsService.getMeta(oid), UsersService.findByUsername()  │
└─────────────────────────────────────────────────────────────────────┘
```

## Base Service Class

All services extend `Services.Core.Service` from `CoreService.ts`:

```typescript
import { Services as services } from '@researchdatabox/redbox-core-types';

export module Services {
    export class MyService extends services.Core.Service {
        // Methods to expose to Sails.js
        protected _exportedMethods: any = [
            'bootstrap',
            'myMethod',
            'anotherMethod'
        ];

        // Initialization - called during bootstrap
        public async bootstrap() {
            // Setup code
        }

        // Business logic methods
        public myMethod(param: string): Observable<any> {
            return of({ result: param });
        }
    }
}
```

### Key Base Class Features

| Feature | Description |
|---|---|
| `_exportedMethods` | Array of method names to expose via `exports()` |
| `exports()` | Returns object with bound methods for Sails.js |
| `logger` | Access to sails.log or fallback console logger |
| `getObservable()` | Wraps Waterline promises in RxJS Observables |

## ServiceExports Object

The `ServiceExports` object in `src/services/index.ts` provides lazy-instantiated services:

```typescript
export const ServiceExports = {
    get RecordsService() {
        return getOrCreateService('RecordsService', 
            () => new RecordsServiceModule.Services.Records().exports()
        );
    },
    // ... 38 more services
};
```

**Lazy instantiation** ensures:
- Services aren't created until first access
- Proper initialization order is maintained
- Shim generation can inspect available services without side effects

## Service Categories

### Records & Data Services

| Service | Purpose |
|---|---|
| `RecordsService` | Core CRUD operations for research data records |
| `RecordTypesService` | Manages record type definitions and configurations |
| `FormsService` | Dynamic form loading and management |
| `FormRecordConsistencyService` | Validates form-record consistency |

### Workflow Services

| Service | Purpose |
|---|---|
| `WorkflowStepsService` | Manages workflow step definitions and transitions |
| `TriggerService` | Executes workflow triggers on state changes |

### User & Authorization Services

| Service | Purpose |
|---|---|
| `UsersService` | User account management (create, update, find) |
| `RolesService` | Role definitions and permission management |

### Search & Caching Services

| Service | Purpose |
|---|---|
| `SolrSearchService` | Solr search index operations |
| `CacheService` | In-memory (node-cache) and MongoDB caching |
| `NamedQueryService` | Saved/named query execution |

### Integration Services

| Service | Purpose |
|---|---|
| `OrcidService` | ORCID identifier integration |
| `DoiService` | DataCite DOI registration and updates |
| `FigshareService` | Figshare repository integration |
| `RaidService` | RAiD (Research Activity Identifier) integration |
| `OniService` | Oni/OCFL repository integration |

### Workspace Services

| Service | Purpose |
|---|---|
| `WorkspaceService` | Research workspace management |
| `WorkspaceTypesService` | Workspace type definitions |
| `WorkspaceAsyncService` | Async workspace operations |

### Configuration Services

| Service | Purpose |
|---|---|
| `ConfigService` | Runtime configuration access |
| `AppConfigService` | Application-level configuration |
| `BrandingService` | Multi-tenant branding management |
| `BrandingLogoService` | Brand logo handling |

### Template & I18n Services

| Service | Purpose |
|---|---|
| `TemplateService` | EJS template rendering |
| `TranslationService` | Multi-language translation |
| `I18nEntriesService` | Translation entry management |

### Utility Services

| Service | Purpose |
|---|---|
| `ViewUtilsService` | View helper utilities |
| `PathRulesService` | URL path rule resolution |
| `DomSanitizerService` | SVG content sanitization |
| `ContrastService` | Color contrast calculations |
| `SassCompilerService` | SASS/SCSS compilation |
| `VocabService` | Controlled vocabulary lookups |
| `NavigationService` | Menu and navigation building |

### Background Job Services

| Service | Purpose |
|---|---|
| `AgendaQueueService` | Agenda.js job queue management |
| `AsynchsService` | Async operation handling |

### Reporting Services

| Service | Purpose |
|---|---|
| `ReportsService` | Report generation |
| `DashboardTypesService` | Dashboard type definitions |

### Other Services

| Service | Purpose |
|---|---|
| `EmailService` | Email delivery via nodemailer |
| `RDMPService` | Research Data Management Plans |

## Using Services in Controllers

Services are available as Sails.js globals after lift:

```typescript
import { Controllers as controllers } from '@researchdatabox/redbox-core-types';

declare var sails;
declare var RecordsService;
declare var UsersService;

export module Controllers {
    export class MyController extends controllers.Core.Controller {
        protected _exportedMethods: any = ['getRecord'];

        public async getRecord(req, res) {
            const oid = req.param('oid');
            
            // Use services directly
            RecordsService.getMeta(oid).subscribe(
                record => res.json(record),
                error => res.serverError(error)
            );
        }
    }
}
```

See [Controllers Architecture](Controllers-Architecture) for controller locations, shim generation, and `init()` usage.

## Overriding Services in Hooks

Hooks can provide custom services that override core services. Hook services take precedence.

### Step 1: Declare Service Capability

```json
{
    "name": "redbox-hook-myproject",
    "sails": {
        "hasServices": true
    }
}
```

### Step 2: Create Custom Service

```typescript
// typescript/services/CustomRecordsService.ts
import { Services as services } from '@researchdatabox/redbox-core-types';
import { RecordsService } from '@researchdatabox/redbox-core-types';

export module Services {
    export class CustomRecords extends RecordsService.Services.Records {
        protected _exportedMethods: any = [
            ...super._exportedMethods,
            'customMethod'
        ];

        // Override existing method
        public getMeta(oid: string): Observable<any> {
            sails.log.info(`Custom getMeta called for: ${oid}`);
            return super.getMeta(oid);
        }

        // Add new method
        public customMethod(param: string): Observable<any> {
            return of({ custom: param });
        }
    }
}
```

### Step 3: Export Service Registration

```typescript
// index.ts
import { Services } from './typescript/services/CustomRecordsService';

module.exports.registerRedboxServices = function() {
    return {
        RecordsService: new Services.CustomRecords().exports()
    };
};
```

### Step 4: Generated Shim

The loader generates a shim pointing to your hook:

```javascript
// api/services/RecordsService.js (generated)
module.exports = require('redbox-hook-myproject').ServiceExports['RecordsService'];
```

## Service Patterns

### RxJS Observable Pattern

Services use RxJS Observables for async operations:

```typescript
import { Observable, of, from } from 'rxjs';
import { mergeMap, map, catchError } from 'rxjs/operators';

public getRecordWithRelated(oid: string): Observable<any> {
    return this.getMeta(oid).pipe(
        mergeMap(record => {
            const relatedOid = record.metadata.relatedRecord;
            return relatedOid 
                ? this.getMeta(relatedOid).pipe(
                    map(related => ({ ...record, related }))
                  )
                : of(record);
        }),
        catchError(error => {
            sails.log.error(`Error getting record ${oid}:`, error);
            throw error;
        })
    );
}
```

### Waterline Model Access

Services access Waterline models via globals:

```typescript
declare var User: Model;
declare var Record: Model;

public async findUser(username: string): Promise<any> {
    return await User.findOne({ username });
}

// Or using the Observable wrapper from base class
public findUserObs(username: string): Observable<any> {
    return this.getObservable(User.findOne({ username }));
}
```

### Configuration Access

Services access configuration via `sails.config`:

```typescript
public getApiEndpoint(): string {
    return sails.config.api.endpoint || 'https://default.api.com';
}

public isFeatureEnabled(): boolean {
    return sails.config.features?.myFeature?.enabled === true;
}
```

## Testing Services

Services have comprehensive unit tests in `packages/redbox-core-types/test/services/`:

```typescript
// test/services/CacheService.test.ts
import { Services } from '../../src/services/CacheService';
import { setupTestEnvironment } from '../setup';

describe('CacheService', () => {
    let service: Services.Cache;

    beforeEach(() => {
        setupTestEnvironment();
        service = new Services.Cache();
    });

    it('should cache and retrieve values', async () => {
        await service.bootstrap();
        service.set('testKey', { data: 'value' });
        
        service.get('testKey').subscribe(result => {
            expect(result).toEqual({ data: 'value' });
        });
    });
});
```

Run tests:

```bash
cd packages/redbox-core-types
npm test
```

## Debugging Services

### Enable Verbose Logging

```bash
SHIM_VERBOSE=true npm start
```

### Service Bootstrap Order

Services are bootstrapped in the order they appear in `ServiceExports`. To debug bootstrap issues:

```typescript
public async bootstrap() {
    sails.log.info('MyService bootstrap starting...');
    // ... initialization
    sails.log.info('MyService bootstrap complete');
}
```

### Inspect Generated Shims

Check generated shims in `api/services/`:

```bash
cat api/services/RecordsService.js
```

## See Also

- [Redbox Core Types](Redbox-Core-Types) - Package documentation and service list
- [Redbox Loader](Redbox-Loader) - Shim generation system
- [Using a Sails Hook to customise ReDBox](Using-a-Sails-Hook-to-customise-ReDBox) - Hook development guide
- [Architecture Overview](Architecture-Overview) - System architecture
