# P7 production storage-driver lock repair

The clean production image built from `4254c2ee22e3932b3fd30b1c85ac309001b35c10`
passed offline exports/assets (**1 case, 6 views, 20 Angular applications**) but
failed the real split-datastore component case at `storage.addDatastream`:
**0 passing / 1 failing / 0 skipped**, runner exit **1**. The image is not
qualified by its successful build or asset check.

Image manifest list:
`sha256:47faf880d32fdbc0c00c21c516ed84ef3ea44930bd832cf25992a675b93f9b64`;
platform manifest:
`sha256:411821084ffc5f1d96285b4ff91ac4020e8db8f95d5cbd0b6e01591ba1ea018b`;
config:
`sha256:5f15101e202fea6c3fcc23dc6d037a53adc5578a2ffa85ec4f6462afa9f4f538`.
These are local build identifiers; no image was published.

## Reproduction and cause

Inside this immutable image, `createRequire` at the emitted core and storage
extension entrypoints resolved MongoDB **7.7.0** and **6.21.0** respectively.
Serializing a hook-created ObjectId with the core/pool driver's BSON serializer
failed with `BSONVersionError: Unsupported BSON version, bson types must be from
bson 7.x.x`, exit **1**. This is the same package boundary crossed by GridFS.
No database, authentication or transport stub supplied this failure.

Both direct manifests and the root lock's local-package metadata already pin
**7.7.0**. The root lock nevertheless retained five obsolete nested entries
under `packages/sails-hook-redbox-storage-mongo/node_modules/`: MongoDB 6.21.0,
BSON 6.10.4, mongodb-connection-string-url 3.0.2, @types/whatwg-url 11.0.5 and
TypeScript 6.0.2. The clean production `npm ci` installed them. Reinstalling the
storage package independently from its own correct lock had masked the root
production graph in earlier source-checkout tests.

The repair removes those five obsolete entries. The existing root MongoDB 7.7.0
and TypeScript 5.9.3 satisfy the exact local-package requirements. No direct
manifest or remaining locked package version changes, range, broad override,
new driver, test skip or relaxed assertion is introduced. The artifact verifier
now explicitly checks both actual driver resolutions and cross-package BSON
compatibility before its asset checks; the real GridFS case is retained.

## Fresh production install result

A new `git archive 4254c2ee2` extraction was prepared beneath
`/mnt/docker-storage/sr-p7-clean-4254c2e/.tmp/root-lock-green` and only the repaired
root lock was copied over it. This is an isolated pre-commit lock reproduction,
not a claim that that old commit contained the repair.

```sh
npm ci --omit=dev --ignore-scripts --strict-peer-deps --legacy-peer-deps=false --no-audit --no-fund
```

Node **26.11.1**, npm **11.20.0**: **1537 packages**, exit **0**. A subsequent
Node process used `createRequire` anchored at each local package manifest,
asserted both resolutions equal **7.7.0**, and serialized a storage-created
ObjectId through core BSON without error: exit **0**, `bsonCompatible: true`.

Ignored logs: `p7-clean-image-build4.log`, `p7/artifact-4254c2e/`,
`p7-image-bson-red.log` and `p7-root-lock-green-install.log` beneath
`.tmp/sails-retirement/`. The successful fresh install does not replace the
required rebuilt-image real-byte test; its actual final result is recorded in
[P7 qualification](p7-qualification.md#sr-047--clean-packed-artifacts).
