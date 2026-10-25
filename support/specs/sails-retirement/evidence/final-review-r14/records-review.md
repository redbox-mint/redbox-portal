# R14 records — Spec-axis differential

Reviewed HTTP-001–HTTP-142, including aliases, against `a49366803`. The [machine ledger](records-differential.json) contains 142 route rows and 994 populated dimension conclusions with baseline/action/line, current route/source, intentional changes and probe provenance. This is static review of every assigned route, with focused execution on seven affected routes.

Five introduced defects are fixed, uncommitted:

| Finding | Priority / routes | Restored behavior | Negative controls |
|---|---|---|---:|
| REC-01 | P2 HTTP-108 | Browser relationships stay flattened in v1 and in `meta.relationships` in v2. | 2 |
| REC-02 | P1 HTTP-137 | Browser delete remains recoverable despite REST-only `permanent=true`. | 1 |
| REC-03 | P2 HTTP-135/136 | Post-persistence reread/projection failure retains committed outcome/ETag and adds `response-projection-failed`. | 4 |
| REC-04 | P2 HTTP-120 | Create Location uses configured public URL and deployment root. Parent bound the optional input in production. | 2 |
| REC-05 | P2 HTTP-067/070 | POST preview text/date filter values retain path > body > query precedence. | 4 |

These violate design.md:34–38: “Preserve externally used HTTP URLs, response envelopes, status codes and normal record/form/workflow behavior by default.” REC-03 additionally violates tasks.md:561–562 partial-failure/ETag acceptance; REC-05 violates design.md:575–576 documented parameter precedence. GET-body retirement does not justify losing POST preview body filters.

[Validation](records-validation.json): **13 baseline-method observations passed; 13 native HTTP regressions failed before their fixes; 157 focused checks passed after fixes (13 new, 144 adjacent).** Node 26.7.0; three changed handlers passed focused oxlint; five changed TypeScript files were formatted. Baseline probes execute actual extracted methods with deterministic ports, **not Sails HTTP**. Native probes use real Express/local HTTP with deterministic domain ports. Parent owns combined pinned-26.11.1 production/persistence qualification.

Six P3 groups remain record-only in the ledger: cache directives after effective policy/handler composition; browser report-config error status/envelope normalization; workspace redirect directives; added graph validator/meta; omitted redundant named-query error status; added post-mutation administration audit. They lack demonstrated realistic functional failure; no shared response helper changes were made. Auth/brand/ACL/CSRF, malformed scalar rejection, GET-body retirement, AND filters, export escaping/drain and safe operational messages follow the cited compatibility exceptions. No accepted institution gap or inherited backlog was changed.

Owned edits/artifacts and durable scratch are enumerated in [records-artifacts.json](records-artifacts.json). No commits or publication.
