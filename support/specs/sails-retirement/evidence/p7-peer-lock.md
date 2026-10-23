# Clean core peer-lock repair

The clean Docker build from `4249667dc` and a retry from `faadc1def` both failed
core `npm ci`, exit **1/EUSAGE**, for missing peers including openapi-types,
Vitest/Vite/lightningcss and their bindings. Explicit `--strict-peer-deps` alone
did not repair the lock. The earlier native install had inherited **user-level
`legacy-peer-deps=true`**: npm's legacy setting disables peer handling even when
strict is also requested. Consequently that native success did not reproduce
the clean Docker policy. The packages built/packed successfully, but the earlier
claim of equivalent strict native installation is withdrawn.

Exact Node **26.11.1 / npm 11.20.0** in the clean source archive reproduced the
failure without Docker. The same read-only install preflight is the red/green
diagnostic; no source code, timeout or test assertion changes are involved:

```sh
cd /mnt/docker-storage/sr-p7-clean-4249667/packages/redbox-core
npm ci --dry-run --ignore-scripts --strict-peer-deps \
  --legacy-peer-deps=false --no-audit --no-fund
# Before: exit 1/EUSAGE; missing openapi-types@12.1.3, vitest@5.0.5,
# vite@8.3.5, lightningcss@1.33.0 and their peer/transitive entries.
npm install --package-lock-only --ignore-scripts --strict-peer-deps \
  --legacy-peer-deps=false --no-audit --no-fund
# Preserve the pre-existing SASLprep 1.5.5 entry when npm hoists its location;
# do not take npm's unrelated selection of 1.6.1.
npm ci --dry-run --ignore-scripts --strict-peer-deps \
  --legacy-peer-deps=false --no-audit --no-fund
# After: exit 0; Linux graph reports 23 additions / 1 relocated removal.
```

Local logs are `p7-core-peer-{red,repair,green,preserved-green}.log` under ignored
`.tmp/sails-retirement/`. The final preserved green check is the recorded result;
dry-run success is not a claimed successful full image build.

The repaired lock adds exact peer resolutions (not package.json ranges):
**openapi-types 12.1.3**, **Vitest/mocker/spy 5.0.5**, **Vite 8.3.5**,
**lightningcss 1.33.0**, **rolldown/bindings 1.2.15**, OXC types **0.155.0** and
their integrity-pinned transitive/optional platform entries. The root manifest
entry is identical; no existing shared package entry changes version. SASLprep
**1.5.5** moves from MongoDB's nested path to its hoisted path unchanged.
Npm updates dev/optional classifications for the now-complete peer graph.

Core now owns a minimal `.npmrc` matching the application's exact/script-free/
strict policy, including explicit `legacy-peer-deps=false`, so a user's global
preference cannot silently change clean core qualification. Docker strict
install commands also spell out that value across package boundaries. Existing
explicit PDF-hook legacy compatibility installation remains separately declared.
No global npm/user configuration was edited. Full artifact/build/test outcomes
are recorded in [P7 qualification](p7-qualification.md).

The subsequent fresh archive and clean Docker build from `4254c2ee2` both ran
the actual strict core `npm ci`, not just dry-run: **1,708 packages installed,
exit 0** in each. All nine native package builds also passed. These close the
specific lock/install regression; final packed/image results and the separate
production Express composition gate remain in the linked P7 evidence.
