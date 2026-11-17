# Bounded catalogue and editor schema verification

The accepted full baseline used all supplied v5 form configurations and actual SCU hook reusable definitions. RDMP single-stage discovery matched the audit exactly: `224,224,228,228,230,230,230` fields. Combined discovery and even the system-only collection query failed `CATALOGUE_LIMIT`.

The failed canonical fingerprint input measured **1,754,262 bytes and 43,731 nodes**. The cause was the 1 MiB byte limit, not the 50,000-node limit. Catalogue fields alone accounted for 1,137,424 bytes. Fingerprints now compose individually bounded fields/contracts with an additional bounded aggregate budget, retaining stable invalidation for source/index changes.

The complete generated SDL measured **333,747 bytes**, exceeding the editor transport's 262,144-byte cap. RDMP-only SDL measured 238,422 bytes and publication-only SDL 95,738 bytes. The authenticated schema bridge now accepts selected type/stage scope and retains its transport cap. Compilation omits unrelated variants; server chronicle retains the underlying exception while public errors remain generic. Unscoped oversized SDL still fails closed.

Reduction followed that full reproduction. `scu-grid-shapes.json` interns 49 structural nodes, retaining all property names, nested objects/lists, conditional shapes and all 16 variants; it removes display text, scalar contents, defaults, ownership and diagnostics. The fixture is approximately 25 KB. It retains the exact audited single-stage field counts and the catalogue byte failure, rather than replacing the contracts with title-only forms.

Before source changes, the new catalogue regression reported **two passing, two failing**: all-stage discovery and the audited minimal HTTP collection query both failed `CATALOGUE_LIMIT`. After source changes, all four pass. The all-stage union contains 234 fields, including fields present only in earlier stages. A separate selected-type schema regression with an unrelated broken reusable form reported **one failing before, one passing afterward**. The combined catalogue/schema/fingerprint selection passed **nine tests**, including per-part, aggregate byte/node and accessor protections.

Commands from the repository root:

```sh
TS_NODE_PROJECT=packages/redbox-core/test/tsconfig.json node --no-experimental-strip-types -r ts-node/register/transpile-only packages/redbox-core/node_modules/mocha/bin/mocha.js --no-config --require packages/redbox-core/test/setup.ts --require chai packages/redbox-core/test/unit/record-graphql/scu-catalogue.test.ts packages/redbox-core/test/unit/record-graphql/scoped-schema.test.ts packages/redbox-core/test/model/RecordFormFingerprint.test.ts
```

Exact private baseline commands/logs, integrated checks and release requirements are in the overall ledger. Raw form exports, hook source, screenshots and synthetic diagnostic server scripts remain outside Git.
