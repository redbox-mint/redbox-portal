**SPEC: one NEW A/P2 finding. R21 cannot close SR-055 on the reviewed trees.**

- **A/P2 — incomplete WSU build conversion.** [Dockerfile:2](/home/andrew/src/bitbucket/redbox-hook-wsu-v6/Dockerfile:2) introduces required `REDBOX_BUILD_IMAGE`, but `support/build/build_local.sh` and `nexus_deploy.sh`, still invoked by CircleCI, pass only `REDBOX_PORTAL_IMAGE`. Intercepted commands omit the builder argument even with both environment variables supplied, leaving its `FROM` empty. At baseline `14ab99e`, both stages used the supplied runtime argument; this failure is introduced. Spec requirement: “aligned build/Docker/Compose/CI and maintenance scripts” ([tasks.md:895](/home/andrew/src/github/redbox-portal/support/specs/sails-retirement/tasks.md:895)). Pass both qualified inputs or explicitly retire those entrypoints.

**A/P3 evidence corrections:** the [task header](/home/andrew/src/github/redbox-portal/support/specs/sails-retirement/tasks.md:3) claims 55/55 although only 54 are checked. R20’s packed driver also lacks flags or retained environment proof supporting “strict” installation. Both need precise qualification under “Record commit/artifact … failures and limitations” ([tasks.md:64](/home/andrew/src/github/redbox-portal/support/specs/sails-retirement/tasks.md:64)). I agree with the parent’s P3 classification for peer-policy evidence: the reported explicit strict rerun passes, and I found no contrary product consequence.

SR-005/045/049 retain their authorized local scope. R20 correctly reopens SR-055 and distinguishes its derivative image and fresh checks from historical browser/Angular, replica-set and complete native-recovery evidence. No additional non-HTTP service/configuration defect or scope creep was verified.

**Command evidence**

- Reviewed both pinned diffs; verified `50293cc2..c2f547cc` changes tests only.
- SHA256 checks: **66/66 original, 83/83 R18, 117/117 R19, 195/195 R20** match. Archived WSU **226/226** match; provenance hashes match **227 WSU + 1,162 portal** pinned Git files.
- Fresh Node **26.11.1** closure/inventory/reconciliation: exit **0**; **1,219 candidates**, zero violations; **1,190 inventory files**, zero unclassified; all **1,261 baseline entries** reconcile, plus **430 added candidates**.
- Build-script reproduction used an in-memory Docker stub; no login/build/push occurred. npm configuration reads confirmed repository `true/false` versus `/tmp` `false/true` for strict/legacy peers.
- No runtime suites rerun; no reviewer file modifications or commits.
