Angular client/server SPEC review is complete at frozen runtime/test revision
`709483c4670583677e8318cb9dadc14fa362b549`, against `a49366803...HEAD`.
**Three app-boundary A/P2 issues, arising from two contract families, were fixed.**
No additional P1/P2 was demonstrated in this scope. Parent owns commits, clean
builds, full qualification and evidence publication; this report records focused
source review and explicitly bounded probes.

The governing contract is [design.md:34](../../design.md): “Preserve externally
used HTTP URLs, response envelopes, status codes and normal record/form/workflow
behavior by default.” [design.md:53](../../design.md) says existing Angular apps
remain consumers, and permits coordinated “socket or CSRF client wiring.” The
fixes preserve typed native error statuses and native CSRF enforcement.

| App-boundary issue | Concrete behavior and correction | Parent commit |
| --- | --- | --- |
| ManageUsers, A/P2 | `genKey`, `revokeKey`, `updateUserSubmit`, `newUserSubmit` awaited rejected native HTTP responses without catches. The visible message stayed Generating/Revoking/Saving and the failure was not displayed. Narrow local catches now show the existing safe failure text and keep modal/draft state. | `8b091d8dc` |
| ManageRoles, A/P2 | `saveCurrentUser` likewise left Saving after a rejected role mutation. A local catch completes the failure display and preserves selected roles. Same underlying error-contract family as ManageUsers. | `e4a198691` |
| Both upload widgets, A/P2 | Six cloud-provider installations supplied only `companionUrl`. Installed RequestClient therefore omitted the outer CSRF header even when the nested Tus transfer headers contained a valid token. Native Companion rejected POST with 403 before provider dispatch. Both components now pass only CSRF in `companionHeaders`; delayed config resolution updates the existing clients through `provider.setCompanionHeaders`. Unrelated custom Tus headers stay on Tus. | `709483c46` |

Runtime sources are `manage-users/src/app/manage-users.component.ts:367`,
`manage-roles/src/app/manage-roles.component.ts:102`,
`form/src/app/component/file-upload.component.ts:316` and
`form/src/app/component/data-location.component.ts:429`, under
`angular/projects/researchdatabox/`. Their adjacent component specs contain the
regressions. No server source or shared error-helper/export was changed.

| Source inventory | Count |
| --- | ---: |
| Angular projects | 22: 20 apps, two libraries |
| Project production TypeScript / external HTML | 259 / 80 |
| Shared `packages/sails-ng-common/src` TypeScript | 141 |
| HttpClient callsites / service owners | 123 / 20 |
| GET / POST / PUT / DELETE callsites | 73 / 35 / 9 / 6 |
| Mapped distinct native R13 route IDs / unmatched callsites | 128 / 0 |
| Recorded project call-graph edges | 3,129 |
| Supplemental resource/protocol sites | 149, including 54 explicit no-HTTP cases |

[angular-source.json](angular-source.json) enumerates every project HttpClient
callsite with exact file/line, request expression, method/type/body/options,
transitive consumers, retained consumer method bodies and input hashes.
[angular-contracts.json](angular-contracts.json) maps all 123 sites to native
method/path/schema/handler sources, response fields, header/CSRF/version rules,
status handling and R14 differential provenance. Public unselected helpers are
included. Three negative controls reject an omitted callsite, wrong HTTP method
and empty native mapping. This is source acceptance review, not a claim of 128
new route executions.

[angular-network.json](angular-network.json) covers non-HttpClient initiators:
two Tus and six cloud-provider installations, three dynamic-module caller sites
covering four native paths, the variable import, i18next, external OpenLayers
tiles, CSS/font/image loads, downloads, navigation, inline DOI links and rendered
HTML entrypoints. It includes 26 literal bundled imports, one in the shared
browser Markdown library. The 54 no-HTTP entries are 20 base tags, 33 fragments
and one local Blob export. Counts are source sites, not wire requests; repeated
protocol operations, shared chunks and institution-provided URLs are described by
their initiator and protocol. No raw fetch/XMLHttpRequest/WebSocket/EventSource
initiator exists in the reviewed first-party client source. Library-owned socket
and transfer behavior is recorded under its uploader initiator.

R14 P3s were checked at actual consumers. Graph projection ignores added meta
and ETag while retaining root/edges/relatedObjects/omittedByAccess. Named-query
load/save catches do not read redundant `errors[].status`. Report save/preview
and branding mutation paths catch failures and clear their pending flags. Those
residual field/cache/error-text differences remain P3; no byte-parity claim is
made. The administration pending-message failures above promote the relevant
part of R14's error-contract P3 to P2. Account link/audit/candidate/enable/disable
siblings were traced and already catch failures. The obsolete self-profile
bundle is parent-recorded inherited B10; there is no tracked profile Angular
project or root-assets self-profile HTTP consumer to invent or repair.

| Focused accepted evidence | Result |
| --- | --- |
| ManageUsers browser specs | 39/39 passed, including 16 new failure cases |
| ManageRoles browser specs | 5/5 passed, including four new failure cases |
| Both upload-widget browser specs | 54/54 passed, including four new immediate/delayed token cases with actual installed RequestClient private header storage |
| Incoming users/roles browser controls | 16 expected failures + 23 passing controls; four expected failures + one passing control |
| Native identity HTTP → extracted consumers | Ten observations: five incoming reject/stay pending, five corrected display safe HTTP500 failure |
| Installed RequestClient → native Companion/session/CSRF | 24 request observations: six incoming 403s, six corrected 200s, 12 explicit outer-header controls; two additional delayed-header update controls |
| Extracted P3 consumer cases | 59 passed for graph fields and named-query/report/branding errors/finalization |

All **98 browser specs** passed on Node 26.11.1 / Chrome Headless 153. Durable
raw logs are in [angular-logs](angular-logs/). Rejected preliminary fixture and
invocation attempts are explicitly labelled in
[angular-rejected-attempts.json](angular-rejected-attempts.json); they supply no
accepted gate. The installed-client HTTP proof uses real Express dispatch,
session cookies and native CSRF, with controlled provider dispatch; it does not
claim live OAuth/cloud transfer. The P3 probes execute extracted methods with
supplied payloads, not deployed HTTP or browser sessions.

Generators and probes are the adjacent `angular-*.cjs` files. Run them from the
repository root using the supplied Node 26 binary; native TypeScript fixture
probes additionally use `--no-experimental-strip-types`. Browser commands and
input/artifact hashes are in [angular-validation.json](angular-validation.json).
All runtime/spec files remain frozen and committed by the parent. Accepted
SR-005/045/049/055 institution gaps and inherited backlog policy are unchanged.
