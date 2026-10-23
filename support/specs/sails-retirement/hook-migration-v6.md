# Initial v5-to-v6 hook conversion

The neutral contract is [extensions-v6.md](extensions-v6.md). Generate the
executable example with:

```sh
redbox-dev-tools init demo-client --template v6
npm install
npm run build
```

The template lives in this repository at
`packages/redbox-dev-tools/templates/hook-archetype/v6/`. The default `standard`
template continues to serve the temporary Sails comparison environment. The v6
template demonstrates an extension, not a complete standalone portal deployment.
Generated application packaging and release commands remain SR-047/SR-053.

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
explicit dependencies and owned lifecycle operations. The temporary legacy
entrypoints in bundled hooks are comparison adapters, not a v6 fallback loader.

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

The generated handler is a small demonstration. Legacy parameter precedence,
branding/auth context and portal API conversion remain the P4/P5/P6 tasks; this
phase does not mount legacy controllers or redirect missing routes to Sails.

## Configuration, forms, contributors, views and assets

Before, `mergeHookConfig` mixed configuration with imperative setup. After,
`src/config.ts` exports ordinary startup data; `registerRedboxExtension()` returns
it under `config`. The application later resolves/finalizes slices and injects
them. Registration does not mutate the running application or bootstrap data.

`redbox-hook-dev/extension` reuses its existing demo/scenario declarations with
the legacy adapter: `config`, `forms` and `workflows` refer to the same underlying
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
configuration contributions are ordered in the opposite direction. These are
declarations; final static serving/configuration orchestration follows later.

The development hook still contributes demo function-name strings such as
`sails.services.rdmpservice.runTemplates`, plus legacy redirect/view settings,
as configuration **data**. Their execution/conversion belongs to the inventoried
P3/P5 trigger/HTTP work. Loading these declarations does not execute those strings
or claim that the complete demo portal already works on the partial host.

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
rollback, or exactly-once guarantee. P3 owns their execution stages and activation;
the P2 tests explicitly invoke fixture operations only to check the declared seam.

## Verification and remaining rollout

The development hook, core, storage/PDF hooks and dev-tools are packed with real
`npm pack`. The isolated production consumer loads declarations with network
connect/listen disabled and no global Sails, then generates and compiles a v6
hook against the installed public types. It exercises activation/drain/close
with an actual file, and separately starts the partial Express host with the
format/precedence fixtures. Commands, artifacts and limits are in
[P2 evidence](evidence/p2-extensions.md).

Institution designation remains SR-005. Full config orchestration, queues,
authenticated/public portal coverage and final application packaging remain the
later tasks; none is implied by a successful offline extension import.

## Record hooks, configured actions and progress clients

For record mutations, inject the existing `records/Records` pipeline with selected
repositories, storage, schema/validation, workflow/forms, queue/index and provider
operations. Convert each v5 hook expression into a known name in the selected
composition's callable map. `resolveHook(name)` returns only a registered function
and throws for unknown names. Keep the existing hook signature/phase semantics;
a missing provider is a composition failure, never a successful no-op. The thin
Sails comparison wrapper may still interpret old expressions while it has legacy
consumers; the standalone graph cannot import that wrapper.

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
Companion's separate provider/protocol remains gated by its upstream lifecycle
contract, as recorded in evidence/p6-uploads.md and evidence/p6-realtime.md.
