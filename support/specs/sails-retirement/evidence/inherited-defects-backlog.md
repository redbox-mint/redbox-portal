# Inherited defects retained for separate follow-up

Round 5 applies the feature gate to `a49366803..39ad5813c`. These three P2
items remain unchanged in behavior from the pre-retirement path. None is an
unauthenticated or cross-tenant access/privilege-escalation exception. Already
fixed R1–R4 defects are not duplicated here. Locations refer to round 5's source.

The executable [service-port probes](final-review-r5/inherited-probes.cjs) run
against the rebuilt packages in the Node 26 test container:

```sh
node support/specs/sails-retirement/evidence/final-review-r5/inherited-probes.cjs
```

These are deterministic port interleavings and error observations, not claims
that a real-Mongo or public HTTP exploit was executed. The two extension helpers
below have no selected production caller; R3's enumeration already identified
them. Production authentication uses the awaited Accounts methods instead.

## B-01 — P2: concurrent same-brand role replacements can merge requested sets

**Location:** `packages/redbox-core/src/identity/Users.ts:1352` and
`packages/redbox-core/src/persistence/identity/PrismaIdentityRepositories.ts:194`.

**Reproduction:** pause replacement A after its membership deletion, complete
replacement B with only `member`, then release A's insertion of only `admin`.
The actual Users method leaves both roles. The probe reproduces this for scoped
and unscoped calls. Admin authorization is required by the HTTP entrance; this
is not a normal user's means of acquiring privileges. R4 correctly protects
foreign-brand changes but does not promise serialized edits within one brand.

**Inheritance:** base `PrismaIdentityRepositories.ts:194–222` already implements
replacement as `remove` followed by per-edge `add`; base
`services/UsersService.ts` uses that replacement. Its comment expressly preserves
Waterline's delete-before-insert partial failure. Same-brand concurrency and
partial insertion failures are consequently older behavior, not a fault
introduced by R4's narrower deletion predicate.

**Suggested fix:** design an atomic/versioned membership replacement or durable
per-user serialization that works across processes; return a conflict for a
stale replacement. Preserve foreign-brand edges and qualify real concurrent
writes and injected insert failure. A process-local mutex alone is insufficient
for multiple writers.

## B-02 — P2: legacy email template helper drops completion and errors

**Location:** `packages/redbox-core/src/integrations/Email.ts:254`.

**Reproduction:** call `sendTemplate` with a successful template Observable and
a gated delivery Observable. It returns `undefined` while delivery remains
subscribed. Reject delivery: RxJS reports an unhandled error rather than a
caller-visible failure. The probe observes `config.onUnhandledError` in its
isolated process. An extension calling this helper cannot await completion or
register the returned work with its owner.

**Inheritance:** base `services/EmailService.ts:222–237` has the same nested
subscriptions and void return. R3's async appendix explicitly noted this
unselected exported helper. No selected production invocation was found in R5;
the owned record-notification path is separate and already fixed.

**Suggested fix:** replace the nested subscriptions with a returned, composed
Observable/Promise, propagate errors, and bind accepted work at actual extension
callers. Document any return-contract change; retain delivery drain/error tests.

## B-03 — P2: legacy Users post-save wrapper discards the Accounts Promise

**Location:** `packages/redbox-core/src/identity/Users.ts:788`.

**Reproduction:** supply an Accounts post-save operation whose Promise is still
gated, then call `Users.triggerPostSaveTriggers`. The wrapper immediately returns
`undefined`; its caller has no handle to await/register, and a rejected operation
has no rejection handler at this wrapper. The probe verifies the lost handle
with a resolving gate, avoiding an intentional process-level rejection.

**Inheritance:** base `services/UsersService.ts` has the same void wrapper around
`authenticationAccounts().triggerPostSaveTriggers`. R3's async appendix already
identifies it as unselected. Production Accounts create/update/login paths await
their own post-save operations and do not call this wrapper.

**Suggested fix:** return/await the Accounts Promise and require extension callers
to retain it within their admitted lifetime; add a delayed success/rejection
contract test. Do not replace the already-owned production account path.
