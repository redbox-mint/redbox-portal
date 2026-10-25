# Independent Spec review — R6

Read-only review delivered at initial HEAD `c45385001`; findings below are the
reviewer's report, before parent-agent remediation. No edits, commits, branch
changes, delegation or heavy suites were performed by this reviewer.

Two reproduced **class-A P2 findings**:

- **SQS-only startup requires unselected Agenda Mongo indexes.**
  `packages/redbox-core/src/application/portal/application.ts:397` passes raw
  queue options into startup preflight. In-memory probes executed actual
  composition and index implementations: exclusively SQS jobs report maintenance
  ready, while startup requests the unselected Agenda Mongo connection and
  reports three missing indexes. Initialization rejects. `maintenance-v6.md:75`:
  “Mongo Agenda descriptors are included when selected jobs/default backend use
  Mongo.” New production composition. Apply `selectedAgendaMongoOptions` at
  normal startup as well.
- **Generated controller routes cannot bind production policies.**
  `packages/redbox-dev-tools/src/utils/config-helper.ts:106` emits
  `access: ['authenticated']`. Actual `updateRoutes` execution using ts-morph's
  in-memory filesystem, followed by production `createHttpPolicies` and
  `bindHttpPolicies`, throws `HTTP route requires an unbound policy: authenticated`.
  `PortalHttp` binds that same map and has no `authenticated` entry. Including
  generated routes and binding handlers prevents preparation. `design.md:526`:
  “Registered handlers participate in the host’s context, policy and accepted-work
  rules”; §7.4 requires ported dev-tool archetypes. Rewritten v6 generator.

No additional reproduced A finding or new B suggestion from this bounded sweep.
Accepted institution gaps remain unchanged.
