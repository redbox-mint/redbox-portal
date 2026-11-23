# Fastify migration

Revision 5 passed G7 local qualification. `node app.js` starts the selected
Fastify runtime. The G8 maintenance-window rehearsal and institutional
production acceptance remain pending.
[G7 closure](evidence/FM-048.md) · [Upgrade and rollback tasks](tasks.md#p8--rehearsal-and-handoff)

The design was agreed through the Grill Me discussion on 2026-11-04. Fastify will
ship as part of v6. The release is planned for late 2027; that is planning context,
not permission to waive the acceptance gates.

Read these documents in order:

1. [Detailed design](design.md): decisions, HTTP and extension contracts, lifecycle,
   integration boundaries, compatibility, and release evidence.
2. [Implementation plan](implementation_plan.md): delivery phases, dependencies,
   review boundaries, and exit gates.
3. [Task list](tasks.md): actionable work and evidence required for completion.

[The original proposal](proposal.md) records the discussion input. Where it differs
from the agreed design, the design takes precedence. The [API2 migration guide](extension-api2.md) documents current extension authoring,
generators, bundled hooks and the local WSU conversion. The wiki describes the
selected Fastify runtime. [Installation and probes](../../wiki/Installation-Guide.md)

Evidence is revision-specific. [FM-041](evidence/FM-041.md) records the G6
reference and consumer qualification.
