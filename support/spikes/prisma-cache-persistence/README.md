# Archived Prisma cache spike

The cache now uses Prisma under accepted
[ADR 0004](../../specs/waterline-retirement/adr/0004-prisma-for-all-persistence.md),
which supersedes ADR 0003. This standalone Prisma pilot is retired; no build,
install or freshness step depends on it.

Keep the results in `support/specs/prisma-cache-persistence/` (P1–P6 and the
historical P7 assessment) and `support/specs/waterline-retirement/evidence/c2/`.
The complete prior source, manifests, locks, generated contracts and harnesses
are available at qualification commit `ac39fa987` with their original paths.
Use that frozen source in an isolated environment only when reproducing history;
the current core installs `@prisma/orm-mongo` 8.0.0-rc.19 and uses `prisma`
8.0.0-rc.24 to generate its contracts. For the current setup, see ADR 0004 and
`packages/redbox-core/scripts/prisma-contract.cjs` (`npm run generate:prisma`
and `npm run check:prisma` in that package). The separately retained ORM
re-evaluation spike records the earlier ADR 0003 assessment and is not a core
dependency.
