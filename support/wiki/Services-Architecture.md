# Services Architecture

Business domains are explicitly constructed with the repositories, configuration,
logger and provider operations they need. The production composition lives in
`packages/redbox-core/src/application/portal/`. There is no process-wide service
registry, implicit global application, loader export cache or readiness event.

## Lifecycle and ownership

A factory is offline. Its `ApplicationModule` performs awaited `initialize`, then
optional `activate`. Shutdown calls producer `quiesce`, joined `drain` and `close`.
Initialization failure rolls back acquired modules before any ordinary activation.
Failed stop retains resource ownership and may be retried. Accepted persistence
work remains owned after the initiating HTTP connection closes.

Use `requires` to declare module ordering. Supply explicit collaborators to each
instance; construct a fresh instance for each application. `Services.Core.Service`
is an optional utility for logging and Observable helpers, not a registration
mechanism. Domain operations may return Promises or single-result Observables;
HTTP adapters await them and map typed errors.

## Domain boundaries

| Domain | Owned source |
|---|---|
| Records, permissions, save pipeline, datastreams and triggers | `src/records/` |
| Forms, validation, workflows and workspace definitions | `src/forms/` |
| Record types/schema/contributors | `src/recordTypes/`, `src/recordSchema/`, `src/record-contract/` |
| Users, effective accounts, roles and authentication | `src/identity/` |
| Search, reports, named queries, history and progress | `src/queries/` |
| DOI, RAiD, ONI, Figshare, email and security auditing | `src/integrations/` |
| Branding/typefaces/theme and application configuration | `src/branding/`, `src/configuration/` |
| Vocabulary, translations and workspaces | `src/vocabulary/`, `src/translations/`, `src/workspaces/` |
| Agenda and scheduled producers | `src/queues/` |

The retained `src/services/*Service.ts` public paths re-export owned domains.
They do not provide default construction, globals or lifecycle discovery.

## Extending behavior

Register named factories through `RedboxExtension`. A selected application binds
its concrete dependencies and must explicitly accept extension-specific contracts.
Do not pass a general service locator. Overrides declare `replaces: true` and
preserve the selected contract's security, errors, concurrency, schema, audit and
partial-effect rules. Use the validated example in
`support/documentation/examples/hook-override.ts` and the v6 scaffold:

```sh
npx redbox-dev-tools init redbox-hook-example --template v6
```

Configured actions and record hooks resolve registered operation names. They
never evaluate service-path strings. Unknown actions return 404; unregistered
record hooks fail validation before effects. The upgrade migration recognizes a
finite list of historic built-in hook names solely to rewrite persisted data.

## Persistence and important extension contracts

Repository methods require an explicit initialized owner. Keep imports and
registration offline. See [Persistence Migration](Persistence-Migration.md) and
[index preparation](Persistence-Index-Preparation.md).

A storage replacement declares the complete versioned `recordConcurrency`
capability before strict record types can use it. It must atomically enforce
expected revisions, certify non-application reasons and report uncertain outcomes
for reconciliation. Verify against its real datastore before declaring support.

Branding typeface operations own WOFF2 validation, content-addressed storage,
integrity and orphan reconciliation. Branding owns draft/publish/restore and
retention; theme CSS never accepts arbitrary CSS-family input. Preserve these
boundaries in replacements.

Form/record validation and schema replacements preserve authoritative operations,
privacy, timeout, shadow/enforce behavior and contributor fingerprints. Request
chronicle summaries remain bounded and value-safe; inject a logger explicitly.

## Verification

Use existing service suites with concrete fixture collaborators and the real-Mongo
HTTP/integration matrix for persisted behavior. Do not install service globals or
replace production behavior with fixture-only implementations. See
[Testing](ReDBox-Automated-Tests.md), [core package](Redbox-Core-Types.md) and
[generated contracts](Generated-Reference-Documentation.md).
