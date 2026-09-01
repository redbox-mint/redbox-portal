# Effect Hook Execution Verification Handoff

This page records reproducible checks for the Effect-based record-hook
execution change. Commands are run from the repository root.

## Toolchains

- Host smoke toolchain: Node 24 (`node --version`), npm, and the repository's
  exact-pinned dependencies.
- Container smoke toolchain: the development image's Node 26 runtime. Confirm
  with `sudo -n docker exec development-rbportal-mount-1 node --version` while
  `npm run dev:run` is running.

## Focused checks

Run the packages' own test scripts. Do not substitute a narrowed
`--no-config` / `TS_NODE_TRANSPILE_ONLY=true` invocation: transpile-only skips
type checking, and `--no-config` bypasses `.mocharc.js`, so a focused run can
report passing tests while `npm test` cannot load the suite at all.

```sh
npm run compile:core
cd packages/sails-hook-redbox-storage-mongo
node_modules/.bin/tsc -p tsconfig.json
cd ../..

# Type-checks src only. Test files are covered by test/tsconfig.json, which
# ts-node applies per loaded file during the run below.
cd packages/redbox-core
npm test
cd ../..

cd packages/sails-hook-redbox-storage-mongo
npm test
cd ../..
```

A type error in any loaded test file makes ts-node fail to compile it; mocha
then retries the file as ESM and the run aborts with a misleading
`ERR_MODULE_NOT_FOUND` naming an imported module rather than the real type
error. If that appears, run `node_modules/.bin/tsc --noEmit -p test/tsconfig.json`
and look for errors in the files this change touches.

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
