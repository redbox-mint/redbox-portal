# Record-Type and Workflow Administration

## Purpose

This specification defines the secure, brand-scoped administration of record types and workflows in ReDBox Portal v5. It also replaces configurable function strings with a code-owned action registry.

The work is one release delivered as a stack of three review-oriented pull requests:

1. Action registry and safe execution foundation.
2. Versioned record-type/workflow backend, migration, and APIs.
3. Administration UI and end-to-end verification.

The PR boundaries are not release boundaries. All three PRs must be deployed together.

## Documents

- [Architecture](architecture.md): domain model, trust boundaries, runtime behavior, APIs, publishing, migration, and operational design.
- [Decision log](decision-log.md): confirmed design decisions, rationale, consequences, and change-control procedure.
- [Implementation plan](implementation-plan.md): dependency-ordered, orchestrator-ready checklist with task ownership boundaries, acceptance criteria, and evidence requirements.
- [Jira and PR breakdown](jira-pr-breakdown.md): proposed epic/stories, PR composition, dependency graph, and release gates.

## Locked decisions

- Record types and workflows are database-backed and scoped through branding.
- A record type is a stable identity with one shared draft, immutable published revisions, and an active-revision pointer.
- A revision is an aggregate containing record-type settings, workflow stages, explicit transitions, and configured action bindings.
- Existing records resolve the currently active definition; records are not pinned to historical revisions.
- A published stage key referenced by records cannot be renamed or removed in this release.
- Executable behavior is code-owned and globally registered. Administrators configure only registered action bindings and validated parameters.
- Direct `eval`, configurable service/method resolution, and unsafe Lodash templates are prohibited in the managed record/workflow path.
- The legacy ActionController and `sails.config.action` execution route are removed.
- JSONata is used for conditions/mappings and Handlebars for text templates, with curated contexts and resource limits.
- Automatic transitions are explicit graph edges with JSONata conditions, unique priorities, first-match semantics, and at most one automatic transition per save.
- Manual transitions have explicit roles and optional server-authoritative eligibility conditions.
- Actions receive immutable, curated contexts and return typed results or validated patches.
- Secret parameters are write-only and stored outside definition revisions through stable secret slots. External secret-manager integration is deferred.
- Bootstrap definitions are versioned, create-only seeds. Existing definitions change only through explicit migrations or administration.
- Legacy expression migration is breaking and fail-closed. There is no compatibility eval fallback.
- The first UI supports cloning, editing, validation, publication, history, rollback, retirement, and a read-only workflow graph. Blank-slate record-type creation is deferred.
- Access is restricted to the existing `Admin` role for this release. A separate permissions/scopes initiative will replace this coarse authorization later.
- Other unsafe expression sites are inventoried and prevented from growing, but remediation outside managed record/workflow configuration is follow-up work.

## Explicitly deferred

- Self-service form construction.
- Blank-slate record-type creation.
- External secret-manager providers such as AWS Secrets Manager.
- Registry-backed interactive/button actions.
- A replacement for the removed ActionController.
- Bulk migration of records between renamed or removed stages.
- Automatic transition chaining within one save.
- Stage-entry and stage-exit action attachment points.
- Full system-wide removal of every legacy eval/template pathway.
- Fine-grained administration permissions and scopes.
- Visual drag-and-drop workflow authoring.
- General export/import; deployment promotion uses versioned bootstrap data.

## Definition of complete

The initiative is complete only when every required task in [the implementation plan](implementation-plan.md) is checked, all three PR release gates pass, every shipped legacy record hook has an explicit migration mapping, representative multi-brand upgrades succeed without eval fallback, and the administrator browser journey passes end to end.
