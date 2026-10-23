# P7 stable-runtime gate status

> **Current contract after C2 — user decision 2026-10-20.**
> Official v6 requires **driver-repository cache** under accepted
> [ADR0003](../waterline-retirement/adr/0003-orm-reevaluation.md).
> [C2 validation](../waterline-retirement/c2-validation.md) records qualification,
> the separate MongoDB default promotion and Prisma removal. Current `next`
> defaults to `mongodb`; explicit `waterline` remains a temporary transition
> choice. `prisma` is retired and fails with migration guidance. Prisma adapters,
> contracts, generator/freshness/config tooling and root/core dependencies are gone.
> **Prisma-specific P7.1 is superseded**, not satisfied by a GA upgrade. The release
> gate now requires the supported official driver and qualified Node/Mongo/FCV,
> package, Docker, lifecycle, operation and institution recovery matrix; final
> Waterline cache/model/selector retirement; and explicit official-v6 acceptance.
> **P7/G7 remain incomplete.** C2's bounded next evidence does not retire the
> remaining Waterline bridge or settle REL-01 scope/date, SEC-01 or INST-01.
> The Prisma maturity and pilot results below are historical evidence.

## Revised driver cache release gate

The former Prisma CLI/MongoDB-runtime maturity requirement **P7.1 is superseded**
by ADR0003 and the user's driver-cache decision. Installing a newer Prisma pair
is no longer a prerequisite or a supported core build step. C2 removes the pair;
its raw and three-way interoperability results remain archived evidence.

The revised v6 gate requires all of the following:

1. Supported, exact official-driver pins and an evidenced release matrix for
   Node, npm, MongoDB binary/FCV/topology, authentication/TLS/SRV and the actual
   packed core, storage and institution hook artifacts. C2 uses driver 7.7.0,
   standalone MongoDB 8.0.34 / FCV 8.0 and packed Node 24.16.0 / 26.11.1; it does
   not certify arbitrary engines, institutional topology or future release pins.
2. Removal of the temporary Waterline cache adapter, cache-only model/shim/global
   exposure and backend selectors, including Compose/environment forwarding.
   Explicit obsolete configuration must fail with migration guidance. Current
   next deliberately retains explicit Waterline; this requirement is **open**.
3. Final sole-driver core, Docker Mocha/Bruno/branding API/browser, fresh-volume
   startup, clean package/production image and import/type/lifecycle/readiness
   checks, preserving every P0 cache/notification/preview quirk and deferred item.
4. Measured connection, startup, memory and workload budgets for the actual
   deployment, plus rehearsed matching database/index/config/hook/asset recovery
   and designated immutable prior-image rollback. C2's provisional next bounds
   and synthetic checkpoints are evidence inputs, not institution capacity or
   production HA certification.
5. Aligned institution migration/runbooks and explicit official-v6 acceptance.
   REL-01 release scope/date and the remaining security/institution decisions
   remain open; OPS-TX-01 is undecided and supplied stacks remain standalone.

C2 qualification/promotion/Prisma removal can be complete while this gate remains
open. Do not tick G7 or the still-pending bridge/model/selector retirement items
from C2 results. The historical registry/CLI assessment follows unchanged.


## Historical Prisma gate check — before the approved revision

Checked **2026-10-19 UTC / Australia/Adelaide**, against source commit
`ff039a667cb146ecd5133535c60d19d40084bb2e`. Registry queries below ran at
06:16:21–06:16:24 UTC; official documentation was accessed at 06:16:37 UTC.
This is a documentation-only maturity check, not final release qualification.

**P7.1 is NOT SATISFIED. P7.2–P7.6 and G7 are BLOCKED by the mandatory
supported stable CLI and MongoDB-runtime gate.** The live `latest` versions are
still `prisma@8.0.0-rc.23` and `@prisma/orm-mongo@8.0.0-rc.18`; official Prisma
documentation calls ORM 8 a release candidate and its MongoDB library early
access. Neither package has a published non-prerelease 8.x version.

Under the [design release boundary](design.md#1-outcome-and-release-boundary),
[Phase 7 / G7](implementation_plan.md#phase-7--retire-the-bridge-and-qualify-official-v6)
and [ADR](adr/0001-cache-repository-and-prisma-evaluation.md#consequences-and-acceptance-limits),
**Waterline cache removal must not proceed on this RC/early-access pair. The v6
scope or release date must be explicitly reconsidered.** This check records that
required release decision as outstanding; it does not approve shipping the
transitional cache backend as official v6 or waive any later gate.

[G5](p5-validation.md#promotion-verification-and-final-g5-decision) promoted
Prisma to the `next` default, with explicit Waterline selection retained.
[G6](p6-validation.md#g6-decision-cleanup-and-p7-handoff) qualifies the bounded
institution migration/recovery path on that development build. Both facts remain
unchanged. No adapter, selector, model, dependency, lockfile or runtime behavior
is changed by this status record. P7.1 remains unchecked: release pinning and
validation after replacing the RC dependencies are also still outstanding.

## Live npm registry evidence

The following exact command queries the public npm registry without installing
packages. It preserves complete `dist-tags` output and summarizes the complete
published `versions` list by filtering plain `major.minor.patch` versions, then
reporting all such versions in the target 8.x line. The MongoDB package's short
list of historical non-prerelease versions is also printed.

```bash
python3 - <<'PY'
from datetime import datetime, timezone
import json
import re
import subprocess

for package in ('prisma', '@prisma/orm-mongo'):
    print('queried_at_utc:', datetime.now(timezone.utc).isoformat(timespec='seconds'))
    for field in ('dist-tags', 'versions'):
        command = ['npm', 'view', package, field, '--json', '--registry=https://registry.npmjs.org']
        print('$', ' '.join(command), flush=True)
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        if field == 'dist-tags':
            print(result.stdout.rstrip())
        else:
            versions = json.loads(result.stdout)
            stable = sorted(
                (v for v in versions if re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', v)),
                key=lambda v: tuple(map(int, v.split('.'))),
            )
            summary = {
                'published_version_count': len(versions),
                'non_prerelease_version_count': len(stable),
                'latest_non_prerelease_version': stable[-1] if stable else None,
                'prisma_8_non_prerelease_versions': [v for v in stable if v.startswith('8.')],
            }
            if package == '@prisma/orm-mongo':
                summary['all_non_prerelease_versions'] = stable
            print(json.dumps(summary, indent=2))
PY
```

Output, exit zero:

```text
queried_at_utc: 2026-10-19T06:16:21+00:00
$ npm view prisma dist-tags --json --registry=https://registry.npmjs.org
[
  {
    "turso": "5.4.0-dev.61",
    "early-access": "5.12.0-dev.21",
    "typed-sql": "5.19.0-integration-feat-typed-sql.14",
    "patch-dev": "7.9.1-dev.1",
    "integration": "7.10.0-integration-fix-prisma-publish-token.1",
    "next": "8.0.0-rc.10",
    "prev": "7.10.1",
    "latest": "8.0.0-rc.23",
    "dev": "8.0.0-rc.23-dev.153"
  }
]
$ npm view prisma versions --json --registry=https://registry.npmjs.org
{
  "published_version_count": 9375,
  "non_prerelease_version_count": 318,
  "latest_non_prerelease_version": "7.10.1",
  "prisma_8_non_prerelease_versions": []
}
queried_at_utc: 2026-10-19T06:16:23+00:00
$ npm view @prisma/orm-mongo dist-tags --json --registry=https://registry.npmjs.org
[
  {
    "latest": "8.0.0-rc.18",
    "dev": "8.0.0-rc.18-dev.16"
  }
]
$ npm view @prisma/orm-mongo versions --json --registry=https://registry.npmjs.org
{
  "published_version_count": 365,
  "non_prerelease_version_count": 2,
  "latest_non_prerelease_version": "0.17.0",
  "prisma_8_non_prerelease_versions": [],
  "all_non_prerelease_versions": [
    "0.16.0",
    "0.17.0"
  ]
}
```

Registry sources: [`prisma`](https://registry.npmjs.org/prisma) and
[`@prisma/orm-mongo`](https://registry.npmjs.org/@prisma%2Form-mongo).
`latest` is a mutable distribution tag, not a stability certification. The
older stable CLI `7.10.1` belongs to the Prisma 7 workflow, not the selected
Prisma 8 contract/runtime workflow. Historical MongoDB package versions
`0.16.0` and `0.17.0` have no prerelease suffix, but that syntax does not
establish supported stable Prisma 8 MongoDB availability. The official maturity
statements below remain the support evidence; neither historical line satisfies
this pilot's P7 gate.

## Official Prisma maturity/support evidence

Primary sources, accessed **2026-10-19**:

- [Release status](https://www.prisma.io/docs/orm/release-status)
  ([official Markdown](https://www.prisma.io/docs/orm/release-status.md)):
  “Prisma ORM 8 is a **release candidate**”. Its version table, dated
  **16 October 2026**, agrees with both live npm `latest` values. It also states
  that CLI and database-library versions are released separately.
- [Supported databases](https://www.prisma.io/docs/orm/supported-databases)
  ([official Markdown](https://www.prisma.io/docs/orm/supported-databases.md)):
  MongoDB / `@prisma/orm-mongo` is **Early access**. The definition says the
  library works but some PostgreSQL functionality is absent; MongoDB
  transactions are explicitly unavailable.

No npm/documentation discrepancy was found. “General availability is expected
in October 2026” is a forecast, not confirmation that GA has occurred. Prisma
7's continued support is a separate major-version policy and does not qualify
the selected Prisma 8 MongoDB runtime.

Exact read-only query, filtering the retrieved Markdown to the relevant lines:

```bash
python3 - <<'PY'
from datetime import datetime, timezone
from urllib.request import urlopen

pages = {
    'release-status': (
        'Prisma ORM 8 is a **release candidate**:',
        'General availability is expected',
        'Prisma ORM 7 keeps receiving',
        'The two packages have different version numbers',
        '| `prisma` (the command-line tool)',
        '| `@prisma/orm-mongo` (the MongoDB library)',
    ),
    'supported-databases': (
        '| MongoDB ',
        '**Early access.**',
        '`db.transaction()` exists',
    ),
}
for slug, prefixes in pages.items():
    url = f'https://www.prisma.io/docs/orm/{slug}.md'
    with urlopen(url, timeout=30) as response:
        body = response.read().decode()
        print('queried_at_utc:', datetime.now(timezone.utc).isoformat(timespec='seconds'))
        print('url:', response.url)
        print('http_status:', response.status)
    for line in body.splitlines():
        if any(line.startswith(prefix) for prefix in prefixes):
            print(line)
PY
```

Output, exit zero:

```text
queried_at_utc: 2026-10-19T06:16:37+00:00
url: https://www.prisma.io/docs/orm/release-status.md
http_status: 200
Prisma ORM 8 is a **release candidate**: you can install it and build with it today. Until the final release, some details of the API may still change, so code you write now may need small edits later. Each release candidate fixes bugs found in the previous one.
General availability is expected in October 2026.
Prisma ORM 7 keeps receiving bug fixes and security updates for 18 months from the day Prisma ORM 8 reaches general availability. Its documentation stays at [/orm/v7](https://www.prisma.io/docs/orm/v7).
The two packages have different version numbers, and that is normal: they are released separately, and the command-line tool gets more frequent releases. Install both at `latest`; any two `latest` versions work together, and you do not pair the numbers yourself.
| `prisma` (the command-line tool)          | `8.0.0-rc.23`               |
| `@prisma/orm-mongo` (the MongoDB library) | `8.0.0-rc.18`               |
queried_at_utc: 2026-10-19T06:16:37+00:00
url: https://www.prisma.io/docs/orm/supported-databases.md
http_status: 200
| MongoDB                               | Early access              | `@prisma/orm-mongo`    | `npm install @prisma/orm-mongo`    |
**Early access.** The library works and you can build with it, but some of what the PostgreSQL library does is not there yet. The table below and the reference pages say what works on MongoDB, and [what is not available yet](https://www.prisma.io/docs/orm/coming-from-prisma-orm-7#not-available-yet) lists the gaps. Report what you hit on [GitHub](https://github.com/prisma/orm/issues).
`db.transaction()` exists on the PostgreSQL client only, because Prisma ORM does not support MongoDB transactions yet. For multi-document writes on MongoDB, [use the MongoDB driver's session API](https://www.prisma.io/docs/orm/fundamentals/transactions#transactions-on-mongodb) alongside the client.
| MongoDB Atlas, self-hosted MongoDB                     | MongoDB    | Any MongoDB deployment reachable with a `mongodb://` or `mongodb+srv://` URL.                                                                          |
```

## Historical checklist — superseded by the revised driver gate above

This section preserves the earlier Prisma-gated handoff for audit. Its Prisma
upgrade and repository requirements are superseded; use the revised driver gate
above for remaining work.

The [P6 handoff](p6-validation.md#g6-decision-cleanup-and-p7-handoff) and
[Phase 7 plan](implementation_plan.md#phase-7--retire-the-bridge-and-qualify-official-v6)
retain the following required work. These are pending, not performed here:

1. Recheck **both** CLI and MongoDB-runtime stable/support status. Select exact
   release pins, maintain locks with **npm 11.20.0**, and rerun affected contract,
   clean-package and runtime checks; earlier RC evidence alone is insufficient.
2. Before retiring the cache model, adapt **inspect/ensure and effective datastore
   resolution**, which currently require a loaded `CacheEntry` model. Recheck
   existing-volume preparation commands and readiness errors against final
   startup/configuration. Retain explicit index/data remediation without cleanup.
3. Remove the Waterline cache adapter, backend selector, environment/Compose
   forwarding and obsolete cache-only model/shim/global surfaces. Reject **all**
   stale explicit selector configuration, including `prisma`, with actionable
   migration guidance. Retain Waterline for unmigrated persistence domains.
4. Archive the two-adapter comparison and development rollback evidence. Remove
   transition-only tests/jobs while retaining relevant Prisma repository,
   service, raw compatibility, packed-runtime and lifecycle regressions.
5. Repeat final core, Docker Mocha, branding API/browser, clean-package and
   deployment qualification with the **stable, sole-cache-backend v6 artifact**.
   Verify obsolete hook/model dependencies migrate or fail clearly. Recheck the
   institution migration/recovery runbooks against that actual artifact.
6. Keep the existing **12-second source-module-loading timeout** and
   **Solr-before-ready bootstrap indexing errors** visible from P5. Preserve
   deferred TTL/falsy, void best-effort writes/races, notification reset and
   non-atomic preview read/delete behavior; changes need separate decisions.
7. Retain bounded evidence and institution limits for custom mappings/IDs,
   richer values/codecs, private hooks, production security/topologies,
   connection/memory budgets and external-asset recovery. G6 promises neither
   engine downgrade nor v5 rollback. Record the explicit v6 acceptance decision
   only after every gate passes; otherwise reconsider scope/date explicitly.
