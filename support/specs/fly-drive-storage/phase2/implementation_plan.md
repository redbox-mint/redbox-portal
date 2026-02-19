# Fix fly-drive-storage Design Issues

## Goal Description

Fix design issues in `fly-drive-storage` implementation. Specifically, make S3 driver visibility configurable and ensure `StorageManagerService` is globally declared to remove awkward access patterns.

## Proposed Changes

### `packages/redbox-core-types`

#### [MODIFY] [services/StorageManagerService.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/redbox-core-types/src/services/StorageManagerService.ts)

- Add global declaration at the end of the file:

```typescript
declare global {
  var StorageManagerService: Services.StorageManager;
}
```

#### [MODIFY] [config/storage.config.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/redbox-core-types/src/config/storage.config.ts)

- **Line 9**: Add `visibility?: string;` to `FSDriverOptions`.
- **Line 17** (approx): Add `visibility?: string;` to `S3DriverOptions`.

#### [MODIFY] [services/StorageManagerService.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/redbox-core-types/src/services/StorageManagerService.ts)

- **Line 173**: Change to `visibility: diskConf.config.visibility || 'public',`
- **Line 188**: Change to `visibility: diskConf.config.visibility || 'public',`

#### [MODIFY] [services/StandardDatastreamService.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/redbox-core-types/src/services/StandardDatastreamService.ts)

- **Line 9**: Remove `import type { Services as StorageManagerServices } ...`
- **Line 10**: Remove `StorageManagerService` from import list.
- **Line 12**: Remove `type IDisk = ...`
- **Line 190**: `const stagingDisk = StorageManagerService.stagingDisk();` (No change needed in code, but now uses global)
- **Line 191**: `const primaryDisk = StorageManagerService.primaryDisk();` (No change needed in code, but now uses global)
- **Line 219**: `const primaryDisk = StorageManagerService.primaryDisk();`
- **Line 258**: `const primaryDisk = StorageManagerService.primaryDisk();`
- **Line 291**: `const primaryDisk = StorageManagerService.primaryDisk();`

### `packages/redbox-core-types`

#### [MODIFY] [DatastreamService.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/redbox-core-types/src/DatastreamService.ts)

- **Import**: `import type { Services as StorageManagerServices } from './services/StorageManagerService';`
- **Line 16**: Change `fileRoot: string` to `stagingDisk: StorageManagerServices.IDisk`.

#### [MODIFY] [services/StandardDatastreamService.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/redbox-core-types/src/services/StandardDatastreamService.ts)

- **Import**: Ensure `StorageManagerServices` is available (it was removed in previous step, might need to re-add or just use `Services.StorageManagerService.Services.IDisk` via import changes or `IDisk` type alias).
- **Line 99**: Change `_fileRoot: string` to `stagingDisk: StorageManagerServices.IDisk` (or `IDisk`).
- **Line 132**: Update `addAndRemoveDatastreams` call to pass `stagingDisk`.
- **Line 186**: Update `addDatastream` signature to `addDatastream(oid: string, datastream: Datastream, stagingDisk?: StorageManagerServices.IDisk): Promise<unknown>`.
- **Line 190**: Use passed `stagingDisk` or fallback to `StorageManagerService.stagingDisk()`.

#### [MODIFY] [services/RecordsService.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/redbox-core-types/src/services/RecordsService.ts)

- **Line 1826**: Update `updateDatastream` call. Instead of `attachmentsDir`, pass `StorageManagerService.stagingDisk()`. Remove logic that reads `attachmentsDir` from config.

### `packages/sails-hook-redbox-storage-mongo`

#### [MODIFY] [api/services/MongoStorageService.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal/packages/sails-hook-redbox-storage-mongo/typescript/api/services/MongoStorageService.ts)

- **Line 742**: Change signature to `updateDatastream(oid: string, record, newMetadata, stagingDisk: any, fileIdsAdded)` (use `IDisk` type if importable).
- **Line 775**: Pass `stagingDisk` to `addAndRemoveDatastreams`.
- **Line 845**: Update `addAndRemoveDatastreams` signature to accept `stagingDisk`.
- **Line 847**: Pass `stagingDisk` to `addDatastream`.
- **Line 805**: Update `addDatastream(oid, datastream, stagingDisk)` signature.
- **Refactor `addDatastream`**:
  - Remove logic reading `record.attachments` config and `attachmentsDir`.
  - Remove `fs.createReadStream(fpath)`.
  - Use `await stagingDisk.getStream(fileId)` to get the readable stream.
  - Update `streamFileToBucket` (or inline it) to accept a `Readable` stream instead of a file path.

## Verification Plan

### Manual Verification

- Verify `StorageManagerService` can be accessed globally without errors.
- Verify S3 driver uses configured visibility.
