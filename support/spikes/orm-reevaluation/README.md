# Historical ORM re-evaluation

The phase-8 retirement removed this spike's executable candidates, fixtures,
runner, generated output, manifest and lockfile. They compared obsolete engines
and are no longer part of the installed or tested application.

The original research remains in Git history and the frozen
[P0R validation](../../specs/waterline-retirement/p0r-validation.md) and evidence.
[ADR 0004](../../specs/waterline-retirement/adr/0004-prisma-for-all-persistence.md)
supersedes that architecture: all application persistence uses Prisma.
