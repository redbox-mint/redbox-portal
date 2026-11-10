# Services Architecture

This document provides a deep dive into the ReDBox Portal service layer architecture, including how services are defined, loaded, and how to extend or override them in hooks.

## Overview

ReDBox Portal uses a service-oriented architecture where business logic is encapsulated in TypeScript services. All services are centralized in the `@researchdatabox/redbox-core` package and loaded into Sails.js via the [Redbox Loader](Redbox-Loader) shim generation system.

## Service Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Service Lifecycle                                │
├─────────────────────────────────────────────────────────────────────┤
│  1. Build Time: TypeScript services compiled to JavaScript          │
│     └── packages/redbox-core/src/services/*.ts                │
│                                                                     │
│  2. Pre-Lift: the Redbox Loader generates service shims             │
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
import { Services as services } from '@researchdatabox/redbox-core';

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
| `updateChronicle(info, errors, level)` | Adds safe summaries to the current HTTP request; uses namespace logging for background work. See [Request Chronicle Logging](Request-Chronicle-Logging). |
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
| `UsersService` | User account management, effective-user resolution for linked aliases, disable/enable flows, and user-audit retrieval |
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
| `BrandingService` | Multi-tenant branding lifecycle coordinator (colour/typeface draft, preview, atomic publish/restore, version retention, Admin-state responses) |
| `BrandingLogoService` | Brand logo handling |
| `BrandingTypefaceService` | Brand typeface validation and storage boundary (WOFF2 structural inspection, variable rejection, SHA-256 content addressing, integrity checks, orphan reconciliation) |
| `BrandingThemeCssService` | Branding colour validation plus generated theme CSS, including fixed `@font-face` declarations and the internal brand font-family variable |

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
| `FormVocabularyService` | Form vocabulary lookups for named-query, external, and service-backed typeaheads |
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
import { Controllers as controllers } from '@researchdatabox/redbox-core';

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

## Record audit persistence

When `record.auditing.enabled` is `true` (or the string `"true"`), `RecordsService.auditRecord()` writes directly through the configured storage service's `createRecordAudit()` method. Effect retries short failures with exponential backoff and jitter, within one overall deadline. Healthy writes do not create Agenda jobs. Queue lookup remains optional during initialization; a queue is needed for durable recovery after a direct-write failure. Snapshots, redacted actors, actions, and event timestamps retain the existing audit format. Each new event has a stable `auditId`; the Mongo adapter uses it as the audit document's unique primary key, so concurrent attempts, late inserts, and redelivery produce one history entry.

| `record.auditing` setting | Default | Meaning |
| --- | --- | --- |
| `writeTimeoutMs` | `5000` | Overall direct-write deadline, including retries and permit waiting. Recovery enqueue has its own deadline of the same duration. |
| `maxConcurrentWrites` | `8` | Actual direct/recovery inserts in flight per service instance, including inserts whose callers have timed out. Enqueues have a separate limit of the same size. |
| `writeAttempts` | `3` | Total short attempts, from 1 to 10. |
| `retryDelayMs` | `100` | Initial exponential retry delay, with jitter. |
| `recordAuditRecoveryJobName` | `RecordsService-RecoverRecordAudit` | Failure-only job, separate from the legacy harvest audit backlog. Custom names also require a matching Agenda job definition. |

Numeric settings accept positive integer numbers; missing or invalid values use their defaults. Time settings are limited to 2147483647ms and concurrency to 1024. A timeout stops the caller's wait without cancelling the underlying Mongo or queue operation. Effect keeps an insert's concurrency permit until that operation actually settles; waiting callers time out without starting another insert. Both Mongo datastore defaults set `socketTimeoutMS` to 120000ms, allowing slow queries more time while still ending inactive connections and releasing those permits. This driver limit applies to all operations on those datastores, independently of the shorter audit caller deadline; keep it finite when overriding datastore configuration. For constrained connection pools, also set `waitQueueTimeoutMS` in each datastore connection URL (for example, `?waitQueueTimeoutMS=30000`); sails-mongo 2.1.2 accepts this driver option through the URL, but rejects it as a standalone datastore property. Agenda uses a separate Mongo client with finite 30000ms socket and pool-checkout limits; `agendaQueue.options.mongoOptions.socketTimeoutMS` and `waitQueueTimeoutMS` override these defaults (and the corresponding URI values). Keep these finite as well. Explicit storage and queue startup index commands disable socket and command execution limits so large index builds can finish. A failed required storage initialization leaves its collection handles unpublished, allowing a subsequent initialization attempt to retry. Socket timeout measures inactivity, not total execution time, and Mongo may retry a command before rejecting it. Recovery writes use a maximum 10-second deadline to stay below the configured 30-second Agenda lock lifetime. Mongo's primary-key uniqueness provides idempotency when multiple application processes deliver the same event. Custom storage adapters must also honour the `auditId` idempotency contract before enabling retries.

If direct attempts fail, return an unsuccessful response, or time out, `auditRecord()` retains the same serialized snapshot and event ID using an awaited Agenda enqueue. The `RecordsService-RecoverRecordAudit` worker retries transient failures with durable exponential backoff, from one second up to five minutes, until persistence succeeds. It runs even when new auditing is disabled. Invalid recovery identities, conflicting audit IDs, document validation failures and oversized/unserializable Mongo documents require operator correction: the worker disables the Mongo-backed job and stops automatic retries, retaining its original snapshot. Pending retries and disabled jobs are excluded from completed-job history cleanup. Storage adapters can classify permanent payload failures with `retryable: false`; unclassified failures remain retryable. The selected queue backend must retain pending deliveries across restarts; SQS deployments must configure and monitor a dead-letter queue because SQS cannot pause individual jobs. Permanent SQS failures remain unacknowledged for that backend's redrive policy.

Record and audit writes remain separate operations. Neither this fallback nor Effect makes the record save and audit write transactional. A process exit after the record save but before audit persistence or queue acceptance can still lose the event. If both storage and the queue backend are unavailable, no durable copy is guaranteed. The saved record operation remains successful. Deletion starts search removal before auditing and continues its hooks after the bounded direct-write and recovery-enqueue waits. A timed-out insert or enqueue can still complete later.

### Audit failure monitoring and recovery

Configure the deployment's log platform to alert on `record_audit_recovery_failed`, `record_audit_recovery_quarantined` and `record_audit_recovery_permanent_failure` immediately, and on repeated `record_audit_recovery_retry` events. These include `auditId`, `redboxOid`, `action`, and the error reason. `record_audit_write_failed` identifies an exhausted or timed-out direct write; `record_audit_recovery_queued` confirms backend acceptance and `record_audit_recovered` confirms successful delivery. Alert routing belongs to deployment configuration; the application emits these events without provisioning external alerts.

1. Correlate the failure by `auditId`. Check the audit collection for `_id: ObjectId(auditId)` and the configured queue for the same `data.auditId` before replaying: a timeout means the eventual outcome is unknown.
2. For queued events, restore storage/backend connectivity and verify the recovery job definition is enabled. The saved job retains the original snapshot, actor, action, and timestamp; automatic backoff resumes after restart. Check that `record_audit_recovered` appears and that the audit exists. Do not delete pending recovery jobs to clear an alert.
3. For a paused or dead-lettered delivery, inspect the retained payload and failure reason. Correct the cause before replaying, preserving `auditId` and `occurredAt` for valid events. For a Mongo-backed job, persist `job.enable().schedule(new Date()).save()` after correction; otherwise use the backend's normal redrive tools. An authorised maintenance console can replay that payload through `RecordsService.recoverRecordAudit({ attrs: { data: originalPayload } })`; repeated deliveries are safe with the Mongo adapter. Keep invalid original payloads for incident investigation rather than inventing replacement history.
4. If enqueue also failed, check for a late accepted job or insert first. If no durable payload exists, recover the original event from an authoritative upstream change log or backup. A current record snapshot cannot reconstruct past updates or a deleted actor. Record an incident/history gap when the original event cannot be recovered. The existing empty-history fallback can create an empty synthetic `created` entry; it does not recover the missing event and must not be treated as reconciliation.

The `RecordsService-StoreRecordAudit` Agenda job, `record.auditing.recordAuditJobName` setting, and `storeRecordAudit()` worker remain available to drain outstanding jobs after rollout. The worker accepts the existing `job.attrs.data` payload and legacy `job.attrs` fallback without rebuilding the snapshot or event time. It awaits storage and rejects on failure so Agenda can record the failed job. Disabling new audits does not prevent outstanding jobs from draining. No queued data is deleted or migrated by this change.

## User Management Notes

Recent user-management work extends `UsersService` beyond simple CRUD. It now also owns:

- linked-account resolution via `getEffectiveUser()`
- linked-account discovery and linking workflows
- effective disabled-state enrichment for users and aliases
- disable/enable actions with audit events
- normalized user-audit retrieval for the Manage Users UI

The corresponding admin-facing controller surface is documented on the **[User Management](https://github.com/redbox-mint/redbox-portal/wiki/User-Management)** page.

### User post-save hook completion and errors

`UsersService.triggerPostSaveTriggers(user, config, mode = 'onUpdate')` returns
`Promise<PromiseSettledResult<unknown>[]>`. Await it to obtain all hook outcomes
in configuration order. Every configured `hooks.<mode>.post` entry with a
non-null `function` runs independently; entries without a function are skipped.
An absent or non-array hook list produces `[]`.

Hooks receive `(user, options)` and may return a plain value, `undefined`, a
Promise/thenable, or an RxJS Observable. Observable hooks are awaited through
completion and return their last emitted value, or `undefined` if empty.
A rejected Promise, Observable error, synchronous throw, invalid function
expression, or expression resolving to a non-function produces a
`{ status: 'rejected', reason }` entry with the original error. Failures are
also logged. Other hooks continue and the aggregate fulfills only after all
hooks settle. Inspect rejected entries explicitly when failures matter:

```typescript
const outcomes = await users.triggerPostSaveTriggers(user, authConfig);
for (const outcome of outcomes) {
    if (outcome.status === 'rejected') {
        // Apply the caller's failure policy; the user has already been saved.
        handleHookFailure(outcome.reason);
    }
}
```

Previously this method returned `void` and discarded outcomes. Callers that
ignore the new return value can still do so; hook failures are handled and
logged without an unhandled rejection. Local, AAF, and OIDC login now await all
regular post hooks before completing authentication, including when pre hooks run.
OIDC account-creation calls explicitly select `onCreate` when invoking the runner.
Hook failures remain non-fatal to login and do not roll back a saved user.
Hooks still run concurrently; their return values do not replace the user or
feed the next hook. The sequential `postSync` chain starts after regular hooks
are launched, without waiting for regular hook completion. It remains a background chain and does not
hold the login callback. Its failures are logged and handled. This permits a
regular hook to depend on a `postSync` hook without introducing a dependency
cycle. OIDC creation selects `onCreate` for both groups.

Compatibility: login latency now includes post-hook execution. Observable hooks
previously used their first emission; they now wait for completion so late
errors are retained. Each regular hook now has an absolute deadline, measured
when its response is received, including Observable completion (emissions do not reset the deadline).
Configure `postHookTimeoutMs` on the selected auth provider object, for example
`auth.local.postHookTimeoutMs = 5000` in brand auth configuration. It applies to
both `onCreate.post` and `onUpdate.post`, independently for every hook; concurrent
hooks do not each add their timeout to login latency. The default is 30000ms.
Only positive integer numbers up to 2147483647 are accepted; omitted, zero,
negative, fractional, string, nonfinite or oversized values use the default.
The typed setting is shared by local, AAF and OIDC provider configurations.

Timeout produces a rejected outcome with an Error identifying the deadline;
other results remain ordered and hook failures/timeouts remain nonfatal to login.
Timers are cleared on settlement. Observable subscriptions are disposed on
settlement or timeout. Promises cannot be cancelled: their work may continue
after timeout, but late rejections remain handled. This deadline cannot interrupt
synchronous JavaScript that blocks the event loop. It does not apply to pre hooks
or `postSync`. Hooks should not depend on the login callback itself; such regular
hooks now time out rather than preventing login indefinitely.

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
import { Services as services } from '@researchdatabox/redbox-core';
import { RecordsService } from '@researchdatabox/redbox-core';

export module Services {
    export class CustomRecords extends RecordsService.Services.Records {
        protected _exportedMethods: any = [
            ...super._exportedMethods,
            'customMethod'
        ];

        // Override existing method
        public getMeta(oid: string): Observable<any> {
            this.updateChronicle({ recordsReadOid: oid });
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

### Branding extension seams

- `BrandingTypefaceService` is the font validation and storage boundary. Hook developers must not reimplement WOFF2 parsing or storage-key construction; call `inspectAndStoreFace`, `readFace`, `assertTypefaceAvailable`, or `reconcileAssets`.
- `BrandingService` owns the colour/typeface draft, preview, publication, restoration, version retention, and cache refresh. Controllers stay thin transport adapters: resolve the authenticated brand/actor, parse the request, call the service, and map typed errors.
- `BrandingThemeCssService.generate` never accepts a user-provided CSS family string; hook CSS still loads after the generated theme stylesheet and keeps override precedence.

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
            this.updateChronicle({ recordsReadOid: oid }, [error]);
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

### Storage adapter concurrency capability

A hook-provided storage adapter must explicitly declare the complete versioned
`recordConcurrency` capability before any record type can use strict concurrent
modification mode. Implement `getCapabilities()` using the version token
exported by `@researchdatabox/redbox-core`; an absent or unknown version is
treated as unsupported.

The adapter must implement native atomic active update/removal and conditional
tombstone update/removal, return the committed or removed revision/state, and
certify bounded non-application reasons. Supplied expected revisions are never
ignored. A driver throw or unrecognized result after dispatch remains
`unknown`; do not fall back to an OID-only Waterline write.

Verify those guarantees against the adapter's real datastore dialect before
declaring capability. The bundled Mongo integration tests and
migration/deployment notes are documented in
`packages/sails-hook-redbox-storage-mongo/README.md`.

## Testing Services

Services have comprehensive unit tests in `packages/redbox-core/test/services/`:

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
cd packages/redbox-core
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

- [Redbox Core Types](redbox-core) - Package documentation and service list
- [Redbox Loader](Redbox-Loader) - Shim generation system
- [Using a Sails Hook to customise ReDBox](Using-a-Sails-Hook-to-customise-ReDBox) - Hook development guide
- [Architecture Overview](Architecture-Overview) - System architecture
