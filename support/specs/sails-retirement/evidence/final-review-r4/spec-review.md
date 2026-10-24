# Final gate round 4 — independent Spec review

Reviewed immutable base `a49366803164429f9d8bdd249dadcdf856c9d13e` through `62ac54cb8fd703d142c806abc361bb546fb0cfb1`, using `git diff a49366803...62ac54cb8` and `git log a49366803..62ac54cb8 --oneline`. The complete commit list and per-file diff counts are in `reviewer-commits.txt` and `reviewer-diff-stat.tsv`. This is a read-only reviewer report, not a remediation or whole-artifact qualification. No tracked source was edited, no branch/worktree created/switched, no child spawned, and no PR watched. Only this requested temporary review directory was written.

Read AGENTS.md and R1/R2/R3 evidence first, then the eight requested documents: design, implementation_plan, configuration-v6, extensions-v6, hook-migration-v6, maintenance-v6, route-group-acceptance, upgrade-recovery-v6. Consulted tracked wiki Architecture Overview, Services Architecture, Controllers Architecture, Redbox Loader, Redbox Core Types, Coding Standards, Configuration Guide, ReDBox Automated Tests, Development Guide, Installation Guide, Persistence Index Preparation and V6 Client Compatibility, plus CONTRIBUTING. Applied the code-review Spec axis and Redbox Testing guidance. The unrelated untracked GraphQL specification was ignored. The accepted institution-designation gaps SR-005/045/049/055 are not findings.

## Findings: 2 P1, 3 P2

All locations below refer to **62ac54cb8**, even where the parent is concurrently changing the shared checkout. No scope-creep finding is asserted.

### R4-SPEC-01 — P1 — Mount extension handlers with returned-work ownership

**Locations:** `packages/redbox-core/src/application/portal/application.ts:459–468`; sibling `packages/redbox-core/src/extensions/composition.ts:127–131`.

**Spec:** `design.md:526–528`: “Registered handlers participate in the host's context, policy and accepted-work rules.” `design.md:408–411`: “do not count an HTTP `finish` or disconnected socket as proof that associated database work is finished ... already-accepted writes and their cleanup retain ownership until settled.”

Both composition paths mount raw extension RequestHandlers/middleware. They omit the returned-Promise ownership supplied to core handlers by `httpAction` (`http/express/middleware.ts:29`). A legitimate async extension handler can send its response and still have pending completion work, or remain pending after transport abort. Response finish releases its accepted scope; stop then reports clean completion while the handler Promise remains unfinished. Later queue/audit/database completion cannot use the settled scope.

**Reproduced:** `reviewer-boundaries.cjs`, pinned source from git objects, constructs a real resolved extension, `composeExtensionApplication`, `ApplicationRuntime`, and `ExpressHost` with the same owner. The handler sends its response and awaits a manually controlled Promise. `host.stop({deadlineMs:50})` succeeds with application state `stopped` while the handler is unfinished; `hasActivePersistenceWork(owner)` is false at its eventual completion. Wrapping precisely the same handler in the existing `httpAction` is the control: stop rejects its deadline, retains ownership, and late completion still has active admission. See `reviewer-boundaries.log`.

**Trust:** the hook package/handler is trusted deployment code, and its public access declaration is intentional. This finding concerns the promised host ownership of its returned Promise, not sandboxing arbitrary hook code or inventing an unauthorized public route. Protected policy chains have the same mounting omission.

**Correction boundary:** retain returned async handler/middleware work at both mount paths using the existing HTTP lifetime interface; preserve Express next/error behavior and selected policy order.

**Origin:** incomplete new retirement extension-host integration; this public mounting API did not exist at the base.

### R4-SPEC-02 — P1 — Validate the entire queued hook before executing its parent

**Locations:** `packages/redbox-core/src/records/RecordTriggers.ts:495–512`; production entry `application/portal/application.ts:231–235`; syntactic converter `queues/migrateRecordHooks.ts:10–13`.

**Spec:** `hook-migration-v6.md:166–169`: “Runtime validation checks nested declarations before invoking the parent operation, so an unsupported success callback cannot first send an email.” See also `upgrade-recovery-v6.md:134–137`, selected queued payload validation/refusal before activation.

The production job entry converts queued names but dispatches directly through `queuedTriggerSubscriptionHandler`. That method resolves only the outer function. It bypasses `validateRecordHookConfiguration`/the coordinator's recursive operation resolution. `convertBuiltinRecordHook` validates syntax and finite legacy mappings; a syntactically valid but unregistered v6 name survives. A persisted/delivered email hook with `options.onNotifySuccess: [{function: 'removedInstitution.callback'}]` therefore sends its email and only then fails resolving the callback in `Email.ts:361`. Re-delivery/retry can repeat the email.

**Reproduced:** `reviewer-queued-validation.cjs` runs the actual converter, actual queued trigger dispatcher and actual `Email.sendRecordNotification`. Only template rendering and the external send transport are replaced with deterministic ports. The transport is invoked **once before the unregistered-operation rejection**. The same converted declaration passed through the ordinary record coordinator rejects before executing its parent. See `reviewer-queued-validation.log`.

**Trust:** this is persisted Agenda state or an SQS delivery supplied by an authorized queue producer, for example a retained job whose institution callback binding has been removed. It is not a claimed unauthenticated HTTP path into arbitrary queue operations. The deployment still owns registration of valid operations. Both Mongo and SQS use the same production dispatcher.

**Correction boundary:** recursively validate all queued declarations against the selected operation map before invoking any parent, using the existing validator. Keep opaque record/template data opaque and preserve hook result semantics. Startup conversion alone cannot establish future delivery-time binding validity.

**Origin:** retained pre-existing ordering fault in the queued sibling, now violating R1's explicit validation guarantee. Base `services/RDMPService.ts:426–441` invokes the parent directly, and base `services/EmailService.ts:312–322` resolves success callbacks only after a successful send. Do not label this particular ordering fault a newly introduced v6 exploit.

### R4-SPEC-03 — P2 — Preserve an authorized read racing completed tus promotion

**Location:** `packages/redbox-core/src/storage/StandardDatastream.ts:379–380`, called from `getDatastream:1034–1036`.

**Spec:** `design.md:34–37`: “Preserve externally used HTTP URLs, response envelopes, status codes and normal record/form/workflow behavior by default.” R3's ownership restriction does not require denying a read of an already-authorized durable primary object.

R3-01 authorizes staging **before** looking for a promotion guard or rechecking primary. Reader A can have an in-flight primary existence probe that observed absence. Reader B then promotes the complete owned tus parts and deletes their info/parts. When A's earlier absence result resolves, A attempts `getUpload` to authorize staging and fails because B already removed the info. The bytes now exist at the correct primary key, but the authorized download fails.

**Reproduced:** `reviewer-storage-race.cjs` uses the real StandardDatastream and TusStorageManagerDataStore with in-memory disk ports and the same authorized actor/brand/record for both readers. Only the first primary-existence response is gated, preserving its observed false result while another read finishes. At 62ac54cb8, B succeeds, A fails with “The file for this url was not found”, and primary bytes exist. Replacing **only StandardDatastream** with `0fbd7f74a^` makes both reads succeed. See `reviewer-storage-race-current.log` and `reviewer-storage-race-pre-r301.log`.

The existing coalescing test lets both readers validate before promotion and retains mocked sidecars; it does not cover this interleaving. The ownership/completion negative tests remain useful and must stay green.

**Correction boundary:** distinguish already-promoted primary reads from staging adoption when a concurrent promotion consumes sidecars. Recheck primary on this race without granting an unauthorized caller access to staging or another actor's in-flight adoption.

**Origin:** demonstrated regression introduced by R3-01, not inherited v5 storage debt.

### R4-SPEC-04 — P2 — Filter Agenda selection in the executable maintenance path

**Location:** `app.express.cjs:63`; downstream `persistence/maintenance.ts:114` and `queues/indexes.ts:51`.

**Spec:** `maintenance-v6.md:75–78`: “Mongo Agenda descriptors are included when selected jobs/default backend use Mongo ... An exclusively SQS job selection acquires no Agenda Mongo maintenance connection.”

The dedicated `runIndexMaintenance` runner computes Mongo selection correctly. The executable documented by Installation Guide and the upgrade runbook always supplies `portal.config.agendaQueue.options` to `prepareSelectedPersistenceIndexes`. Any supplied object selects the Agenda scope; that scope opens the configured Agenda Mongo URL (or core Mongo fallback) and inspects indexes. Under `--maintenance=indexes:ensure`, it can create three indexes in that unselected Mongo job collection. An unused/unreachable Agenda Mongo URL can also block valid SQS maintenance.

**Executable source probe:** `reviewer-boundaries.cjs` evaluates the actual pinned `app.express.cjs` in a VM with deterministic composition/I/O ports and an exclusively SQS configuration. It observes the real ensure branch passing `{backend:'sqs', db:'mongodb://unselected.invalid/unused', collection:'agendaJobs'}` as `selected.agenda`. No database was contacted by this probe. The unconditional downstream `if (selected.agenda)` / `prepareAgendaIndexes` call chain establishes the connection/DDL consequence exactly. See `reviewer-boundaries.log`.

**Correction boundary:** share the existing selected-backend decision across both entrypoints before persistence acquisition. Do not initialize queue backends or business bootstrap to decide maintenance scopes.

**Origin:** inconsistency between two new retirement maintenance entrypoints.

### R4-SPEC-05 — P2 — Do not log startup job payloads

**Location:** `packages/redbox-core/src/queues/AgendaQueue.ts:508–509`.

**Spec:** `design.md:470–471`: “Configuration diagnostics redact secrets, credentials and tokens; an old raw debug export is not a safe default.”

`defineJobs` logs `JSON.stringify(job)` through verbose logging. The accepted configuration schema includes arbitrary JSON at `agendaQueue.jobs.<name>.schedule.data`; it is not a credential-free metadata shape. A configured custom job carrying an Authorization header or credential-bearing provider URL is logged in full during initialization when verbose/debug logging is selected.

**Reproduced:** `reviewer-agenda.cjs` invokes actual `AgendaQueue.defineJobs` with a bound no-op handler/backend definition port and actual production `createPinoLogger('verbose', ...)`. Its captured output contains the synthetic credential placed in schedule data. See `reviewer-agenda.log`. No real secret was read or printed. Default info-level logging does not emit this verbose message; the defect is conditional on supported verbose logging.

**Correction boundary:** emit bounded job name/backend/definition status, omitting schedule data and arbitrary options. Preserve definition and schedule behavior.

**Origin:** pre-existing at base `services/AgendaQueueService.ts:529–530`; retained debt missed by the broader logging fixes, not a new retirement disclosure mechanism.

## R3 storage regression-test sensitivity: independently executed

Tests run in the parent's existing `sr-final-r4-builder` on `unix:///run/sr-p7-isolated/docker.sock`, Node 26.11.1. No container/image was created or source/dist overwritten. `reviewer-loader.cjs` compiles source strings loaded from `reviewer-source-*.json` / `reviewer-mongo-source-*.json` in memory. Tests are the committed 62ac54cb8 tests, even while the parent changes other files. Each pre-fix variant changes only the relevant implementation files; failures are assertion failures, not imports/type/fixture errors.

| Committed test subset | 62ac54cb8 | Pre-fix source | Failure meaning |
|---|---:|---:|---|
| Standard staging read ownership | 6 pass | `0fbd7f74a^`: 6 fail | Every rejection expected by the new read ownership tests is missing. |
| Standard staging completion | 3 pass | `4a2c0bf6e^`: 3 fail | Partial/deferred/overrun uploads are accepted instead of retained. |
| Standard staging cleanup ownership | 4 pass | `da6231530^`: 4 fail | Foreign/unbound destructive cleanup succeeds instead of rejecting. |
| Records historical ownership journal | 1 pass | `da6231530^`: 1 fail | Expected retained=1/removed=0 becomes retained=0/removed=1. |
| Mongo adapter foreign cancelled staging | 1 pass | `da6231530^`: 1 fail | Expected destructive-port ownership rejection is missing. |

The complete current StandardDatastream suite also passes **66 tests**, including authorized primary/staging/coalescing behavior. Counts overlap the focused runs and are not summed. Logs are `reviewer-storage-current.log`, `reviewer-storage-pre-r301.log`, `reviewer-storage-pre-r302.log`, `reviewer-storage-pre-r303.log`, `reviewer-journal-{current,pre-r303}.log`, `reviewer-mongo-{current,pre-r303}.log`, and `reviewer-storage-all-current.log`.

Reproduction pattern from repo root (change JSON variant and grep as in the scripts/logs):

```sh
docker -H unix:///run/sr-p7-isolated/docker.sock exec \
  -w /opt/redbox-portal/packages/redbox-core \
  -e SR_REVIEW_SOURCE=/opt/redbox-portal/.tmp/sails-retirement/final-review-r4/reviewer-source-current.json \
  sr-final-r4-builder node --no-experimental-strip-types \
  ../../node_modules/mocha/bin/mocha.js --no-config --require chai \
  --require ../../.tmp/sails-retirement/final-review-r4/reviewer-loader.cjs \
  --require test/setup.ts --timeout 30000 test/services/StandardDatastreamService.test.ts
```

For Mongo, use its package working directory, its test path, `reviewer-mongo-source-*.json`, and grep `refuses foreign cancelled staging rather than trusting the journal file id`.

## Storage/import/OCFL critique

- R3-01 correctly checks actor, brand and exact existing-record binding before accessing staging or joining a promotion. Pending-record staging remains save-only. Primary reads need no staging authority after normal HTTP object/brand/ACL authorization. R4-SPEC-03 is a concrete additional race, not grounds to remove those guards.
- R3-02's shared helper checks safe nonnegative declared length and exact offset before reading/copying/deleting staged upload bytes. Missing/deferred/partial uploads remain resumable. Sidecar ownership/completion is server-owned, not accepted from submitted record metadata. The obsolete Bruno length correction is consistent with this requirement.
- R3-03 persists trusted save actor/brand through journal values/claims, refuses destructive cleanup without historical ownership, and checks tus identity at both Standard and Mongo destructive ports. Missing old context is retained for operator reconciliation. Client-selected file IDs alone do not authorize deletion. Trusted internal `addDatastream` callers without a request context remain explicit ports; production PDF supplies its own generated staging object rather than an arbitrary browser file ID.
- `Vocabulary.ownImport` / `FigshareVocabulary.ownImport` retain the original Promise in an instance set, create an independent accepted scope in production, and remove it only at settlement. Both module plans expose drain/close. RVA early-row reconciliation can return before the original import settles, but the set still owns it. Failure logging/retry behavior is preserved. A genuinely stuck provider can make application stop fail its configured deadline while retaining resources; that is the specified behavior, not evidence of a new deadlock. Parent owns the lifecycle mutation tests; this review does not claim to repeat them.
- Independent `reviewer-ocfl.cjs` uses actual Node `pipeline` with the pinned OCFL adapter. **Six checks pass:** normal Node/Web finalization and Node/Web aborts with delayed successful/failed cleanup. Abort remains pending until the disk Promise settles; neither adapter deadlocks these pipelines. Joining `finished(writable)` is needed because Node's Web bridge abort alone can finish before `_destroy` callback. These probes do not simulate every third-party disk implementation or promise stronger provider cancellation than its contract. See `reviewer-ocfl.log`.

## Agenda, argument authority and extension review boundaries

- Reviewed all 17 concrete core job bindings in `application/portal/application.ts:180–236`, plus explicit deployment `bindings.jobs`. `AgendaQueue.defineJobs` resolves configured fnName through this finite map; no client-supplied service expression is evaluated. Missing bindings fail composition/initialization.
- Queue handlers run within `acceptedJob`'s worker context and the same persistence owner's accepted scope. The worker context is revoked at actual handler settlement. R3 retains completion authorization after a failed drain deadline, while unrelated/stale callers remain fenced. Parent is independently qualifying lifecycle sensitivity.
- Solr/audit/reconciliation/notification/security/RAID/Figshare/typeface/history/queued-trigger handlers are service-to-service ports. HTTP does not expose an arbitrary `fnName`/queue-job submission endpoint. Record queue-trigger job names/options come from configured hooks; records/actors derive from admitted operations. Retained SQS/Agenda messages remain trusted deployment/queue state, not proof of current HTTP actor authentication.
- Installation-wide SIEM retry, typeface reconciliation and completed-job history maintenance are intentionally global operator/scheduled operations. Their global scope is not itself a cross-brand HTTP bug. Figshare reloads durable record/intent state through its worker; RAID reloads the stored record for retry configuration. No additional untrusted cross-brand call chain was verified here.
- Extension factories/work/integrations use explicit selected bindings and resolve before acquisition. The package contract is not a sandbox. Routes explicitly opt into public or named policy access; a deliberately public custom handler is not an authorization defect by itself. Where core policies run, `actorContext` filters domain roles to the resolved brand; the full global identity snapshot remains available for identity administration by design. R4-SPEC-01 is a missing transport owner independent of that distinction.
- I did not elevate optional/custom policy naming or hypothetical arbitrary malicious hook code to findings. R4-SPEC-02 concerns a reproducible required nested-validation omission, not speculative new queue authority.

## Regression versus pre-existing v5-host source

“Pre-existing” below means demonstrably present in the **v5/Sails-host source at the requested base a49366803**. That base already includes Prisma/storage changes and is not identical to the released v5.0.4 image. These references do not invent released-image exploit qualification where no such probe was run. The distinction matters when describing this retirement diff as the cause.

| Prior issue | Classification | Independent base-source evidence / reason |
|---|---|---|
| R1-02 cross-brand shared-user audit | Pre-existing | `services/UsersService.ts:652–706` queries/merges user audits without a requested-brand argument/filter. |
| R1-04 canonical deployment-root URLs | Retirement regression | New canonical `server.publicUrl` includes root, but pre-fix portal composition appended root again (`267b73b30^`, `application/portal/application.ts:272`, `http.ts:352,547,581`). Base `views/apiClientConfig.ejs:5` uses legacy appUrl and base PDF `PDFService.ts:246–249` composes its legacy source URL. The regression is reusing origin-style composition with the newly validated canonical application URL; do not generalize that every legacy URL layout was qualified. |
| R1-05 nested success callback conversion | Retirement regression for supported old callback declarations | Base `services/EmailService.ts:314–322` resolves supported `sails.services...` expressions directly. New strict named dispatch required conversion of explicit nested callbacks; omitting it broke previously callable declarations. Separately, the late-validation ordering fault in R4-SPEC-02 also existed in the base. |
| R1-08 selected storage public entry (P2; included for extension completeness) | Retirement regression | Native neutral-entry discovery is new. A hardcoded `/extension` after accepting public `.` contradicted that new discovery contract. Base has no corresponding neutral public-entry capability to regress. |
| R1-15 Companion native credential logging | Pre-existing provider exposure at v5-host source | Base `config/http.config.ts:557–598` loads/calls native Companion without a bounded logger. Base core manifest pins Companion 7.1.1, and `evidence/versions-before.json:94–97` confirms resolution from the core import context; root independently had 7.0.2. Thus “the root version changed” alone does not establish that retirement introduced this logging. The exact released-v5 native logger is not independently rerun here. |
| R2-05 foreign role name authorizes workflow | Pre-existing | Base `services/RecordsService.ts:2220–2233` matches transition role names across `user.roles`; base `controllers/RecordController.ts:637–639,1070–1072` derives names from the global role snapshot. Retirement's explicit brand-scoped actor context closes an inherited authorization weakness. |
| R2-07 staged-byte save adoption | Pre-existing | Base `services/StandardDatastreamService.ts:715–742` copies selected staging/parts without actor/brand/record authority. New R2 guard is hardening, not evidence that retirement first allowed this adoption. |
| R3-01 lazy read adoption | Pre-existing underlying isolation defect | Base `services/StandardDatastreamService.ts:359–393` coalesces/promotes staging without per-caller authority. The additional authorized-read race R4-SPEC-03 is newly introduced by the fix and is separately reproduced against its parent. |
| R3-02 incomplete upload adoption (P2) | Pre-existing | Base `services/StandardDatastreamService.ts:737–742` attempts parts promotion without a completed size/offset check. |
| R3-03 foreign cancelled staging deletion | Pre-existing | Base `services/RecordsService.ts:3189–3204` journals no actor/brand; `:6174–6180` authorizes by journal then deletes only by file ID; base `services/StandardDatastreamService.ts:912–924` destructively removes bounded staging/sidecars without ownership. This journal was already in the Prisma-integrated base, not necessarily released v5.0.4. |
| R3-12 shared target global token/account takeover | Pre-existing | Base `controllers/webservice/UserManagementController.ts:130–141` requires any current-brand role, then `:483–502` permits setting a global token for that shared user. No foreign-membership guard exists in that call chain. |
| R3-13 link into a foreign-permission primary | Pre-existing | Base `services/UsersService.ts:2189–2203` checks primary current-brand membership but excludes foreign roles only on the secondary; `:2218–2223` creates the link. The primary's other-brand authority therefore predates retirement. |

Other R1/R2/R3 credential-diagnostic fixes generally remove raw logs already present in the extracted services. In particular base PDF `packages/sails-hook-redbox-pdfgen/src/api/services/PDFService.ts:292,416–426,487` already logs configured/navigation URLs, supporting R3-05's pre-existing classification. I have not relabeled every logging ID without inspecting its own base call site.

## Broad static and qualification limits

- The pinned committed-source retirement closure scans **1,068 files**, reports **0 executable violations** and **0 forbidden dependency entries** (`reviewer-source-closure.json`). This is a source audit, not a freshly rebuilt installed-image audit.
- Independent manifest check: **23 tracked package.json files**, **361 dependencies/devDependencies declarations**, **0 exact-pin violations** (`reviewer-dependency-pins.json`). Local `file:`, relative and workspace references use AGENTS.md's exception. The 361 count intentionally covers dependencies/devDependencies only, not peer/optional declarations.
- `git diff --check a49366803...62ac54cb8` passes. Existing R3 full-suite evidence remains historical qualification of its recorded source/artifacts; no new full-suite, immutable-image or institution qualification is claimed by this reviewer.
- Broader inspected paths include Express admission/policy/CSRF/session wrapping, primary/staging byte delivery, selected record/identity operations, extension declaration/loading/composition, maintenance, canonical URLs, bounded logging and dependency retirement. This is an independent focused final-gate review, not a claim that every line of the 1,437-file change has been exhaustively re-executed.
- Shared checkout status observed parent-owned modifications to `support/wiki/V6-Client-Compatibility.md` and `packages/redbox-core/test/queues/QueueMongo.test.ts` while this review ran. They were not changed, reverted, or included as reviewed fixes. Source probes and test source overrides remain pinned to 62ac54cb8.
