# Decision Log

All decisions below were confirmed during the design interview. Changes should be made explicitly in this document and propagated to the architecture, implementation plan, and Jira breakdown.

| ID  | Decision                                                                                                                      | Rationale / consequence                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| D01 | Deliver registry, record-type administration, and workflow administration as one release split into three stacked review PRs. | Contracts and migration must remain coherent; PRs are not independently deployable.        |
| D02 | Keep database persistence and existing brand ownership.                                                                       | `RecordType` already belongs to branding and `WorkflowStep` belongs to a record type.      |
| D03 | Treat administrator input as hostile data.                                                                                    | Admin authorization does not justify server-side code execution.                           |
| D04 | Make action implementations code-owned and globally registered.                                                               | Persisted data selects stable capabilities but never code paths.                           |
| D05 | Use shared drafts, explicit validation, immutable publication, audit, and rollback.                                           | Runtime must never observe partial or mutable configuration.                               |
| D06 | Make the change breaking, with explicit migration and no eval fallback.                                                       | Retaining legacy execution would preserve the vulnerability.                               |
| D07 | Publish record-type settings, workflow, transitions, and action bindings as one aggregate revision.                           | Prevent incompatible independently versioned combinations.                                 |
| D08 | Existing records use the active revision rather than being pinned.                                                            | Avoid indefinitely operating many workflow versions.                                       |
| D09 | Duplicate action IDs fail startup; hook priority does not override them.                                                      | Persisted semantics must not change because dependency ordering changes.                   |
| D10 | Action descriptors enumerate supported contexts/phases and policy bounds.                                                     | The UI cannot configure unsupported or unsafe invocation behavior.                         |
| D11 | Actions receive immutable curated contexts and return typed results/patches.                                                  | Existing actions may require refactoring; arbitrary mutation is removed.                   |
| D12 | Use a controlled action-parameter schema rendered through Formly.                                                             | Reuse UI machinery without accepting arbitrary Formly definitions.                         |
| D13 | Each parameter declares literal, JSONata, Handlebars, or secret semantics.                                                    | Users cannot turn ordinary strings into expressions.                                       |
| D14 | Replace stage-centric `next` configuration with explicit transition edges.                                                    | Supports branching, authorization, validation, automatic behavior, and transition actions. |
| D15 | Preserve published/referenced objects; use retirement and immutable history.                                                  | Prevent dangling records and broken audit continuity.                                      |
| D16 | Use existing `Admin` authorization temporarily.                                                                               | Fine-grained permissions/scopes are being developed separately.                            |
| D17 | Use one shared optimistic-concurrency-controlled draft per record type.                                                       | Supports collaboration without silent overwrites.                                          |
| D18 | Keep `RecordType` as stable identity pointing to immutable aggregate revisions.                                               | Separates identity from runtime definition content.                                        |
| D19 | Use a mutable draft snapshot and freeze a copy only on publication.                                                           | Avoid permanent revision noise from editing.                                               |
| D20 | Preserve current observable action ordering through characterization tests.                                                   | Security refactoring should not casually change business behavior.                         |
| D21 | Registry handlers are direct function references, never service/method strings.                                               | Prevents persisted property traversal from becoming code resolution.                       |
| D22 | Version action contracts and migrate breaking changes.                                                                        | Persisted bindings must survive package upgrades safely.                                   |
| D23 | Defer registry-backed interactive actions and buttons.                                                                        | No current consumer justifies the additional auth/input/output surface.                    |
| D24 | Treat stage keys as stable; label changes are ordinary edits.                                                                 | Records persist stage keys.                                                                |
| D25 | Use a structured workflow editor with a read-only graph preview.                                                              | Reduces accessibility and state complexity while retaining comprehension.                  |
| D26 | Block invalid graphs, references, actions, roles, and existing-record impacts at publication.                                 | Publication is the authoritative safety boundary.                                          |
| D27 | Store write-only secrets separately through stable slots.                                                                     | Revisions, history, APIs, logs, and diffs must not disclose them.                          |
| D28 | Rollback publishes a new monotonic revision.                                                                                  | Preserves honest history and reruns current validation.                                    |
| D29 | Give action bindings stable IDs and explicit order; repeats require descriptor permission.                                    | Supports deterministic execution and auditable dependencies.                               |
| D30 | Remediate unsafe execution in managed record/workflow fields now; inventory other sites separately.                           | Keeps scope deliverable without falsely claiming system-wide remediation.                  |
| D31 | Stop destructive startup synchronization; bootstrap data is versioned and create-only.                                        | Database administration becomes authoritative after initial creation.                      |
| D32 | Unknown legacy action expressions fail migration.                                                                             | Partial conversion cannot safely enter runtime.                                            |
| D33 | Support record lifecycle and transition attachments; defer stage-entry/exit attachments.                                      | Covers current behavior without duplicate ambiguous hooks.                                 |
| D34 | Use versioned curated action/expression contexts.                                                                             | Prevents access to request, services, environment, filesystem, and secrets.                |
| D35 | Bound and interrupt administrator-authored JSONata execution.                                                                 | Helper restrictions alone do not prevent CPU/memory denial of service.                     |
| D36 | Do not add bulk stage migration in this release.                                                                              | Publication blocks removal/rename while records reference a stage.                         |
| D37 | Audit brand, actor, operation, revisions, hashes, validation, impact, and bounded diff.                                       | Definition changes are security- and operations-relevant.                                  |
| D38 | Use bootstrap data rather than general export/import.                                                                         | Matches established deployment promotion patterns.                                         |
| D39 | Permit incomplete drafts but require full publication validity.                                                               | Authors need workable intermediate states without runtime risk.                            |
| D40 | Resolve runtime definitions by active revision with coherent bounded caching.                                                 | Publication must take effect without restart across processes.                             |
| D41 | Active missing actions fail node readiness; draft missing actions are validation errors.                                      | Nodes must not serve incomplete business behavior.                                         |
| D42 | Migrate each brand from its own persisted rows.                                                                               | Prevents default-brand configuration from overwriting tenant-specific state.               |
| D43 | Remove the legacy ActionController now.                                                                                       | It is unused and contradicts the new security boundary.                                    |
| D44 | Add static protection against new eval/unsafe configuration templates.                                                        | Prevents the known class of vulnerability from spreading.                                  |
| D45 | Require comprehensive unit, integration, API, Angular, browser, and upgrade evidence.                                         | The feature crosses persistence, execution, security, and UI boundaries.                   |
| D46 | Use action definition, action binding, transition, condition, draft, and revision terminology.                                | Avoids confusion with Sails hooks and legacy triggers.                                     |
| D47 | Model conditional workflow changes as first-class automatic transitions.                                                      | Makes the workflow graph accurate and uses one authoritative transition engine.            |
| D48 | Automatic transitions use unique priority, first-match semantics, and one hop per save.                                       | Prevents ambiguity, loops, and surprising multi-stage changes.                             |
| D49 | Existing action-specific nested callbacks become generic ordered dependencies.                                                | Removes nested executable configuration and exposes orchestration uniformly.               |
| D50 | Clone existing record types; defer blank-slate creation.                                                                      | New blank types depend on form and deployment/storage choices not yet self-service.        |
| D51 | Expose business-facing record/stage settings; keep deployment-owned fields read-only.                                         | Avoids presenting storage/runtime settings as safe tenant configuration.                   |
| D52 | Transition conditions are server-authoritative for manual and automatic transitions.                                          | UI visibility cannot grant or prove eligibility.                                           |
| D53 | Manual transitions declare roles constrained by source-stage authorization.                                                   | Supports distinct workflow responsibilities without broad stage permissions.               |
| D54 | Secret-manager providers are deferred; retain a provider seam.                                                                | Write-only input is needed now, external provider integration later.                       |
| D55 | Action dependencies inspect only schema-declared safe output fields.                                                          | Avoids brittle coupling and data leakage.                                                  |

## Change control

When changing a decision:

1. Record the replacement decision and reason here.
2. Identify affected task IDs.
3. Update architecture contracts and invariants.
4. Update Jira acceptance criteria and PR gates.
5. Re-run migration/security impact review before implementation continues.
