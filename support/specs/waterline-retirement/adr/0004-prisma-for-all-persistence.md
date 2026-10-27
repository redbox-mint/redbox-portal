# ADR 0004 — Prisma for all persistence

Status: **ACCEPTED**. Decision date: **2026-10-22**. Decision owner: **user
(Andrew)**. Supersedes the repository-over-driver architecture in
[ADR 0003](0003-orm-reevaluation.md) and the REL-01 cache sub-decision that
removed Prisma from core.

## Decision

- **Prisma is the persistence layer for every group**: cache (C), migration
  ledger (M), reference (R), configuration (Q), jobs (J1–J4), vocabularies (V),
  branding (B), identity (U) and storage (S). Do not keep the codebase split
  between Prisma and driver repositories.
- Groups already moved to driver repositories (C, M, R, Q, J1–J4, V, staged S
  and B) move to Prisma.
- **Waterline is removed.** The end state has no Waterline, `sails-hook-orm` or
  `sails-mongo`.
- **Direct MongoDB driver calls are kept only where Prisma can't do the job**:
  the native operations Waterline-era code already makes directly, for example
  GridFS, index inspection/preparation and other operations Prisma doesn't
  support. Each kept call must be listed with the reason Prisma can't cover it.
  The bar is strict: "can't" means no supported Prisma approach achieves the
  result, including restructuring the operation into several Prisma calls, a
  different query shape, or Prisma's own raw-command APIs. If Prisma can do it
  in any supported way, use Prisma. Inconvenience or a direct call being shorter
  is not a reason to keep it.
- **Prisma raw MongoDB APIs (`$runCommandRaw`, `findRaw`, `aggregateRaw`) are acceptable**
  for porting MongoDB-specific operations. Every use goes in the
  [PostgreSQL rewrite register](../postgres-rewrite-register.md) with its
  location, purpose and what a PostgreSQL version would need, alongside any
  kept direct driver calls.
- **Prisma's MongoDB release candidate is acceptable.** This branch targets v6
  next year, two releases away from users. A stable Prisma MongoDB release is not
  a blocker.

## Model API first — 2026-10-22 (user decision)

Prisma's normal model API is the default for all CRUD so the code ports to
PostgreSQL. Declare every known field in the contract; store genuinely
free-form content as `Json` fields. Prisma returning `null` for a missing
optional field on read is accepted (log it as a quirk); writes must only set
supplied fields so stored documents are not rewritten and Waterline can still
read them. Undeclared extension fields are schema gaps to add to the contract,
not a reason for raw access. Raw Prisma APIs are kept only for operations with
no model-API equivalent: index/catalog inspection and DDL, duplicate-audit
aggregations and stored named-query translation (and anything else that meets
the strict bar above). R and Q (phase 2) are reworked onto the model API before
J1–J4 start.

## GridFS stays on the driver — 2026-10-22 (user decision)

GridFS byte storage stays as direct MongoDB driver calls. PostgreSQL has no
equivalent, so a PostgreSQL deployment that still wants GridFS will keep a
MongoDB instance for it. Register these calls as a permanent native exception;
the PostgreSQL approach is "MongoDB retained for GridFS, or a different binary
store", not a SQL rewrite.

## Rationale

ReDBox will later migrate to PostgreSQL. Prisma provides one schema and client
across MongoDB and PostgreSQL, and PostgreSQL brings transactions out of the
box. Driver-only repositories would need a second, PostgreSQL implementation
written later. ADR 0003 did not present this trade-off clearly when it was
accepted.

## Unchanged

- TX-PARITY-01 / 01a ([design](../design.md)): no transactions are required
  while on MongoDB. Waterline parity is the default; natural improvements are
  allowed and every quirk goes in the [quirk register](../quirk-register.md).
- Container MongoDB image 9.0.4; physical collections and document shapes stay
  the same; Sails is retained; exact dependency pins.

## Agreed plan — 2026-10-22

1. **Foundation:** exact pins `prisma` 8.0.0-rc.24 and `@prisma/orm-mongo`
   8.0.0-rc.19 (or newer RCs when a phase starts; record the pin). Restore
   schema, generation/freshness, build, Docker and CI steps, reusing the removed
   cache work (`4d8ea422d`, `bfdefe344`, `1dee84dc0`) where it fits. One Prisma
   client per logical datastore (`mongodb`, `redboxStorage`), owned by the
   existing app runtime/lifecycle.
2. **Replace driver adapters with Prisma, group by group:** C, M, R, Q,
   J1–J4, V, B, staged S. Plain repository interfaces stay; each group's driver
   adapter is replaced, not kept alongside. Selector values become
   `prisma | waterline` until removal.
3. **Migrate the remaining Waterline groups straight to Prisma:** U, then the
   rest of S. **Counter uses Prisma's atomic `increment`** (user decision,
   replaces read-then-write; quirk S-01 becomes improved).
4. **Remove Waterline** (models, `sails-hook-orm`, `sails-mongo`, loader model
   generation, selectors). Remaining direct driver calls must pass the strict bar
   above; raw Prisma and direct calls go in the PostgreSQL rewrite register.
5. **Final whole-branch review loop**, then the user decides push/PR/split.

**Testing is deliberately light (user decision).** The release will get
extensive real-environment testing with real users before it ships. Per group:
raw documents readable both ways between Prisma and Waterline, the same outcome
when a step fails partway, and the full core, portal Mocha and Bruno suites. No
per-group prior-image builds, operations budget campaigns, mixed-instance
matrices or browser runs. One fuller qualification (rollback, budgets, browser)
runs after Waterline is removed. Earlier per-group gate requirements in
`design.md`/`tasks.md` are superseded where they conflict.
