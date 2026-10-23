# SR-043 — direct portal progress and owned Companion coexistence

## Implemented direct portal slice

`1e7045a0f` introduces `ProgressSockets` and `progressOperations` over the extracted
`progress/Asynchs` repository operations and shared `progress/authorization`.
The lazy once-per-service-call Observable behavior is preserved: repeated
subscriptions cannot repeat mutations. The comparison room resolver delegates to
the same persisted record/progress lookup; arbitrary hyphen prefixes no longer
grant record authority. Existing comparison tests now supply actual tenant-owned
records and persisted composite task pairs rather than accepting invented rooms.

One direct **Socket.IO 4.8.4** attachment is allowed per Node HTTP server at an
explicit portal path, distinct from Companion. Connection grants are random,
one-use, 30-second values issued over a protected HTTP operation. Canonical
Origins are allowlisted. Connections, joins and every emission independently
re-read the same owned session store or reverify bearer authentication, disabled
state, current brand membership and actual record view access. Persisted progress
IDs and task/record pairs identify rooms; a client cannot invent a suffix to gain
access. Grants/rooms/payload sizes are bounded.

Connect/subscribe/emission work runs in the existing persistence accepted-work
scope. Quiesce fences grants, new joins and unrelated producers. A caller whose
admitted HTTP/job scope is still active can report completion while draining;
detached/new producers cannot. Pending work drains before Socket.IO closes and
before borrowed clients/pools close. The new small scope-state query reuses that
existing owner rather than adding another generic lifetime registry.

The six historical HTTP progress declarations are implemented. Legacy virtual
subscribe/unsubscribe endpoints return explicit **410** with conversion guidance;
clients use direct `subscribe`/`unsubscribe` events and acknowledgements instead.
`POST /:branding/:portal/asynch/socket-token` issues a grant. Start/update/finish
and queries require current actor/record authorization, tenant scoping and audit;
malformed identifiers/fields and attempted ownership changes are refused.

## Client inventory and conversion

A source search across `assets`, `typescript`, `views` and package source found
no active `io.socket`/virtual-subscribe consumer outside the comparison controller
and route declarations. Vendored `assets/js/dependencies/sails.io.js` remains a
legacy artifact; it is not loaded by this owned integration. Page/static artifact
selection remains SR-040. `assets/js/redbox-progress.js` supplies the coordinated
client: load the Socket.IO browser bundle at the configured progress path, acquire
a fresh session/CSRF-bound grant on reconnect and rejoin the remembered rooms.
There is no Sails virtual-request emulation or second HTTP listener.

## Direct-progress verification in the accepted API round

The integrated [HTTP command](p5-api-closure.md#commands-and-results) executes
`ProgressSocketsMongo.test.ts`: **4 passing / 0 failing/pending**, on real HTTP,
Socket.IO, Mongo records/progress and the owned Mongo session store. It exercises
missing/replayed grants, foreign Origin, forbidden and invented rooms, persisted
progress/completion, ACL revocation before emission, fresh-grant reconnect,
browser CSRF, disabled session users, malformed writes and admitted completion
while unrelated new emission is rejected during quiesce. Duplicate attachment is
refused. The complete matrix is **146 passing**; compatibility regression is
**139 passing**, no pending/failures. No socket test was skipped.

## Companion coexistence under the accepted public-API decision

The initialize-time `CompanionUploads` adapter uses one dedicated unlistened
HTTP server, with one filtered forwarding listener on the real host. Companion's
unfiltered ws listener is attached only to that bridge. The portal has one ordinary
Socket.IO attachment at `/portal/progress/socket.io`; Companion uses its own
`/portal/companion/api/:token` protocol. The application owns both resources and
fences their new work before shared persistence cleanup.

The real combined provider suite verifies exactly two real-server upgrade
listeners after repeated Companion initialize and refused duplicate portal attach.
A Companion URL/tus upload pauses at a held second PATCH, survives Engine.IO's
unrelated-upgrade timeout, closes/reconnects with the same active token and resumes
stored offsets to the complete 512 KiB payload. The portal connection stays live,
reauthorizes its record join and receives a real progress emission afterward.
Invalid Companion tokens/Origins are refused. These are actual WebSocket/Socket.IO
handshakes and messages, not listener-count-only acceptance.

During shutdown an admitted URL metadata request completes while the connections
remain held. A deliberately incomplete remote-body transfer and an idle Companion
connection remain until the 800 ms stop deadline, then both raw transports close.
New provider HTTP requests receive 503 before listener closure and new upgrades
are denied. The Companion forwarding listener is removed on close. Socket.IO's
public close operation shuts its clients/server; its inert Engine.IO listener can
remain on the closed, non-reusable host object. No listener is stolen or patched.
A stop deadline can race final persistence cleanup, so the test uses the existing
retry operation and proves the host reaches stopped state.

Provider-internal remote I/O may continue/fail after transport termination, with
process exit as the final boundary. It is explicitly qualified as a residual
limitation, compared with released-v5's lack of drain. The cron/singleton/recovery
limits are detailed in [uploads](p6-uploads.md#accepted-residual-limits-and-released-v5-comparison)
and the design. They no longer constitute an upstream/fork dependency. Full
PDF/browser/provider combinations remain SR-044 and were not started here.

## Final joint qualification and closeout

Sources **ab01644165c2186f85acc815cfdb427f0cdfab46** and final fence
**3551a298549512d5b787e2e10ae450da46c6bb77**, host **agentvm**. Node **26.11.1**,
Mongo **8.0.34** / FCV **8.0** with nofile **64000:64000**, Solr **10.0.0**,
Keycloak **26.5.6**, Companion **7.1.1**, Socket.IO **4.8.4**, ws **8.21.1**.
Exact image IDs, dependency reasons and complete reproducible commands are in
[uploads evidence](p6-uploads.md#round-sources-provider-graph-and-executed-commands).

- Docker runs `CompanionLifecycleProbe.test.ts` and `CompanionUploadsMongo.test.ts`:
  **6 passing / 0 failing/pending**, natural exit **0**
  (`companion-docker-guard.log`). Actual protocols attach once each; the production
  child separately proves initialize-time cron and the process singleton.
- The complete [HTTP/Bruno command](p6-uploads.md#integrated-http-and-bruno-follow-up)
  runs this joint suite and `ProgressSocketsMongo.test.ts` with the other migrated
  groups: **153 passing / 0 failing/pending**, natural exit **0**
  (`companion-integrated-guard.log`). Bruno: **34/34 requests / 53/53 scripted
  checks**. No new provider/session/Mongo case is skipped.
- Root `PERSISTENCE_TEST_MONGO_URL=mongodb://127.0.0.1:34903/redbox_prisma_p5 npm run test:core`:
  **4417 passing / 68 existing pending / 0 failing**, exit **0**
  (`companion-full-core-final.log`). Existing pending cases are not acceptance.
  Build, strict types, 1046-file lint and inventory check all exit **0**.

Both protocol runs wait for Agenda's existing idle watchdog and exit naturally;
no timer/lock patch or forced runner exit supplies acceptance. The expected late
remote-transfer error after listener closure is a tested residual limit, not a
failed assertion. No provider quota/usage limit occurred. SR-043 is complete under
the accepted ownership/deadline decision; SR-042 is complete in the paired upload
evidence. The virtual-request 410 conversion and cross-process recovery limits
remain documented. SR-040 and SR-044 were not started.
