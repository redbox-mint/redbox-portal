# SR-041/SR-042 — streaming multipart and resumable providers

## SR-041: owned streaming multipart

Implementation: `1e7045a0f`, with SR-035 storage extraction in `9b5942aa6`.
`http/express/multipart.ts` selects exact-pinned **@fastify/busboy 3.2.4** for
streaming field/file events and maintained count/byte limits. Random staging keys
are independent of submitted filenames. Both field orders work; repeated and
prototype fields, bad boundaries, count/size limits and unknown file fields are
refused. The parser streams to the existing selected staging disk and observes
backpressure. Finalization remains inside the admitted callback. Cancellation,
partial/unknown writes and failed cleanup are tracked: failed deletes remain owned
and make close fail observably until a successful retry.

`brandingUploads.ts`, `datastreamWrites.ts` and `datastreamReads.ts` replace the
13 inventoried upload declarations, using real branding inspection/sanitization,
Flydrive/GridFS, current record ACLs, stored concurrency/schema preconditions,
attachment journals and audit. API add-datastream finalization follows a successful
owned metadata save. Failure after that save reports its persisted partial outcome;
it does not claim rollback. Responses wait for staging cleanup. The browser and
Companion download aliases use current record view authorization. Static upload
mounts precede the raw tus ALL handlers; HEAD for those aliases falls through to
tus resume metadata. Legacy req.file transport code remains only in comparison
controllers until their last consumer retires; the standalone graph cannot load it.

The final HTTP matrix executes real GridFS upload/download, SVG sanitization,
valid WOFF2 inspection, stale branding revision, unauthorized upload and cleanup.
The focused parser command in `packages/redbox-core` is:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --timeout 10000 test/http/StreamingMultipart.test.ts
```

**7 passing / 0 failing/pending**, exit **0** (`multipart-final1.log`). The
backpressure case stalls the real staging disk and observes that HTTP input stops
before the full 2 MiB upload is consumed. Other cases execute limit validation,
field order, cancelled streams, unknown writes, downstream failure, cleanup
failure/retry and admitted finalization during shutdown. The integrated command
executed the original six cases before the added backpressure case was loaded;
its aggregate is not inflated to include that seventh case.

## SR-042: owned tus slice

`resumableUploads.ts` owns one **@tus/server 2.4.5** and the existing
`TusStorageManagerDataStore` per application, with raw parser exclusions. Upload
state remains on the selected disk; no session migration silently deletes it.
Configured total-size limits and bounded 32 MiB PATCH collection apply. Every
resume rechecks the current record edit ACL and persisted actor/brand/record
binding. Pending-record creation requires an explicit authorization operation.
A Companion callback secret alone grants nothing: its alias still needs actor
authentication and browser CSRF or a separately verified API bearer credential.
Session clients supply their CSRF header on raw tus requests, including HEAD
resume-state requests; verified bearer clients use the independent exemption.
Locations use the configured root-relative prefix, ignoring hostile forwarded
host/protocol. New transfers fence at quiesce and admitted handlers/audits drain.

The final integrated command runs **4 tus cases**, no failures/pending:
two-chunk resume, offset conflict, provider reconstruction against persisted state,
current object/actor binding, authentication/CSRF/size checks, termination,
protected callback aliases and held post-response auditing during shutdown.
These prove the tus provider/callback surface, **not** a running Companion transfer.

## Companion external blocker

**SR-042 remains unchecked.** No owned Companion app or remote-source transfer is
installed. The actual pinned **@uppy/companion 7.1.1** public API was probed:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
  --no-config --timeout 10000 test/http/CompanionLifecycleProbe.test.ts
npm pack @uppy/companion@7.2.0 \
  --pack-destination .tmp/sails-retirement/companion-7.2-probe --ignore-scripts
```

Diagnostic **1 passing**, exit **0** (`companion-probe2.log`); it establishes the
following missing ownership capabilities, not provider acceptance:

- Two `app()` calls return the same process-global emitter. Default metrics also
  collide across instances (the diagnostic disables metrics to inspect the rest).
- `app()` schedules ordinary cleanup immediately, before application activation.
- `socket(server, options)` returns **undefined**; its implementation constructs
  `new WebSocketServer({ server })` without a path filter or returned close owner.
- The public app result exposes no transfer admission/cancellation/drain/close
  contract. Detaching a listener cannot prove accepted transfer completion.

The packed **7.2.0** source retains the shared emitter, factory-scheduled cleanup
and unreturned/unfiltered WebSocket server. Upgrading alone does not repair these
requirements; no version override was changed. A supported lifecycle-capable
upstream release or a maintained Companion fork is required. Capturing internal
cron handles, monkeypatching WebSocket construction or copying provider algorithms
would not establish the required supported ownership contract. The diagnostic's
internal timer/listener cleanup is explicitly test-only and is not used by the host.
Consequently remote transfer resume/abort/drain and Companion/portal socket
coexistence cannot honestly be accepted. This is the remaining external provider
blocker; the independent tus/multipart work is implemented, not postponed.

## Exact dependency changes and graph

New direct pins: production **@fastify/busboy 3.2.4**, production **socket.io 4.8.4**
(portal progress), development **socket.io-client 4.8.4** (real protocol tests).
Core/root locks were synchronized by npm **11.20.0**; no pre-existing resolved
package version changed compared with `a7d5ae36a`. Root gained 9 resolved packages,
core 11; remaining lock churn is deduplication/dev flags and ordering. No generic
multipart framework, Sails upload shim or global Express override was introduced.

Actual resolution on Node **26.11.1**: root Express **4.22.2** / Companion **7.0.2**;
core Express **5.2.1** / Companion **7.1.1**; core Companion resolves Express
**5.2.1** and ws **8.21.1**. Portal uses Socket.IO **4.8.4**, not Companion's ws
protocol. Graph differences are preserved intentionally; the public lifecycle
probe does not qualify all Companion remote providers or its Express consumers.
Full environment and aggregate commands/results are in [API closure](p5-api-closure.md).
