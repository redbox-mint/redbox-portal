> **Current status (phase 8 onward):** Prisma is the sole backend. Remove all
> persistence backend selectors and Sails aliases, including empty or `prisma`
> values. Selector forwarding and Waterline rollback instructions below are
> historical. Follow the [current migration guide](../../wiki/Persistence-Migration.md).

# J3 SIEM operations

Use `persistence.groups.siem.backend` (`waterline` rollback or `mongodb` default after G-J3) and
restart changed instances; supplied stacks forward `RBPORTAL_SIEM_BACKEND`.
There is no fallback. J3 is independent of harvest, progress, Figshare and record
storage. Envelope ownership lookup uses RecordsService.getMeta and its configured storage adapter. Retain loaded model definitions/shims and association registrations
until their later retirement phases.

Stop incoming capture producers and SIEM dispatchers, wait for accepted jobs,
checkpoint the database and matching hooks/config/assets, and retain the exact
pre-J3 image in the validation manifest. Select MongoDB for the stopped
maintenance process and run `npm run persistence:indexes -- --inspect`, review
all selected scopes, then explicitly `--ensure` and inspect again. Startup only
inspects. Existing volumes never rerun fresh-volume initialization. Duplicates,
conflicting definitions and non-simple collation block readiness without data
repair. Institution mappings/callbacks remain Waterline until ported/qualified.

Eight simple-collation indexes cover six event and two attempt paths. `eventId`
is globally unique; brands and event references remain strings. Polling/recovery
uses string ISO times, token ownership and strict lease expiry; legacy processing
rows with null/missing leases are recoverable. No TTL, cross-collection atomicity
or automatic history deletion is introduced. Dead-letter retention removes
attempts before the terminal envelope, so a crash leaves an envelope to revisit.

Capture redacts before enqueueing; delivery redacts again using current brand
policy. Hydrated destination credentials remain AppConfigService-owned. Preserve
per-destination attempt reservations, independent budgets/backoff and successful
acknowledgments forever, including legacy successful history. A worker persists
the reservation before HTTP and fenced acknowledgment before history/another
destination. An expired or replaced token cannot renew or finish, including
across restart and mixed-adapter instances. An accepted claim requires reading
back the token; an update count alone does not authorize delivery.

HTTP effects, envelope state, history and Agenda delivery are separate effects.
A failed acknowledgment can follow an applied MongoDB write or a remote effect.
Capture replay verifies the existing event's tenant before suppressing uniqueness.
An ambiguous claim returns an error and sends nothing; let its lease expire and
re-read durable state. For an ambiguous HTTP result, preserve the reserved budget
and retry policy; collector-side duplicate handling remains necessary. A lost
acknowledgment may produce duplicate delivery; no exactly-once promise is made.
Do not clear a live lease or blindly retry an unknown outcome.

Service `drain()` stops new accepted capture/forwarding work and waits for active
queue, HTTP, acknowledgment and history writes before foundation cleanup. Register
service `init()` before shutdown. Drain all owners before changing selectors or
starting the retained pre-change image, using compatible selectors for every
later group. Keep the database, indexes, MongoDB version/FCV and topology intact.
Checkpoint restoration is a separate operator decision requiring reconciliation
with subsequent record and collector effects.

Provisional `next` comparison limits remain p95 <=1.20, throughput >=0.90, RSS
<=1.10 and database calls <=1.25 relative to Waterline; readiness <250ms, one
shared foundation client and no app connections after close. The bounded fixture
uses 20 15KB envelopes, 100 warmups and 1,000 polling/claim/release/history-count
operations, including measured capture, fenced terminal delivery, history and retention, alternating backend order across three pairs. HTTP delivery is
qualified separately by controlled receivers and standard service/API runners.
See the validation ledger for measured results and the current G-J3 decision.
