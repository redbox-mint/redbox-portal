# Initial v5-to-v6 hook conversion

The neutral contract is [extensions-v6.md](extensions-v6.md). Generate the
executable example with:

```sh
redbox-dev-tools init demo-client --template v6
npm install
npm run build
```

The template lives in this repository at
`packages/redbox-dev-tools/templates/hook-archetype/v6/`. V6 is now the only scaffold and the default; `standard` is rejected. The v6
template demonstrates an extension, not a complete standalone portal deployment.
Build and pack it, install the archive in the portal deployment, and bind its
concrete module/work/handler inputs through `createPortalHost`. Startup data
belongs under `config.custom[hookName]`.
[Generated institution qualification](../../../packages/redbox-core/test/qualification/generated-institution.cjs)
exercises these bindings, persisted work, public HTTP, restart and drain on the
production host; it supplements the isolated packed registration checks.

## Package format and registration

Before, the manifest's `sails.hasServices`, `hasControllers`, `hasConfig`,
`hasBootstrap` and related flags drove shim generation and Sails discovery:

```ts
const hook = defineRedboxHook({
  registerRedboxServices: () => ({ ExampleService }),
  registerRedboxControllers: () => ({ ExampleController }),
  registerRedboxConfig: () => ({ example: { greeting: 'Hello' } }),
});
module.exports = hook;
```

After, `redbox.extension` names a public export and that entry declares
`registerRedboxExtension(): RedboxExtension` with `apiVersion: 1`. The generated
package uses CommonJS and exports the function from TypeScript; ESM can expose
the same named function, including top-level await. Package format compatibility
does **not** make old Sails-dependent source compatible. Convert `CoreService`,
`sails.services`, global models/config, events, shims and `lower()` patches to
explicit dependencies and owned lifecycle operations. The bundled hooks expose neutral extension entrypoints; the comparison adapters have been removed.

## Service and native resource

Before, a service could discover configuration and other services globally, open
a client during construction, then depend on a Sails event or patched lower:

```ts
class ExampleService extends CoreService {
  constructor() {
    super();
    this.client = openClient(sails.config.example);
    sails.on('hook:orm:loaded', () => this.start());
  }
}
```

After, generated `src/Example.ts` receives `ExampleInput` (`auditPath`, `greeting`).
Its factory constructs an object without opening a resource. `initialize()` opens
one native file handle; `activate()` admits greetings; `drain()` refuses new work
and awaits accepted writes; `close()` closes the handle. Failed close retains it
for observable application stop retry. The application registers the module
before initialization, including when later initialization fails.

The application binds the **selected** module factory with its concrete input,
using `bindExtensionFactory`, and retains that instance for the handler input.
The binding belongs to the application's composition root. Each application gets
its own handle and configuration slice. `replaces: true` intentionally overrides
a named lower-priority factory; a duplicate without that flag is rejected before
either factory is instantiated. No universal service locator is supplied.

Use the existing storage/persistence owners for database and GridFS resources.
Do not introduce a second pool or repository layer. A server integration receives
the host's single server via `prepare(server)` and declares its lifecycle; it
does not listen or install process signal handlers.

## Controller, route and policy

Before, controllers used Sails request helpers and generated shims:

```ts
class ExampleController extends CoreController {
  async index(req, res) {
    return res.json(await sails.services.exampleservice.greet());
  }
}
// Sails hook routes: 'GET /hooks/demo-client/status': 'ExampleController.index'
```

After, `src/handler.ts` exports an Express handler factory receiving only
`{ example: Pick<Example, 'greet'> }`. Generated `src/index.ts` declares its module
prerequisite and a named GET route. The example deliberately uses `access: 'public'`.
A protected route declares ordered policy names, for example
`access: ['authenticated', 'administrator']`; the host must bind policy execution.
Missing policies are an error, not an implicit public route. Method/path aliases
and unintended duplicates fail during resolution; named replacement is explicit.
Handler execution sits behind the existing host's inactive/activation gate.

The generated handler is a small demonstration. The production Express host
binds request parameters, branding, authentication and portal API routes explicitly.
Convert custom handlers to these owned inputs; legacy controllers are not mounted.

## Configuration, forms, contributors, views and assets

Before, `mergeHookConfig` mixed configuration with imperative setup. After,
`src/config.ts` exports ordinary startup data; `registerRedboxExtension()` returns
it under `config`. The application later resolves/finalizes slices and injects
them. Registration does not mutate the running application or bootstrap data.

`redbox-hook-dev/extension` uses its demo/scenario declarations: `config`, `forms` and `workflows` refer to the same underlying
configuration definitions. Its Playwright opt-in still requires both the scenario
flag and a development/integration-test environment. A pure public
`redbox-core/extensions/config` entry reexports the existing DOI binding helper,
so registration never imports the legacy core barrel.

Forms are declared by logical name, for example
`forms: { 'example-1.0-draft': exampleForm }`; workflows by record type in
`workflows`. A schema contributor declares its owner, for example
`contributors: [{ name: 'exampleSchema', module: 'ExampleDemoClient' }]`, with
the actual implementation on that selected module. The descriptor does not
invent storage schemas or run a contributor while inspecting registrations.
See the bundled development hook for complete existing form/workflow data.

Generated `views: ['views']` and `assets: ['assets']` name package-relative
directories included in `files`. Lookup searches higher-priority hooks first;
configuration contributions are ordered in the opposite direction. The page
adapter receives these resolved absolute roots, followed by the core
application artifact. `PageArtifacts` prepares one ordered EJS tree during
initialization and removes its temporary tree at close; package directories stay
read-only. Static lookup checks each brand/portal candidate in specificity order. For the same path, explicit application asset roots (the compiled `.tmp/public` tree by default) precede hook roots; hooks retain their resolved priority, followed by source assets. This preserves application overrides. Convert legacy `mergeHookConfig` asset-copy effects into the packaged application tree when they intentionally replaced those bytes. Dotfiles, traversal and
symlinks outside declared roots are refused.

Build the application assets first (`npm run webpack`), then run
`npm run package:pages` to assemble `.tmp/page-artifacts/{views,assets}`. Install
that directory in the deployment artifact and supply its absolute path to
`PageArtifacts.installed(...)`; runtime lookup does not depend on the working
directory or the source checkout. Extension view/asset directories remain
package-relative declarations in the extension's `files` list.

EJS templates receive a request-scoped `page` value: `root` (deployment prefix),
`base` (prefix plus brand and portal), `brand`, `settings`, `config`, `typeface`,
`faviconUrl`, `t(key, values)`, `param(name)` and
`bundleHash(app, prefix, before?, after?, evenEmpty?)`. Replace global service or
`sails.config` lookups with those values. `superPartial('/layout/logo.ejs')`,
`partial(name, extraLocals)` and ordinary EJS `include(...)` resolve installed
partials; the body is rendered explicitly into the chosen layout. Keep Angular
`ngCspNonce` and script/style nonces from `contentSecurityPolicyNonce`.

Use `page.root` for unbranded assets and `page.base` for branded URLs. The shared
Webpack entry receives `data-redbox-root` from the layout so lazy validator chunks
stay under the deployment prefix. Extracted CSS font paths are relative, preserving
the emitted asset names under a proxy prefix. The v6 page adapter does not expose
`res.view`, Sails globals, view-hook registration or legacy middleware helpers.
Mount `mountPageNotFound` after all owned routes and `mountStaticPageArtifacts`.
Page-level denials/missing objects/backend failures render the installed error
EJS inside the selected layout for HTML requests, with ordinary JSON negotiation
and a terminal text response if the error artifact itself fails. Policy denials
retain their policy responses; error rendering grants no additional access.

The development hook contributes named record operations and explicit page settings.
A finite migration table converts known persisted v5 expressions to owned operation
names, including explicit nested `hooks`, notification `onNotifySuccess` callbacks
and queued `triggerConfiguration` declarations. The
`20261025T000000-v6-notification-record-hook-operations` repair also handles
checkpoints where earlier v6 conversion migrations already completed. Runtime
validation checks nested declarations before invoking the parent operation, so an
unsupported success callback cannot first send an email. Unknown expressions fail
conversion; there is no dynamic service-path evaluation.

## Awaited bootstrap and migrations

Before, registration or a callback could launch unawaited application-data writes:

```ts
registerRedboxBootstrap: () => async function bootstrap() {
  sails.services.namedqueryservice.upsert('demo-dashboard', query);
}
```

After, generated `src/work.ts` defines `ExampleWorkInput.ensureNamedQuery()` and
awaits it. The extension returns separate `bootstrap` and `migrations` declarations
with required modules. Merely loading the extension runs neither operation.
The application binds real repository operations after schema/readiness checks;
the sample's injected operation must implement the deployment's upsert policy.

Migrations keep stable, lexically ordered names and the existing ledger. Preserve
existing migration names when porting an institution. Rename the scaffold's
sample migration before first release. These declarations provide no transaction,
rollback, or exactly-once guarantee. The application awaits migrations and
bootstrap before activating workers and HTTP. A failed operation prevents readiness;
the ledger records completed named migrations for restart.

## Verification and remaining rollout

The development hook, core, storage/PDF hooks and dev-tools are packed with real
`npm pack`. The isolated production consumer loads declarations with network
connect/listen disabled and no global Sails, then generates and compiles a v6
hook against the installed public types. It exercises activation/drain/close
with an actual file. The historical [P2 evidence](evidence/p2-extensions.md)
records that phase's format/precedence checks; the completed production composition,
packed extension fresh/restart and browser/API gates are recorded in
[P8 evidence](evidence/p8-retirement.md) and [artifact results](evidence/p8-artifacts.json).

Institution designation remains SR-005. Internal production-composition, queue,
authenticated/public portal and packaging checks are complete for the recorded
artifacts. They do not qualify an undesignated institution or replace its hook,
configuration, topology and recovery rehearsal.

## Record hooks, configured actions and progress clients

For record mutations, inject the existing `records/Records` pipeline with selected
repositories, storage, schema/validation, workflow/forms, queue/index and provider
operations. Convert each v5 hook expression into a known name in the selected
composition's callable map. `resolveHook(name)` returns only a registered function
and throws for unknown names. Keep the existing hook signature/phase semantics;
a missing provider is a composition failure, never a successful no-op. The comparison wrapper has been removed; runtime dispatch accepts only registered names.

Replace a generic v5 action service expression with a selected `ConfiguredAction`:

```ts
const actions = {
  publish: {
    authorize: context => publication.canPublish(context.actor, context.brand),
    execute: context => publication.publish(context.brand.id, context.body),
  },
};
```

Pass this map to `mountConfiguredActionRoutes` with the application's bound
policies, CSRF and awaited audit. The selected publication operation owns any
external requests and partial-effect reporting. It receives no Express request
or response and starts no transfer during registration.

Replace virtual `io.socket.get(.../asynch/subscribe/...)` requests with direct
Socket.IO subscribe/unsubscribe events. Use `assets/js/redbox-progress.js` with the
configured portal socket path, token URL and current CSRF operation. Reconnect
fetches a fresh grant and rejoins remembered rooms; both joins and emissions
reauthorize current actor/record access. Legacy virtual routes return 410.
Companion keeps its own ws protocol. Compose one `CompanionUploads` per process and
await `initialize(server)` in host preparation, then call `mountCompanionRoutes`
after the owned session/authentication middleware. Exclude its configured mount
from the ordinary parser; its bounded JSON/form parsers belong to the mount.
Provide canonical origins, an explicit metrics boolean, upload destinations and
external server path/implicit proxy prefix. The trusted session/deployment selects
the unbranded provider URL's brand/portal; bind the ordinary owned policies, CSRF
and audit operations. Callback uploads must carry an independently verified actor
credential (and CSRF for browser sessions), never only a shared secret.

Use a fresh process for another application or provider restart. The adapter owns
its isolated socket bridge and fences/drains admitted HTTP and connections until
the stop deadline. Retain its temporary directory until process exit. Companion
cleanup cron and remote I/O beyond that deadline have process lifetime; remote
completion/recovery across exit is not promised. Redis/periodic pings are refused.
See evidence/p6-uploads.md and evidence/p6-realtime.md for the real URL/tus and
socket qualification and the design for accepted residual limits.
### PDF background work admission

The PDF factory input now requires `runAcceptedWork`. Bind it to
`operation => runAcceptedPersistenceWork(owner, operation)` from the narrow
`@researchdatabox/redbox-core/extensions/storage` entrypoint, using the same
application owner as the selected storage module. Initial generation and each
scheduled retry start inside that scope and retain it through their actual fiber
completion. The HTTP trigger or queue callback may finish sooner; its settled
scope must not be inherited as the lifetime of detached PDF work. Every application supplies this binding. Keep `quiesce`, `drain` and `close` registered
with the application's existing resource registry.

Companion 7.1.1's native logger serializes failed tus requests, including caller
credentials, and prints transfer grants. The owned host uses a narrow Node 26
loader hook to replace only the exact version/hash-checked logger module with
bounded activity/warning/error messages; it deregisters the hook after import.
It neither changes installed files nor intercepts the process console. Do not
preload Companion in an extension: startup refuses an already-loaded or changed
provider rather than running its unsafe logger. Requalify this adapter when
changing the pinned provider. Transfer protocols and acknowledgement behavior
are unchanged; request/provider payloads are deliberately absent from native logs.
