# CodeRabbit remediation: local CQU to Figshare UAT verification

The rebuilt CQU stack passed the queued article creation, metadata mapping, attachment upload and private-review observation checks on 2026-10-01. No regression was identified in this tested path. The article remains private for manual University curation.

## Build and target

Portal `feature/figshare-queued` was tested with the review changes applied above commit `a654190db`, including master `0bc90811e`. CQU `feature/figshare-queued` is at `c7cebd4`, based on `feature/v5-refactor`. Core, Mongo storage and CQU TypeScript compilation passed. The production Angular form bundle was rebuilt using the existing Linux image dependencies because the host esbuild installation targets Linux.

Image `redbox-hook-cqu:figshare-queued-v5-local` has ID `sha256:7ca4db9ea1f62fe7c631568a8f1dbe031894ac66ec133a3d4cd2c3703657d067`. The portal was recreated in Compose project `cqu-figshare-queued`, retaining existing MongoDB, Solr and MinIO data. Eight changed runtime modules matched the compiled worktree hashes. Portal and MinIO health checks passed; all four containers remained running after verification.

The configured target was `https://api.figsh.com/v2`, CQU UAT group `32014`, with enabled queued processing and immediate submission mode. Existing credentials stayed in the local database or process memory and are absent from this report. Remote verification used authenticated GET requests only.

## Fixture and results

- Local dataset: [073a19e5b4cf434aaa09dbe71fd4d622](http://localhost:1500/default/rdmp/record/view/073a19e5b4cf434aaa09dbe71fd4d622).
- Title: `CQU CodeRabbit UAT regression 2026-10-01T07:09:57.125Z`.
- Figshare article: [11544326](https://cqu.figsh.com/account/articles/11544326).
- Writeback URL: `https://cqu.figsh.com/articles/dataset/_/11544326`.

The fixture was cloned and submitted through the ReDBox API, with fresh identifiers, two small attachments and one related publication, dataset and website. Transition to `queued` selected the review form and dispatched the real durable worker.

| Check | Result |
| --- | --- |
| Article and metadata | One new article; title matches; article ID and URL written back to ReDBox |
| Related materials | Expected and observed count: 3; all three identifiers, titles, URL types and References relations match |
| CSV | `coderabbit-regression.csv`, 40 bytes, remote file `834240648`, available; size and computed MD5 match |
| Text | `coderabbit-regression-readme.txt`, 141 bytes, remote file `834240650`, available; size and computed MD5 match |
| Local bytes | Both attachment downloads return HTTP 200 and match original sizes and SHA-256 hashes |
| Publication | Remote private, `is_public=false`, no published date, version 0; local publication pending and submission outcome accepted |
| Source work | Requested/processed sync counters 1/1; no remaining sync due; source intent acknowledged |
| Repeated observation | Three additional observe-only requests completed through the running dispatcher, plus ordinary scheduled observations; waiting, no durable error |
| Private-file check | Ordinary scheduled checking returned `replacement_access`, retaining local bytes; subsequent observation returned `review`; neither state is an error |
| Audit growth | Exactly one started and one successful Figshare audit entry, zero failed entries; unchanged through all repeat checks |
| Mutation growth | Mutation counters unchanged before and after repeat checks; article GET count rose from 21 to 33; zero DELETE requests |
| Browser | Authenticated portal integration-status endpoint returned HTTP 200 and pending severity; Integration Audit displayed one successful Figshare sync trace |

The initial sync issued one article creation, one metadata update, two file initialisations, two multipart PUTs, one completion per file and one configured submission request. No additional sync or publication submission occurred during observation. Final captured observation was `2026-10-01T10:53:09.663Z`; the successful trace is `5cfe3653b45143c1d74bc68a6b558c24`. A temporary local runtime stall delayed a check and the audit drawer; OrbStack recovered without stack or code changes, and the pending requests completed successfully.

The article, remote files, local record and local attachments remain in place. No Figshare data was deleted or moved into public visibility. Temporary test runner scripts were removed after verification.

## Supporting tests and limits

Before the rebuild, the complete core suite passed 2,258 tests with 14 unrelated skips, including 38 durable Mongo worker cases. The storage suite passed 234 tests and the Angular status-panel suite passed 28 tests. Core/storage compilation, Oxlint and CLI syntax/help checks passed. Controlled tests cover the approved invalid-delay pause policy, owner-based administrative linking and repair, dispatcher isolation and mutation guards; those scenarios were not injected into the live UAT configuration.

Creation used an API fixture rather than a complete valid submission in the dataset form. The local FoR/category crosswalk is unconfigured, and the synthetic publication URL does not satisfy the CQU form's DOI validator. The CQU v5 form currently does not include the inline integration-status component; its API and the audit drawer were verified. The Figshare browser page returned an authentication challenge, so remote private status and file contents were verified using the configured API credentials. Public publication, staff curation and completed replacement cleanup were outside this test. The existing local stack disables TLS certificate verification, so normal TLS validation was not tested.
