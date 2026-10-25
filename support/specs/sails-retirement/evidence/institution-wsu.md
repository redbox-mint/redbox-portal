# Western Sydney University institution qualification

Recorded 2026-10-26. This record designates the real WSU hook and distinguishes
local-equivalent execution from access to production. Earlier bundled-hook
stand-in evidence remains a historical snapshot; it is not relabelled WSU.

## SR-005 — Institution, source decision and topology

The portal maintainer designated Western Sydney University (WSU), specifically
`redbox-hook-wsu` branch `feature/v5-refactor` at
`14ab99eb3a89434b9c886d51d5edc37447f43588`. The original checkout is
`/home/andrew/src/bitbucket/redbox-hook-wsu`; conversion uses the separate
`/home/andrew/src/bitbucket/redbox-hook-wsu-v6` worktree on `feature/v6-express`.
The sibling master is `4d7fef81654a785fc24470bceb017a9169cc351c`.
The original untracked migration notes and logs were read, retained and hash checked.

The hook peers `@researchdatabox/redbox-core@5.0.1-beta.11285` and uses mutable
`qcifengineering/redbox-portal:develop-pdfgen`. The peer is a real published npm
prerelease, but neither it nor a mutable development tag establishes production.
Head `14ab99e` explicitly says it rebuilds against patched develop core. Master
targets v4.3; `origin/hotfix/v2.0.4.1-core-v4.5.6` is another historical v4
reference. No branch, deployment manifest or supplied note establishes WSU's
actual production image. Production release coverage is therefore unknown.

**Designated released-source fallback:** released v5.0.4, portal source
`c1dda53999f3b026347008731f33dba834e06c27`, Linux amd64 image
`qcifengineering/redbox-portal@sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9`,
with WSU **`49962062859cd904fddae2076d8b7e4abf59d40d`** (2026-10-20).
This is the last WSU revision before `6624ff6` introduced migrations requiring
independent dashboard models absent from that release. The five WSU types,
forms, migrations, ROR bootstrap, S3 and local-auth configuration are retained.
Target conversion is from the designated latest hook `14ab99e`, including its
later fixes; no development core must be installed between source and v6.
The task authorizes choosing this defensible released fallback when history does
not establish production. **It is not evidence that WSU production uses it.**

The source image runs Node **24.16.0**, npm **11.13.0**, Sails **1.5.17**; its
historical installed core manifest is **0.0.1-beta.9022**, so artifact hashes are
authoritative. Published npm v5.0.5/tag `b27198ef35bba0eeb35a690458baf7abf644b8a2`
was also examined: it has no independent dashboard model, and pulling Docker
`qcifengineering/redbox-portal:5.0.5` returned `not found`. No compatibility run of
that npm release or the declared beta peer is claimed.

Latest WSU `14ab99e` **failed** on released v5.0.4 at
`redbox-hook-wsu:20261022T010000-plan-pdf-dashboard` with
`dashboard/workflow models unavailable`. No migration was skipped or falsely
recorded. The compatible historical hook then actually completed its migrations,
accepted five synthetic records through the source HTTP API and passed fresh
login plus all five record/form/workflow/edit-page reads. Its declared peer does
not match the release manifest; this is demonstrated selected runtime
compatibility, not a claim that the original package contract or typecheck passes.
The released dev-tools package lacks the newer compiler wrapper's emitted target;
the archived hook was emitted with the original installed TypeScript compiler
and `--noCheck --declaration false --declarationMap false`. Ordinary typechecking
against the installed development dependency tree failed and is not counted.
The scratch image contains only this emitted historical hook, its assets and
exact `xmlbuilder@15.1.1`; it never mounts current application source.

Source configuration is `/mnt/docker-storage/sr-wsu/v5-state/release.cjs`, SHA256
`f20dbb4cfc7ebd31d0902a4cbdb31de6b8d622a799b831d44dfe58abccb488ce`.
Its retained full configuration, installed hook, hook source archive and image
are part of the checkpoint. Source-hook archive SHA256 is
`f96da1d4191d35c184353db9b8d880828ba7f4cf22eaab44efb4e79b281ac095`.
The first source harness used the obsolete `solr.options` location. Selecting
`solr.cores.default.options` corrected the lookup; the source then served HTTP.
The disposable Solr `_default` wildcard conflicted with the required string
wildcard. The local operator explicitly replaced that one dynamic field before
checkpointing. Full Solr search/indexing behavior is not claimed by HTTP reads.

| Surface | Repository evidence / chosen local equivalent | Production access gap |
| --- | --- | --- |
| HTTP/deployment | Hook development Compose, `/default/rdmp`, canonical public URL; v6 uses explicit module and institution executable | Actual ingress/proxy/root/TLS settings and deployed image unknown |
| Auth | Development local admin/PDF-bot settings; local auth with fresh v6 session/CSRF is rehearsed | No institution credentials or federation metadata; WSU OIDC/AAF/SAML is not established or qualified |
| Mongo source | Checked-in v5 Compose selects MongoDB 7 standalone | Actual production engine/FCV, credentials, TLS and set membership unknown |
| Mongo target | Node 26.11.1, MongoDB 8.0.34/FCV 8.0 and 9.0.4/FCV 9.0; two independent standalone servers, separate portal/storage databases plus separate logical Agenda/session databases | No claim for institution TLS/auth/replica-set combinations; prior generic replica-set tests remain separately scoped |
| Search | Solr 8.11.1, core `redbox`, hook schema/preindex configuration | Real institution index contents and infrastructure unavailable |
| Primary bytes | S3 driver, attachment key prefix `attachments/`; local SeaweedFS 4.47 S3 endpoint with synthetic credentials | Real bucket/IAM/encryption/ACL infrastructure unavailable |
| Other bytes | Filesystem staging, Figshare staging and `/publications`; packaged WSU views/assets/templates/locales | Production paths/mounts and backup integration unknown |
| External effects | DOI/DataCite configuration, PDF jobs and generated publication/harvest files retained | No real DOI/email/Figshare publication is authorized or claimed |

Mongo candidate immutable IDs remain those in [P7](p7-qualification.md).
Seaweed uses
`chrislusf/seaweedfs:4.47@sha256:ce9e796f1fe6f06968f4c04bdaf8f678dad9c8acdfef3d244133d71bfa6bf882`.
The source local Mongo candidate is
`mongo:7.0.43-jammy@sha256:f71f6d0913c945096cd058557cbadf4ad435007f378d84b3c4c636c928735e72`.
No application command raises FCV or performs an in-place engine/topology upgrade.
Engine/FCV changes require the operator's vendor-supported procedure, independent
checkpoint and verification; a logical restore to an isolated target is recorded
separately from an engine upgrade.

The reconciliation owner is **WSU deployment operator (designated by the portal
maintainer, Andrew Brazzatti)**. No more specific owner was found in the hook docs.

## Conversion findings and fixes

The conversion preserves the five WSU record types, workflow forms, named queries,
reports, vocabularies, branding, publication templates, PDF requests and all 25
historical migration names. Registration is neutral data. The institution
executable explicitly binds four record operations, migrations and HTTP handlers;
maintenance uses the same selected configuration and storage extension.

First-institution friction produced portal commit `fd2ae641f`:

- `check --v6` now rejects legacy discovery metadata and missing neutral public
  exports; subprocess regression coverage is included. The ordinary dependency
  check alone had misleadingly passed an unconverted manifest.
- The migration guide now uses actual production policy names, explicitly adds
  CSRF to extension routes, explains brand-scoped Admin checks, documents the
  institution composition executable, and corrects migration/bootstrap timing.
- Institution conversion precedes core's lexical hook converters. It handles only
  four known WSU expressions, including nested notification/queued declarations;
  templates and unknown expressions are preserved for strict validation.
- Old singleton/global controller/service/model lookups became constructed
  operations, selected HTTP inputs and migration-only callbacks using the owned
  pools. New writes use core codecs and server-owned revisions; no client is
  opened by WSU migration callbacks. A source-smoke cross-package BSON constructor
  failure was fixed in the hook by using core codecs/client-generated identities.
- Single regeneration is now POST with auth, CSRF and current brand-scoped Admin.
  Public downloads require published eligibility, selected bytes and matching
  publication/source brand/link. These intentional legacy-client changes are
  documented in the WSU deployment guide and tested through Express policies.
- Hook build/Compose/entrypoint metadata now targets v6. Old Sails test/core-mount
  runners explicitly refuse and direct operators to v6 guidance.

Portal runtime source has not changed in this work. Fresh dev-tools suite:
**54 passing**. WSU production source compiles; final unit suite: **432 passing**.
Historical WSU tests were adapted to explicit callbacks without deleting their
pagination, CAS, audit, idempotence, exporter or form assertions. Unit execution
uses transpile-only for pre-existing fixture typing problems; production source
compilation remains type checked. The v5 source compiler attempts and qualified
artifact/recovery results are accounted separately below.

## Execution and artifact accounting

Work logs/artifacts are retained under `/mnt/docker-storage/sr-wsu/`. Source-smoke
runs use dependency symlinks and are not clean-artifact proof. The committed
`packages/redbox-core/test/qualification/wsu.cjs` refuses nonlocal/nondisposable
URLs and checks actual engine/FCV values, configured forms, auth, S3, worker state,
persistence ownership and restart. Portal driver commits: `badf2cc68`, `62b52dc94`; recovery verifier/auditor controls: `bb78ee9c2`.

| Gate | Observed result | Scope |
| --- | --- | --- |
| WSU unit / production compile | 432 passing / compile exit 0 | Converted hook source |
| Portal dev-tools | 54 passing | Full affected suite, including new CLI regression |
| Node 26.11.1 + Mongo 8.0.34 / FCV 8.0 | Pass: selected maintenance, five types, 12 persisted forms, login/CSRF, S3, real worker, drain timeout/retained pools, successful stop/pools 0, restart | Source composition on two standalone servers; `matrix8-source5.log` |
| Node 26.11.1 + Mongo 9.0.4 / FCV 9.0 | Same checks pass | Source composition on two standalone servers; `matrix9-source4.log` |

First driver attempts used an incorrect expected persisted-form count (13 included
the generated view-only form). The corrected driver checks every configured
workflow's actual form, with 12 persisted forms. Early S3 writes failed because
the disposable Seaweed service had no seeded S3 identity; recreating it with the
same synthetic credentials and bucket used in WSU Compose corrected the harness.
Those attempts are retained and not counted as passing combinations.

The latest extended source rows also pass all five HTTP metadata/form/workflow
reads and real institution mutation-route authentication/CSRF controls. Both
processes exited 0. The source checkpoint has **28 collections / 5,162 documents**
across portal, storage, Agenda and session databases. Native dumps restored into
isolated Mongo 8 targets with zero failed documents, and all document/index
checksums match. This logical restore is distinct from an in-place engine upgrade.
Complete source image payload: **32 layers / 527,278,080 bytes**, SHA256
`049bf649d15f87e805125d0aa069dcfb043e43bc98d793c98943bc9396231dcc`.
S3 object bodies/checksums, staging/publication/configuration files, installed hook,
source hook archive and Solr snapshot are checkpointed too.

Fresh full root tooling suite: **20 passing**, including three auditor controls
for offline legacy-metadata rejection versus live access. The new dev-tools check
and negative WSU literal initially produced five auditor findings; explicit,
narrow AST classifications now distinguish those rejection checks/fixtures while
retaining live-access failures. Current committed source has **zero executable
violations / zero forbidden dependency entries** and all **1,261** baseline
inventory files reconcile. These are source checks, not installed-image claims.

Clean installed WSU artifacts, cutover, partial-failure restoration, final
qualification and final task disposition are still pending in this live record.
