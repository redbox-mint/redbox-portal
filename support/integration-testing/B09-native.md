# Required B09 generated HTTP/native Mongo gate

From the repository root, with compiled core/shared/storage packages and an isolated,
disposable Mongo database (the harness uses `migrate: drop`):

```sh
RECORD_DEFINITION_TEST_MONGO_URL=mongodb://127.0.0.1:27190/redbox_b09_native \
  bash support/integration-testing/run-b09-native.sh
```

For example, provision local Mongo with
`docker run -d --name redbox-b09-native-mongo -p 27190:27017 mongo:7`.
The gate requires installed dependencies and built packages; it does not install or
modify dependency manifests or lockfiles. Missing URL, unavailable Mongo, failed
shim generation, lift failure, or failed assertions return nonzero. Mongo selection
is bounded to five seconds. Mocha rejects pending tests and empty selections. Docker is required when using the Compose integration
path; an existing standalone Mongo also works for the direct command.

`npm run test:mocha`, `test:mocha:mount`, and `test:mocha:ci` all execute
`run-mocha-redbox.sh`, which runs this gate **unconditionally**, before its normal
bootstrap, even with custom test paths. The Compose Mongo service supplies the
isolated `redbox_b09_native` database. CircleCI's backend Mocha job explicitly
identifies this gate in its `test:mocha:ci` step. Any gate failure stops that runner.
The later normal application pass excludes only `B09 generated HTTP` because that
test already ran in its dedicated generated application; direct invocation without
the generated bootstrap fails an assertion and never skips.

The gate generates fresh loader shims and lifts production routes, discovered
controllers/services, policies, brand/path authorization, CSRF, sessions and body
parser. Only authenticated identity and the action descriptor are fixtures. Native
Mongo stores brands, roles, forms, drafts, revisions, history, fences and encrypted
secret slots. Publication races use the default production authority over those rows.
PUT/DELETE each race save/discard/publication in both orders. Native update wrappers
inject lost acknowledgements and hold delayed writes with latches; they delegate
persistence and CAS matching to Mongo. No sleeps establish test ordering.

Publication does not advance the shared draft version: a secret request resumed
after completed publication may succeed, while the immutable revision stays exactly
unchanged. A held secret fence blocks publication. Save/discard advance the draft
version and reject an older resumed secret request.

The separate `test/unit/controllers.RecordDefinitionAdmin.test.ts` suite installs
function handlers and stubs lifecycle/branding services. It is HTTP adapter unit
coverage, including optional Bruno contract checks, **not production E2E**. Run it
separately as documented in the B09 evidence. It is not a substitute for this gate.

The safety fence has no TTL. Lost acknowledgements or process failure can leave
mutations unavailable indefinitely. Recovery requires quiescing all writers,
checking the persisted slot and counter, and clearing only an abandoned owner token.
Never expire a fence while a writer could resume; automatic recovery is not implemented.
