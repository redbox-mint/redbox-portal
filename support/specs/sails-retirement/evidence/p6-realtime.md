# SR-043 — direct portal progress and Companion coexistence boundary

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

## Actual verification

The integrated [HTTP command](p5-api-closure.md#commands-and-results) executes
`ProgressSocketsMongo.test.ts`: **4 passing / 0 failing/pending**, on real HTTP,
Socket.IO, Mongo records/progress and the owned Mongo session store. It exercises
missing/replayed grants, foreign Origin, forbidden and invented rooms, persisted
progress/completion, ACL revocation before emission, fresh-grant reconnect,
browser CSRF, disabled session users, malformed writes and admitted completion
while unrelated new emission is rejected during quiesce. Duplicate attachment is
refused. The complete matrix is **146 passing**; compatibility regression is
**139 passing**, no pending/failures. No socket test was skipped.

## Remaining external acceptance gate

**SR-043 remains unchecked** because its explicit Companion coexistence/one-owned-
attachment acceptance cannot be proved with the current provider. The concrete
public-API/packed-source findings are in
[the Companion probe](p6-uploads.md#companion-external-blocker). Portal progress,
its client protocol and the concrete SR-035 dependency are implemented and tested.
There is no in-repo direct-progress implementation left deferred behind that
provider. A lifecycle-capable Companion artifact must subsequently prove both
socket paths and joint transfer shutdown before this task can be ticked. Full
PDF/browser/provider combinations remain SR-044, not acceptance claimed here.
