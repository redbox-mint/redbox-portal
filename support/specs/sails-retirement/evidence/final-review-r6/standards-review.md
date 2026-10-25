# Independent Standards review — R6

Read-only review delivered at initial HEAD `c45385001`; findings below are the
reviewer's report, before parent-agent remediation. No edits, commits, branch
changes, heavy suites or new inherited findings were made by this reviewer.

Three reproduced findings, all **A / P2**:

1. **Generated routes prevent production HTTP startup.**
   `packages/redbox-dev-tools/src/utils/config-helper.ts:106` emits
   `access: ['authenticated']`. Executing `updateRoutes` in memory and passing
   output through the production policy binder throws
   `HTTP route requires an unbound policy: authenticated`. `createPortalHost`
   provides no such policy. Controller, add-method and Angular-page generators
   share this helper. Feature-rewritten route generation; `extensions-v6.md:38–43`
   and SR-053 require supported generated output.
2. **SQS-only deployments pass maintenance but fail startup.**
   `packages/redbox-core/src/application/portal/application.ts:397`
   unconditionally supplies Agenda options to index inspection. A validated
   configuration with all 16 jobs effectively using SQS selects no Agenda scope
   during maintenance. Actual startup/preflight/index-inspector sources against
   an in-memory database port nevertheless open that scope and reject with
   `Persistence indexes are not ready`. New production composition;
   `design.md:342–343` and `maintenance-v6.md:75–77` require only selected indexes.
3. **The v6 scaffold fails its own dependency check.**
   `packages/redbox-dev-tools/templates/hook-archetype/v6/package.json.hbs:18`
   emits TypeScript 5.9.3, while `cli.ts:21` forbids it. Rendering the actual
   template in memory and executing the real `check` action exits 1 and reports
   `devDependencies.typescript`. New scaffold conflicts with inherited checker;
   the base scaffold omitted TypeScript. SR-053 and dev-tools README promise
   validation of scaffold compiler pins.

Probes used Node 26.11.1 without filesystem writes or external services.
Dependency pins and `git diff --check` passed. No new B findings. Accepted
institution gaps remain unchanged.
