# Effect Hook Execution Verification Handoff

This page records reproducible checks for the Effect-based record-hook
execution change. Commands are run from the repository root.

## Toolchains

- Use Node 26.12.1 and npm 11.20.0 on the host. Run `nvm use` from the
  repository root and check `node --version` and `npm --version`.
- Check that the mounted development image also runs Node 26.12.1 with
  `docker compose -f support/development/docker-compose.yml --profile mount exec rbportal-mount node --version`.

## Effect 4 compatibility

Core pins Effect to `4.0.5`. Native Effect hooks and custom publishing layers
must use Effect 4 as well; Effect 3 values belong to a different runtime.
Promise and plain-value results retain their existing values; Observables retain
first-value semantics. Configured legacy Promise, Observable and Effect containers
may hide non-cancellable I/O, so an action timeout ends its outer wait but retains
the actual result lifetime. Timeout retry is suppressed until cancellation can be
proved; a container type alone is insufficient. A never-settling legacy container
therefore causes an observable stop deadline failure and retains its dependencies.
Native executor actions with a cooperative cancellation contract still interrupt.
Record hooks and notification success callbacks receive their own admitted
completion scope, including when launched by a worker or schedule. Their final
writes and the record audit stay admitted after the initiating request/job ends.
A failed queue drain deadline retains those scoped completion permissions for
cleanup retry; unrelated callers remain denied. The PDF hook still uses its own Effect 3 runtime internally and
returns an Observable at the record-hook boundary.

The migration follows the [upstream Effect 4 migration guide](https://github.com/Effect-TS/effect/blob/effect%404.0.5/MIGRATION.md).
Service keys use `Context.Service`, timeout fallbacks use
`Effect.timeoutOrElse`, and callback adapters use `Effect.callback`.
Retry schedules retain bounded attempts and capped exponential delays, and
logger adapters read annotations from the executing fiber.

## Focused checks

Run the packages' own test scripts so their Mocha setup is applied. Core's
`.mocharc.js` loads tests through ts-node in transpile-only mode; run the
focused type check separately to check the Effect callers and their fixtures.

```sh
npm run compile:core
cd packages/sails-hook-redbox-storage-mongo
node_modules/.bin/tsc -p tsconfig.json
cd ../..

cd packages/redbox-core
npm run typecheck:effect
npm test
cd ../..

cd packages/sails-hook-redbox-storage-mongo
npm test
cd ../..
```

The action-execution and RecordsService suites cover legacy characterization,
deterministic retry scheduling, native Effect actions, supervised teardown,
cross-layer save boundaries, bounded detached audit finalization, replacement
projection for partially completed detached work, non-overlapping timeout retry
policy, audit queue payloads, and public response safety. Operation logs emit a
single final `record_hook_operation_completed` event per execution; the
save-boundary event is `record_hook_operation_dispatched`.
The Mongo suite covers bounded summary sanitization and persistence.

## Container smoke check

Start the stack on the published Tailscale interface. Use the same
`RBPORTAL_HTTP_PORT` and `REDBOX_ROOT_CONTEXT` for the smoke checks.
[Development startup](Compiling-and-running-the-development-environment.md#running-the-application)

```sh
portal_origin="http://$(tailscale status --json | jq -er '.Self.DNSName | rtrimstr(".")'):${RBPORTAL_HTTP_PORT:-1500}"
curl -fsS "${portal_origin}/readyz"
curl -fsSL -D - -o /dev/null "${portal_origin}${REDBOX_ROOT_CONTEXT:-}/"
```

Readiness stays at the origin. The landing page includes the deployment root
when configured and redirects to the branded page, which returns HTTP 200.
After executing the relevant record hooks, check the container for structured
`record_hook_action_completed`, `record_hook_operation_dispatched`, and one
`record_hook_operation_completed` event per execution;
raw hook arguments and execution summaries must not appear in business-record
payloads.
