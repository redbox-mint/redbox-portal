# Effect Hook Execution Verification Handoff

This page records reproducible checks for the Effect-based record-hook
execution change. Commands are run from the repository root.

## Toolchains

- Host smoke toolchain: Node 24 (`node --version`), npm, and the repository's
  exact-pinned dependencies.
- Container smoke toolchain: the development image's Node 26 runtime. Confirm
  with `sudo -n docker exec development-rbportal-mount-1 node --version` while
  `npm run dev:run` is running.

## Effect 4 compatibility

Core pins Effect to `4.0.2`. Native Effect hooks and custom publishing layers
must use Effect 4 as well; Effect 3 values belong to a different runtime.
Promise, Observable, and plain-value hook interfaces retain their existing
behavior. The PDF hook still uses its own Effect 3 runtime internally and
returns an Observable at the record-hook boundary.

The migration follows the [upstream Effect 4 migration guide](https://github.com/Effect-TS/effect/blob/effect%404.0.2/MIGRATION.md).
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

```sh
APP_URL=http://<tailscale-ip>:1500 npm run dev:run
curl -fsS -D - -o /tmp/redbox-home.html http://<tailscale-ip>:1500/
```

The compose interpolation maps `APP_URL` to `sails_appUrl`. A healthy stack
redirects `/` to the branded home route and returns `200 OK` for the rendered
ReDBox page. Container logs should include structured
`record_hook_action_completed`, `record_hook_operation_dispatched`, and one
`record_hook_operation_completed` event per execution;
raw hook arguments and execution summaries must not appear in business-record
payloads.
