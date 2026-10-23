> **Current status (phase 8 onward):** Prisma is the sole backend. Remove all
> persistence backend selectors and Sails aliases, including empty or `prisma`
> values. Selector forwarding and Waterline rollback instructions below are
> historical. Follow the [current migration guide](../../wiki/Persistence-Migration.md).

# V vocabulary persistence operations

Current phase 4: selectors are `prisma | waterline`, default `prisma`; `mongodb`
is rejected. [Phase 4 evidence](evidence/prisma-phase4.md) supersedes this driver
checkpoint for implementation/readiness details. Normal CRUD and frozen branding
migration writes use models. Optional missing reads may be null; patches preserve
physical absence. V applying claims are now atomic (one Prisma winner); explicit
Waterline rollback retains its two-winner window. The sequential failure and
recovery guidance below remains applicable; no transactions were added.

V covers Vocabulary, VocabularyEntry and the five Figshare vocabulary entities.
`persistence.groups.vocabulary.backend` selects `mongodb` or explicit `waterline`;
supplied stacks forward `RBPORTAL_VOCABULARY_BACKEND`. The current omitted
selector defaults to MongoDB after the separate P8.6 promotion; explicit
Waterline remains available.
Restart every changed instance. No fallback, transaction, retry or new uniqueness
constraint is introduced. Keep the seven model definitions/shims for rollback
and the remaining association graph until P11.

Stop vocabulary editors, imports and Figshare preview/apply/approval producers,
drain accepted work, and take matching database/config/hooks/assets checkpoints.
Retain the pre-V application artifact. With the stopped maintenance process
configured for the intended driver selectors, run:

```bash
npm run persistence:indexes -- --inspect
npm run persistence:indexes -- --ensure
npm run persistence:indexes -- --inspect
```

Inspect all reports before ensure. Startup only inspects; it never creates
indexes or repairs data. Fresh stacks use the shared Mongo init script and hook
template; existing volumes do not rerun initialization. V adds 21 nonunique
simple-collation lookup indexes across seven collections. Omitted current
selectors prepare 70 scopes across 27 collections, including other promoted groups. Loaded safe-mode
Waterline installs only `_id`, despite `Entity.indexes` declaring uniqueness.
In particular `figshareSourceKey` defaults to `''`, so adding its declared sparse
unique index would break the second ordinary vocabulary. V preserves baseline
duplicates and does not introduce those constraints. Matching operator-installed
unique indexes, including sparse source keys, are retained and qualified; other
conflicts stop preparation. Never drop or replace constraints during cutover.
Reconsidering these declarations requires a separate decision and data inventory.

`getVocabularyRepositories(app)` exposes plain DTOs and closed selections for
explicit vocabulary, entry, source, category, crosswalk, mapping and run
operations. The three services preserve their public interfaces. Controllers,
policies, bootstrap data, form hydration and RVA consumers continue through
those services. Four brand-scoped catalogue query targets route by V's selector.
P9 replaces the temporary brand-name resolver with the B-owned plain repository
lookup: both V adapters now follow B independently, including explicit Waterline
rollback. See [B operations](p9-b-operations.md). The
three deprecated ignored optional connection arguments remain for hook source
compatibility. New hooks should use the plain operations.

Driver readiness rejects custom loaded mappings/defaults/callbacks, datastores,
field/collection names, identity types, unsupported stored BSON and collation.
Keep institution V on Waterline until its overrides have explicit operations and
both-backend qualification. Historical missing fields remain missing on reads;
there is no data rewrite. ObjectId identities and associations, ISO string times,
JSON snapshots and string sync-run references retain their physical mapping.
The driver reuses one application-owned foundation client, with lazy loading,
readiness and draining; no per-model pools are created.

TX-PARITY-01 applies to every multi-step operation. Retain write order and the
existing best-effort compensation. A later failure can leave earlier writes:
reorder leaves an earlier order update; approval leaves earlier approved mappings
while the crosswalk remains draft; RVA metadata failure leaves imported entries;
resync leaves earlier mirror changes with the old source cursor. Fresh-apply
cleanup removes only registered new objects. A clone failure before its helper
returns can leave an unregistered partial clone. Inspect these objects before
retrying; do not infer that an error rolled them back. The live rehearsal uses
fresh preview after a failed resync and retry after a failed RVA metadata write.

The `applying` latch is the existing read/select/write sequence, **not an atomic
claim**: sails-mongo fetches matching IDs, updates those IDs without rechecking
state, then reads the results. Two overlapping callers can both succeed. V's
adapter deliberately preserves this window. An ordinary subsequent claim misses;
terminal transitions remain service-enforced. After interruption inspect the run,
source hash/cursor, vocabulary entries, mappings and created object IDs before
using the existing preview/apply flow. Do not reset an `applying` run while an
old worker could still be writing. Stronger fencing/recovery requires its own
decision; the backend switch does not provide it.

Also preserve partial-update self-parenting when no submitted entry `id` exists,
ID-dependent cycle/same-vocabulary checks, stored untrimmed identifiers despite
trimmed lookup, omitted category-path rejection, slug suffix stripping/regeneration,
and source-key deletion from the patch without unsetting the stored field.
These are characterized baseline quirks, not new validation guarantees.

For configuration rollback, drain and close the app, select Waterline, and
restart on the same unchanged namespaces/indexes. For code rollback restore the
pre-V image with matching hooks/config/assets and compatible selections for
later groups. The locally built ARM64 artifact in the validation manifest proved
all-seven-entity reads and writes in both directions. It is the installed pre-V
core/storage snapshot, not a clean production-pruned full private portal image.
Retain the institution's actual deployment artifact and rehearse its restore.
Backend rollback does not change MongoDB/FCV/topology or undo writes. Restoring
a checkpoint is a separate operator action requiring reconciliation of later
changes and external effects.

Bounded synthetic budgets remain p95 <=1.20x, throughput >=0.90x, RSS <=1.10x,
DB calls <=1.25x, readiness <250ms, one shared driver client, and application
connections returning to baseline. See [validation](p8-v-validation.md). The
qualification uses standalone MongoDB 9.0.4/FCV 9.0 on OCI ARM64; it adds no
replica set or transaction prerequisite. Official release, institution mappings,
production auth/failover and PostgreSQL qualification remain separate gates.

Handoff: B must replace `WaterlineVocabularyBrand` with its explicit brand-name
lookup and qualify institution name overrides. U/security owners retain current
brand/user authorization checks and actor fields; V does not supply stronger
fencing or approval isolation. Remaining S/Counter and B/U work must follow
TX-PARITY-01 over older transaction-gated prose: preserve existing intermediate
writes and certified/ambiguous outcomes until a separate consistency decision.
P11 must retain the seven model/shim definitions until the entire Waterline
association graph and explicit rollback readers can be retired together.
