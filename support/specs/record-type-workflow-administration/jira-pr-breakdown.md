# Jira and Pull-Request Breakdown

## 1. Planning model

Create one Jira epic for the release and three implementation stories aligned to stacked PRs. Create the listed subtasks beneath each story. Cross-cutting release tasks may be a fourth release/readiness story if the team prefers; they are not a fourth code PR by default.

Suggested epic title:

> Secure self-service record-type and workflow administration

Epic outcome:

> Administrators can safely manage brand-scoped record-type/workflow definitions through versioned drafts and published revisions, with all executable behavior selected from a code-owned action registry and no legacy eval or generic ActionController pathway.

## 2. Epic acceptance criteria

- Administrators can clone, edit, validate, publish, inspect history, roll back, and retire a record-type/workflow definition for their brand.
- Published workflows contain explicit manual and automatic transitions.
- All shipped legacy record hooks migrate to registered action bindings or stop the upgrade with an actionable error.
- Database content cannot select arbitrary code, services, methods, modules, or helpers.
- The old ActionController route is removed.
- Draft/publish concurrency, audit, brand isolation, cache convergence, and write-only secrets are verified.
- A representative multi-brand upgrade completes successfully and an unknown-action upgrade fails closed.
- The three PRs are deployed together.

## 3. Story/PR 1 — Action registry and safe execution foundation

Suggested story title:

> Introduce the registered action runtime and remove unsafe execution paths

Mapped implementation tasks: `A01`–`A12`.

### Proposed Jira subtasks

#### ACT-01 — Inventory and characterize legacy record hooks

- Maps to: `A01`
- Depends on: none
- Deliverables: machine-readable inventory, representative fixtures, ordering/mutation characterization tests.
- Done when: every shipped expression and nested callback is classified and scan counts reconcile.

#### ACT-02 — Define action descriptors, bindings, contexts, results, and schemas

- Maps to: `A02`
- Depends on: ACT-01
- Deliverables: exported TypeScript contracts, runtime validators, parameter schema vocabulary, tests.
- Done when: invalid contracts, unknown properties, unsafe IDs, invalid result/patch shapes, and policy excesses fail deterministically.

#### ACT-03 — Register actions through the ReDBox hook loader

- Maps to: `A03`
- Depends on: ACT-02
- Deliverables: hook capability, `registerRedboxActions()`, core registry, provenance, loader tests/docs.
- Done when: duplicate IDs and malformed registration fail startup without hook-priority override.

#### ACT-04 — Resolve and prevalidate action plans

- Maps to: `A04`
- Depends on: ACT-02, ACT-03
- Deliverables: resolver, binding validator, dependency validation, UI-safe descriptor serialization.
- Done when: persisted values cannot reach a service/global/module resolver and all plans validate before side effects.

#### ACT-05 — Harden JSONata and Handlebars

- Maps to: `A05`
- Depends on: ACT-02
- Deliverables: curated contexts, limits, interruptible JSONata execution or constrained subset, security tests.
- Done when: context escape, excessive resource use, forbidden helpers, and unsafe diagnostics fail safely.

#### ACT-06 — Define write-only secret parameter provider

- Maps to: `A06`
- Depends on: ACT-02
- Deliverables: provider interface, stable slot addressing, redaction and isolation tests.
- Done when: secret values cannot enter serializable action bindings or cross brand/binding boundaries.

#### ACT-07 — Enforce immutable action inputs and typed outputs

- Maps to: `A08`
- Depends on: ACT-01, ACT-02
- Deliverables: executor integration, result/patch enforcement, safe output dependencies.
- Done when: direct mutation and invalid patches cannot affect authoritative candidates.

#### ACT-08 — Register and migrate built-in actions

- Maps to: `A07`
- Depends on: ACT-03–ACT-07
- Deliverables: descriptors/handlers, legacy mapping transforms, per-action tests.
- Done when: every inventory entry is mapped/tested or intentionally rejected with guidance.

#### ACT-09 — Replace record hook eval with registry execution

- Maps to: `A09`
- Depends on: ACT-04, ACT-07, ACT-08
- Deliverables: RecordsService/TriggerService integration and record-audit execution summaries.
- Done when: create/update/delete/transition paths contain no function-string execution and preserve characterized ordering.

#### ACT-10 — Replace transitionWorkflow with automatic transitions

- Maps to: `A10`
- Depends on: ACT-05, ACT-09
- Deliverables: priority/first-match engine, one-transition-per-save enforcement, migration behavior.
- Done when: legacy conditional transition examples execute through explicit graph edges.

#### ACT-11 — Remove the legacy ActionController

- Maps to: `A11`
- Depends on: none
- Deliverables: route/controller/config/auth/shim/test/doc removal.
- Done when: the route is absent and no runtime `sails.config.action` invocation remains.

#### ACT-12 — Prevent new unsafe expression execution

- Maps to: `A12`
- Depends on: ACT-01
- Deliverables: inventory, bounded legacy allowlist, static regression guard, follow-up tickets.
- Done when: managed paths require no allowlist and a deliberately unsafe fixture fails the guard.

### PR 1 review gates

- Registry contracts are stable enough for PR 2 persistence and PR 3 UI consumers.
- Every shipped managed record hook has an owner and migration outcome.
- Record operations no longer execute persisted function strings.
- Automatic transition semantics are covered by tests.
- The ActionController is removed.
- Any behavior deviation from characterization fixtures is explicit in the PR description.

## 4. Story/PR 2 — Versioned record-type/workflow backend

Suggested story title:

> Add versioned brand-scoped definition management, publication, and migration APIs

Mapped implementation tasks: `B01`–`B11`.

### Proposed Jira subtasks

#### DEF-01 — Define aggregate persistence and API contracts

- Maps to: `B01`
- Depends on: ACT-02, ACT-10
- Done when: stable identity, draft, revision, stage, transition, action-binding, validation, impact, history, and conflict DTOs are validated and versioned.

#### DEF-02 — Add definition lifecycle models and indexes

- Maps to: `B02`
- Depends on: DEF-01
- Done when: brand/key identity, one draft, immutable revision numbering, history, and secret-slot constraints are enforced.

#### DEF-03 — Implement canonicalization and authoritative validation

- Maps to: `B03`
- Depends on: ACT-04, ACT-05, DEF-01
- Done when: canonical hashes are deterministic and every publication invariant has positive/negative tests.

#### DEF-04 — Implement shared draft lifecycle and concurrency

- Maps to: `B04`
- Depends on: DEF-02, DEF-03
- Done when: clone/get/save/discard are brand-isolated, drafts never affect runtime, and stale edits cannot overwrite newer work.

#### DEF-05 — Implement publish, history, rollback, and retirement

- Maps to: `B05`
- Depends on: DEF-02–DEF-04
- Done when: active-pointer CAS has one winner, revisions are immutable, rollback is monotonic, and audit/history is durable and redacted.

#### DEF-06 — Resolve active definitions with coherent caching/readiness

- Maps to: `B06`
- Depends on: DEF-02, DEF-05
- Done when: publication is visible without restart, drafts are never resolved, multi-instance convergence is bounded, and active missing actions fail readiness.

#### DEF-07 — Implement authoritative manual transitions

- Maps to: `B07`
- Depends on: DEF-03, DEF-06, ACT-09, ACT-10
- Done when: source stage, roles, eligibility, validation operation, CAS, actions, persistence, and audit are server authoritative.

#### DEF-08 — Persist and resolve protected secret slots

- Maps to: `B08`
- Depends on: ACT-06, DEF-02
- Done when: retain/replace/clear, clone, rollback, redaction, and cross-brand tests pass.

#### DEF-09 — Expose brand-scoped Admin APIs

- Maps to: `B09`
- Depends on: DEF-04, DEF-05, DEF-07, DEF-08
- Done when: routes/controllers/auth/CSRF/brand isolation and Bruno coverage pass with no secret or handler exposure.

#### DEF-10 — Replace destructive bootstrap with create-only seeds

- Maps to: `B10`
- Depends on: DEF-02, DEF-03, DEF-05
- Done when: startup is idempotent and never overwrites administrator-owned definitions.

#### DEF-11 — Add preflight and breaking multi-brand upgrade migration

- Maps to: `B11`
- Depends on: ACT-08, DEF-02, DEF-03, DEF-05, DEF-10
- Done when: known multi-brand fixtures migrate without executable strings, unknown expressions stop startup, and partial reruns are safe.

### PR 2 review gates

- The database model cannot expose drafts as runtime definitions.
- Publication is concurrency-safe and produces immutable audit/history.
- All endpoints enforce Admin, CSRF, expected versions, and brand isolation.
- Existing records cannot be stranded by stage-key deletion/rename.
- Bootstrap cannot overwrite administrative changes.
- The migration is fail-closed, idempotent, and tested across brands.

## 5. Story/PR 3 — Administration UI and end-to-end verification

Suggested story title:

> Build the record-type and workflow administration interface

Mapped implementation tasks: `C01`–`C09`.

### Proposed Jira subtasks

#### UI-01 — Scaffold embedded admin app and typed CSRF HTTP service

- Maps to: `C01`
- Depends on: DEF-01 and stable DEF-09 API contracts
- Done when: app builds/mounts under branded Admin navigation and service tests verify URLs and CSRF context.

#### UI-02 — Implement record-type list, clone, and retirement

- Maps to: `C02`
- Depends on: UI-01, DEF-09
- Done when: active/draft/retired state, clone validation, and retirement confirmation are fully tested.

#### UI-03 — Implement record-type settings editor

- Maps to: `C03`
- Depends on: UI-01, DEF-04
- Done when: all in-scope business settings are editable with path-addressed server errors and draft conflict handling.

#### UI-04 — Implement stage and transition editor

- Maps to: `C04`
- Depends on: UI-01, DEF-03, DEF-04
- Done when: structured editing covers stage order, roles, forms, manual/automatic transitions, priorities, conditions, validation operations, and immutable key rules.

#### UI-05 — Implement action binding, Formly parameters, and secrets

- Maps to: `C05`
- Depends on: UI-01, ACT-02, DEF-08, DEF-09
- Done when: controlled schema conversion, context filtering, dependencies, policy bounds, and write-only secret behavior are tested.

#### UI-06 — Implement accessible workflow graph preview

- Maps to: `C06`
- Depends on: UI-04
- Done when: graph and textual equivalent expose all edges, priorities, conditions, and invalid states without becoming the editing authority.

#### UI-07 — Implement validation, impact, publish, conflict, and discard flows

- Maps to: `C07`
- Depends on: UI-03–UI-05, DEF-05, DEF-09
- Done when: publication and concurrency errors are actionable and no flow silently loses draft work.

#### UI-08 — Implement history, diff, and rollback

- Maps to: `C08`
- Depends on: UI-01, DEF-05, DEF-09
- Done when: immutable history, redacted diffs, required rollback reason, and monotonic new revision behavior are verified.

#### UI-09 — Add browser-level administration coverage

- Maps to: `C09`
- Depends on: UI-02–UI-08
- Done when: Admin and denial journeys cover clone through rollback, including conflicts, secrets, and runtime transitions.

### PR 3 review gates

- The UI follows the embedded Angular/EJS and CSRF service patterns.
- Client validation is never treated as authoritative.
- Workflow editing is structured and keyboard accessible; the graph is preview-only.
- Secret values are never returned or retained after submission.
- Browser verification covers the complete lifecycle and authorization denial.

## 6. Release/readiness story

Suggested story title:

> Document, rehearse, and release the secure definition-management stack

Mapped tasks: `R01`–`R03`.

### Proposed Jira subtasks

#### REL-01 — Update architecture, administrator, hook-author, and migration documentation

- Maps to: `R01`
- Depends on: ACT-12, DEF-11, UI-09

#### REL-02 — Rehearse representative multi-brand upgrade and recovery

- Maps to: `R02`
- Depends on: all implementation tasks and REL-01

#### REL-03 — Complete release evidence and deployment gate

- Maps to: `R03`
- Depends on: REL-02

## 7. Safe parallelization map

After ACT-01 completes:

- ACT-02, ACT-11, and ACT-12 can proceed in parallel.
- ACT-05 may begin when ACT-02 is stable.
- ACT-03 and ACT-07 can proceed in parallel after ACT-02.
- ACT-06 can proceed independently after ACT-02.

After DEF-01/DEF-02:

- DEF-03 and DEF-08 can proceed in parallel.
- UI-01 may begin against stable API contracts while DEF services are implemented.
- DEF-06 and DEF-09 must wait for their service dependencies.

After UI-01:

- UI-02, UI-03, UI-04, and UI-05 may proceed in parallel if component/file ownership is separated.
- UI-06 waits for UI-04.
- UI-07 waits for the editors and publication APIs.
- UI-08 may proceed alongside UI-07.

## 8. High-conflict file ownership

The orchestrator should serialize or explicitly coordinate work touching:

- `packages/redbox-core/src/services/RecordsService.ts`;
- `packages/redbox-core/src/services/TriggerService.ts`;
- `packages/redbox-core/src/config/recordtype.config.ts`;
- `packages/redbox-core/src/config/workflow.config.ts`;
- loader registration/index files;
- model/controller/service export indexes;
- `routes.config.ts` and `auth.config.ts`;
- `angular/angular.json`;
- root/package test scripts;
- shared DTO barrel exports.

Contract tasks should land before implementation threads modify these files. Threads working concurrently must coordinate generated shims and index updates rather than overwriting one another.

## 9. Evidence template for delegated threads

Each thread should report:

```text
Task ID:
Outcome:
Files changed:
Contracts added/changed:
Tests added:
Commands run and results:
Migration/compatibility impact:
Security considerations checked:
Documentation updated:
Known limitations or follow-ups:
Checklist items completed:
```

A report without test evidence or with unresolved checklist items is not completion.

## 10. Release ordering

1. Review/merge PR 1 foundation.
2. Rebase and review/merge PR 2 backend/migration.
3. Rebase and review/merge PR 3 administration UI.
4. Build one deployment artifact containing all three.
5. Run migration preflight against a production-like backup.
6. Resolve every unknown mapping before deployment.
7. Deploy with the documented migration and readiness procedure.
8. Verify Admin UI, active definitions, representative saves/transitions, caches, and audit.

Do not deploy a state where PR 1 has removed legacy execution but PR 2 has not migrated definitions, or where PR 2 APIs are deployed without the corresponding reviewed UI/security verification.
