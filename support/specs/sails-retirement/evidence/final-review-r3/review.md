# Round 3 enumeration and authority contracts

This appendix accompanies [the final report](../final-review-r3.md). The final code snapshot is `04455647e5a9cdb0b2f5340a4e77abcdd4fcbbff`. Tables enumerate static source sites, not runtime invocations or independent authorization checks. Domains intentionally expose low-level capabilities to trusted workers, startup, maintenance and selected extensions; those ports do not infer a request brand. A raw repository accepting an id is not safe to expose as a public handler. The audit follows its public caller's gate or explicit internal authority.

## Route and operation enumeration

- [routes.tsv](routes.tsv): **335 unique routes / 338 manifest declarations**, including **152/152 API-registry routes**, zero missing/extra API entries. Every row records method/path, source/manifest, controller/action, path identifiers, effective policy list and the concrete object/brand gate. Body/query identifiers are covered by the handler contract, not merely by extracting colon parameters. The three repeated manifest references are deduplicated by method/path; they do not add endpoints.
- [mounts.tsv](mounts.tsv): **16 additional mount/dispatch boundary rows**, covering health/readiness, root/admission/404, static artifact fallback, Companion subtree/popup/socket paths, progress socket handshake/events, dynamic extension-route registration and tus's all-method dispatch. These are not 16 additional unique endpoints: some are middleware, two are dynamic declaration loops, and tus overlaps the manifest table.
- [domain-operations.tsv](domain-operations.tsv): **2,484 conservative identifier-bearing candidates**, from **7,158 named callable declarations in 935 production package source files**. Includes constructors, object methods, assigned functions, transport adapters, pure helpers and privileged persistence ports, as well as business operations. Camel-case parameter/function identifiers and authoritative body fields are scanned; generic `Record<...>` and `void` alone no longer count as record/oid parameters. Each row records its signature, concrete gate evidence where present, trust category and caller/capability contract. This deliberately overinclusive total must not be described as 2,484 independently authorizing public methods.
- [authorization-totals.json](authorization-totals.json) records category totals and the reconciliation. The browser's HTTP wrappers are transport consumers; authorization is enforced at the enumerated server routes. Support metadata-inspector/documentation CLIs are not portal request-domain entrypoints.

The initial tenant review child failed before completing its review. Its raw candidate extraction was used as an enumeration aid only. The owning reviewer completed the caller/object review and final tables; **no completed independent tenant review is claimed**. The Standards and Spec axes did complete independently, and their original reports are preserved alongside this appendix.

Reviewed authority chains include:

1. Record reads, lists, exports, audit/permissions, pages, forms, templates, schema discovery, create/update/transition/delete/restore, harvest and datastream operations: authoritative record brand, selected-brand actor roles, operation ACL and type/workflow resolution; untrusted metadata cannot replace authority. Related-object inline projection rechecks view access; raw internal getters do not constitute public authorizers.
2. Users, roles, account links, audit and credential changes: target membership and role resolution are branded; foreign memberships survive scoped role edits; audit rows filter brand before limits. R3 additionally closes both global-token/profile/status administration and alias-link grants through a shared account. Self changes retain their existing account authority.
3. Vocabulary/entry/parent/reorder/source/crosswalk/mapping/run ids: current-brand Admin or form lookup membership; local owner checked before mutation, nested IDs checked against parent vocabulary; Figshare `requireSource`, `requireRun`, `requireCrosswalk`, `requireLocalVocabulary` and mapping ownership enforced in the domain.
4. Configuration/dashboard/type/workflow/form/named-query/report/translation/branding identifiers: selected-brand namespace and effective policy/PathRules gates; write keys are constructed from authority, draft/config CAS is retained, masked values remain masked. Public branding delivery selects published artifacts only.
5. Progress/harvest/SIEM/index/integration identifiers: owner brand+creator or record ACL; native reconnect obtains fresh actor authority. Trusted worker/provider actions derive brand from the accepted record/context; remote-provider IDs do not grant portal authority.
6. Extension routes and offline tools: validated declarations and bound named handlers/policies, trusted configured roots and explicit inputs. No arbitrary request-supplied service/controller lookup remains. Selected built-in development extension supplies a landing path, not an unguarded arbitrary entity route.

## Staging and byte paths

[storage-paths.tsv](storage-paths.tsv) enumerates **183 operation/helper sites in 18 modules**. It includes all staging/tus/Companion/datastream adopt/attach/read-recovery/move/delete paths and their internal disk/stream helpers, plus multipart/PDF/branding-generated keys and outgoing Figshare/OCFL staging. Helpers inherit their explicitly identified caller's authority; they are not represented as independent gates.

The client-selected attachment path validates trusted tus actor/brand/record metadata before byte adoption. Adoption additionally requires declared length and complete offset. A pending-record binding can be claimed only by the same actor and brand through an authorized save; read recovery requires an exact already-bound record. Each read validates before joining an in-flight promotion. Existing durable bytes at the same owning record key use idempotent repair without consuming foreign staging.

Cancelled journal cleanup retains generation/reference/lease coordination, persists the save actor/brand, and rechecks that ownership at both Standard and Mongo destructive staging ports. Missing, foreign or historical unbound ownership retains bytes for reconciliation. Multipart/PDF and branding consumers use server-generated keys from their own accepted operation; their destructive cleanup never accepts a client-selected key. Direct legacy `handleUpdateDataStream`/raw datastream ports have no selected production caller and remain internal trusted-input APIs, not public authorization mechanisms.

## Complete async enumeration

The source universe is **1,221 tracked production TS/JS files across 33 src roots**; [source-files.json](source-files.json) preserves the exact list. Tests and declaration files are excluded. Angular applications and shared libraries, all bundled server packages, generated-template sources and support CLIs are included.

[async-sites.tsv](async-sites.tsv) was re-extracted on the final code: **389 candidates, 360 actual sites, 29 explicit exclusions, zero unclassified rows**. It preserves source path/line/function/expression, real owner, disposal/drain contract and reasoning. Categories overlap: **60 Observable subscriptions, 145 ignored Promise expressions, 102 ignored Promise chains, 68 timer/microtask sites, 64 explicit event registrations, 19 Effect run/fork sites, one RxJS interval and one async collection callback**. Do not sum overlapping category counts.

The original independently reviewed cross-checks remain separate, with their original source spans and original gap labels:

- [async-supplement-review.tsv](async-supplement-review.tsv): **35** additional implicit/embedded registrations (HostListener, observers, animation frames, cache/scheduled Job timers, channel and native callbacks, embedded popup/worker code and generated-template listeners).
- [promise-crosscheck-review.tsv](promise-crosscheck-review.tsv): **516** non-directly-awaited/returned Promise expressions; **165** overlap primary sites. This includes aggregated/stored/argument Promises, not just ignored statements.
- [callback-crosscheck-review.tsv](callback-crosscheck-review.tsv): **62** callback candidates, including five discarded browser callback Promises; the remainder identify synchronous/lazy/previously listed expressions.
- [template-events.tsv](template-events.tsv): **914 distinct declarative event/output sites**, 80 external HTML files plus 51 inline templates; zero Angular parser errors. Bindings are removed with their Angular view.
- [async-totals.json](async-totals.json) records final primary counts and original cross-check counting/provenance.

Final dispositions of the original six Spec findings:

| Original gap | Final owner/behavior | Commit |
| --- | --- | --- |
| Observable/Effect hiding opaque Promise after timeout | Independent actual-result Promise retained by hook supervisor and accepted scope; first-value semantics retained; overlapping timeout retry suppressed | `3057715f7` |
| Queue's deadline removes live completion permission | Admission tied to actual live accepted owner, not an expired wait timer; stale/unscoped submissions denied | `ea0683685` |
| Worker/schedule post hook and late save audit lose scope | Independent accepted hook and gated terminal/grace audit lifetimes | `3057715f7` |
| Email callback tracked without admission | Actual production binding invokes/settles callback in independent accepted scope; global followups join it | `dc8f59181` |
| Figshare/RVA import outlives bootstrap wait/reconciliation | Original import retained in module's Set/drain and accepted persistence scope, including early-row reconciliation | `b76ef23a7` |
| OCFL abort releases caller before disk upload cleanup | Node destroy joins upload; Web abort also joins Node finished; Oni retains enclosing operation | `8fdfc269c` |

Source comments alone are not the proof: regression tests gate real work, expire stop/deadline waits, require retained ownership and successful final writes, reject unrelated work and retry cleanup. OCFL tests cover Node/Web forms and both resolving/rejecting disk cleanup plus normal finalization. Queue coverage expires its own deadline, not just the host deadline.

Browser HTTP Promises/one-shot UI tasks are documented with their component/view/form/document lifetime. The table does not claim every older UI subscription has an explicit unsubscribe or that component destruction joins every dispatched HTTP request. The server independently owns accepted requests. CLI entrypoints own their awaited work through process completion. Exported unselected `CoreService.exec`, Users legacy trigger wrappers, nested `Email.sendTemplate` subscriptions and CacheService helpers lack independent server lifetime registration; no selected production invocation was found, so they are recorded as extension-author obligations rather than speculative normal-route defects. The pinned Companion provider's already documented internal-I/O/process limitation remains explicit; this review does not silently claim it was eliminated.

## R2 critique and whole-feature disposition

The [independent Standards report](standards-review.md) lists all **28 R2 logging boundaries** inspected. Removing raw arguments preserved business throws/returns/callback control flow; bounded chronicles still use the safe serializer. R3 fixes the missed nested journal fallback and PDF configured-URL diagnostics. No additional logging-induced result regression or evidence-backed over-engineering finding was verified.

R2's central branded actor projection is retained: it prevents global roles leaking to workflow and sibling handlers without changing the global identity snapshot. R2's hook ownership fix correctly retained fibers/HTTP audit grace work, but did not establish cancellation of hidden Promise bodies or independent worker/email completion admission; R3 closes those concrete sibling gaps. R2's staging promotion guard remains necessary; R3 adds read recovery, complete-upload and destructive-cleanup coverage without trusting submitted ownership fields.

The broader review inspected Express admission/order, fresh auth/session identity and rotation, CSRF/canonical origins and verified API exemptions, OIDC state/PKCE/logout origins, async error/headers-sent behavior, multipart/tus/Companion/socket cleanup, page/header/artifact containment, canonical deployment URLs/open redirects, configuration masking/logging, finite v5 conversion and executable retirement, test collection, exact pins/lock consistency and documented extension idioms. No additional verified defect remains deliberately unfixed. Full final-tree results and provenance are in the parent report; historical immutable artifacts/topology proof and the institution-designation gap are not relabeled as newly executed results.
