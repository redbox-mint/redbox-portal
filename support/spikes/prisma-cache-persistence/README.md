# Archived Prisma cache spike

The cache now uses the official driver under accepted ADR0003. This standalone
Prisma pilot is retired; no build, install or freshness step depends on it.

Keep the results in `support/specs/prisma-cache-persistence/` (P1–P6 and the
historical P7 assessment) and `support/specs/waterline-retirement/evidence/c2/`.
The complete prior source, manifests, locks, generated contracts and harnesses
are available at qualification commit `ac39fa987` with their original paths.
Use that frozen source in an isolated environment only when reproducing history;
current root/core do not install Prisma. The separately retained ORM re-evaluation
spike explains the accepted architectural decision and is not a core dependency.
