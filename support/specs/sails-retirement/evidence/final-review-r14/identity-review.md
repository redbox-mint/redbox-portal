# R14 identity supplemental differential

Reviewed all **119 routes**, HTTP-143–253 and HTTP-301–308, including aliases. [Machine ledger](identity-differential.json) records seven concrete dimensions and source provenance per route. Baseline: `a49366803`; incoming: `9bb858218`; corrected runtime/tests are parent-committed in `fb08b5447`. This reviewer made no commits.

Five reproduced Class A findings are fixed:

| Finding | Priority | Behavior corrected                                                            | Incoming failing cases |
| ------- | -------- | ----------------------------------------------------------------------------- | ---------------------: |
| R14-06  | P1       | HTTP-144 updates declared body ID despite conflicting query ID                |                      2 |
| R14-07  | P2       | HTTP-162–164 retain REST visibility of hidden/disabled accounts               |                      7 |
| R14-08  | P2       | HTTP-253 generic stream needs no attachment metadata; filename defaults to ID |                      2 |
| R14-09  | P2       | HTTP-249 streamed download length and empty filename fallback                 |                      2 |
| R14-10  | P2       | HTTP-174–177 empty optional RVA version selects latest                        |                      4 |

Requirement: [design.md:34](../../design.md#11-compatibility-contract), “Preserve externally used HTTP URLs, response envelopes, status codes”; [line 124](../../design.md#13-recorded-http-compatibility-breaks), “Valid body/query precedence is retained.” Header/stream behavior is also required by tasks.md:534; outcome mapping by design.md:586–590.

**R13-13 remains correct.** `afaf6ef01` fixed browser selection to `body.userid`; its REST sibling was query-first both before and after that commit, already present in the first native adapter `7f49cbe79`. R14-06 is a missed Class A feature regression against the pre-feature body-ID controller, not a regression introduced by R13. [History proof](identity-r13-target-history.json) and simultaneous multi-source/omission controls substantiate this.

Final owned native HTTP: **49 cases; incoming 17 failures/32 passes; corrected 49 passes**. Supporting combined run: **126 passes, zero failures/pending**, overlapping parent suites. **13 actual baseline-method executions and two baseline/current inherited-service executions are not HTTP**. Node 26.11.1; focused runtime oxlint passes. [Probe results and commands](identity-probes.json) preserve original focused hashes and refreshed `0e4c31096` test hashes; parent's annotation/cast correction preserves the emitted syntax tree. Final raw logs remain under `.tmp/sails-retirement/final-review-r14/identity/`.

Inherited vocabulary listing omits branding in both domain implementations; parent added backlog. B06 and accepted institution gaps remain untouched. Unfixed P3 observations: DELETE204/list cache-header deltas, index message wording, omitted custom chronicle markers, and residual safe failure status/envelope/text differences. Sanitization alone does not establish intentional status changes. Exact routes/dispositions and the complete **four runtime, three test, nine evidence artifact plus scratch inventory** are in the ledger. No full deployed/Sails HTTP or provider qualification is claimed; parent owns combined qualification.
