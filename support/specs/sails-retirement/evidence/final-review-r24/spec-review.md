# R24 independent Spec review

Pinned portal `1d579f8e5`, WSU `80b2b80`; read-only incoming review.

**One new A/P2 finding; no P1. R24 is not a zero-finding round.**

**Spec — incorrect implementation:** WSU
`support/development/docker-compose.yml:37` breaks browser login when
`REDBOX_PORTAL_HOST_PORT` changes.

- **Concrete case:** Set `REDBOX_PORTAL_HOST_PORT=18599`, leaving
  `REDBOX_PORTAL_APP_URL` unset. Offline Compose resolution publishes port
  **18599** but configures `REDBOX_PUBLIC_URL=http://localhost:1500`. The
  production CSRF middleware consequently rejects a browser POST from
  `http://localhost:18599` with **403 “Cross-origin request denied”**, despite a
  valid session token. Local login uses this middleware.
- **Baseline comparison:** WSU `14ab99e` derived its default application URL from
  `REDBOX_PORTAL_HOST_PORT`, producing `http://localhost:18599`. The same CSRF
  probe accepts that origin. The conversion introduced the fixed-port default.
- **Requirement:** `design.md:624`: “Preserve local login”. This is a concrete
  counterexample beyond R22's tested default configuration.
- **Suggested correction/regression:** Restore the nested host-port default
  while retaining explicit URL precedence. Test default port, overridden host
  port and explicit application URL through offline Compose resolution; assert
  browser-origin acceptance with the actual CSRF middleware.

**Standards:** No additional actionable documented-standard breach found. No
additional missing/partial requirement or scope creep verified.

Coverage included both pinned deltas, AGENTS instructions, specified contracts,
R18–R23 settlements, institution evidence, WSU service/composition bindings and
qualification safeguards. **29 in-memory baseline/current service scenarios
matched.** Git confirms no portal runtime or dependency-manifest changes since
R20.

Fresh execution was limited to read-only and in-memory probes; historical
suite/image results were not rerun or counted. No files were edited, and no
commits, containers, pushes, publications or tags were created.

This incoming report is retained separately from the main reviewer's subsequent
reproduction and fix at WSU `8dd6111`. The 29 scenarios are reviewer-reported
probes, not additional main-suite passes.
