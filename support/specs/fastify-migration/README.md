# Fastify migration

Status: agreed design; implementation and qualification have not started.

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
from the agreed design, the design takes precedence. Current runtime documentation
in [the wiki](../../wiki/Home.md) continues to describe the implemented Express
composition until the Fastify cutover; these specifications do not claim a working
Fastify implementation.

No runtime code, package versions, external institution checkout, or deployment
has been changed by writing this specification.
