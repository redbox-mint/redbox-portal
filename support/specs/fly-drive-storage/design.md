# Flydrive Storage Configuration - Design

## Goal

Introduce a Flydrive v2-based storage abstraction that supports multiple disks (initially filesystem + S3), with a standard datastream implementation that moves uploads from a staging disk to a primary disk and serves attachments from primary storage.

## User Review Required

- Introduces Flydrive v2 and driver packages into `@researchdatabox/redbox-core-types`.
- Requires explicit configuration of storage disks and `record.datastreamService` to enable the new datastream behavior.
- Existing deployments using GridFS require a migration strategy if switching to the new datastream service.

# Design

## 1. Data Model (Waterline Models)

- Purpose and scope: no new persistent models; storage configuration is runtime-only.
- New/changed models and attributes: none.
- Relationships and indexes: none.
- Validation, lifecycle hooks, and defaults: none.
- Access control considerations: none.
- File locations and naming (core-types vs hook, and shim implications): N/A.
- Hook delivery requirements (capabilities + `registerRedboxModels()` if applicable): N/A.

## 2. Services Layer (Business Logic)

- Service responsibilities
  - `StorageManagerService`: wrap Flydrive v2 `StorageManager`, register drivers, validate config, expose disk accessors.
  - `StandardDatastreamService`: implement full `DatastreamService` interface using Flydrive disks.
- Public methods, inputs/outputs, and errors
  - `StorageManagerService.bootstrap()`: register drivers, validate disks, throw on missing disk or invalid driver config.
  - `StorageManagerService.disk(name: string)`: return disk or throw if missing.
  - `StorageManagerService.stagingDisk()`/`primaryDisk()` accessors.
  - `StandardDatastreamService.addDatastreams(oid, datastreams)`: validate staged files, move/copy to primary, return `DatastreamServiceResponse` with per-file messages.
  - `StandardDatastreamService.addDatastream(oid, datastream)`: move single staged file, update metadata.
  - `StandardDatastreamService.removeDatastream(oid, datastream)`: delete from primary, handle missing files gracefully.
  - `StandardDatastreamService.addAndRemoveDatastreams(oid, add, remove)`: process removals then additions.
  - `StandardDatastreamService.updateDatastream(oid, record, newMetadata, fileRoot, fileIdsAdded)`: diff attachments using `attachmentFields` (align with MongoStorageService behavior).
  - `StandardDatastreamService.getDatastream(oid, fileId)`: return `{ readstream }` or `{ body }` per contract.
  - `StandardDatastreamService.listDatastreams(oid, fileId)`: return attachment metadata used by `RecordsService.getAttachments`.
- Transaction boundaries and side effects: file move/copy between disks; optional deletion from staging.
- Dependencies on models, configs, or external services: Flydrive v2, `sails.config.storage`, `sails.config.record.attachments` for staging alignment.
- File locations and naming
  - `packages/redbox-core-types/src/services/StorageManagerService.ts`
  - `packages/redbox-core-types/src/services/StandardDatastreamService.ts`
  - `packages/redbox-core-types/src/config/storage.config.ts`
- Service conventions (extend `Services.Core.Service`, `_exportedMethods`, `bootstrap()`, RxJS, model globals): follow `Services.Core.Service`, declare `_exportedMethods`, use `bootstrap()` for Flydrive init.
- Export/update requirements (ServiceExports index and hook overrides): add to `packages/redbox-core-types/src/services/index.ts` and `packages/redbox-core-types/src/index.ts`; hooks can override via `registerRedboxServices()` with same names.

## 3. Webservice Controllers (REST API)

- Endpoint list (method + path): none added.
- Request/response shapes and status codes: unchanged.
- Authn/authz and policy usage: unchanged.
- Error handling and validation (use `sendResp`): unchanged.
- File locations and naming: none.
- Controller conventions (extend `Controllers.Core.Controller`, `init()`, `_exportedMethods`): unchanged.
- Export/update requirements (ControllerExports index, routes, auth config): none.

## 4. Ajax Controllers (Controllers)

- Endpoint list (method + path or action): none added.
- Request/response shapes: unchanged.
- Authn/authz and policy usage: unchanged.
- Error handling and validation (use `sendResp`): unchanged.
- File locations and naming: none.
- Controller conventions (extend `Controllers.Core.Controller`, `init()`, `_exportedMethods`): unchanged.
- Export/update requirements (ControllerExports index, routes, auth config): none.

## 5. Angular App(s)

- Apps/modules to add or modify (embedded apps only): none.
- Routes: do not use Angular Router; N/A.
- Components and services: none.
- Data flow to/from APIs: unchanged.
- State management and error handling: unchanged.
- File locations and naming (Angular workspace + EJS view + assets output): none.
- EJS view wiring (component tag + hashed asset includes using `CacheService.getNgAppFileHash`): none.
- Render path (typically `RenderViewController.render` with `locals.view`): none.

## 6. Additional Views

- View templates to add/modify: none.
- Server-side data needed to render: N/A.
- Where view is wired in (e.g., RenderViewController.render): N/A.
- Hook asset/view copy behavior if applicable: N/A.

## 7. Navigation Configuration

- Menu/route entries to add/modify: none.
- Role/permission gating: N/A.
- File locations and naming: N/A.

# Consistency Analysis

- Cross-checks across all layers
  - Disk names in `storage.config.ts` must match `sails.config.storage` disk entries.
  - Staging disk must align with TUS upload location configured via `record.attachments`.
  - `StandardDatastreamService` must implement the full `DatastreamService` interface; other services assume all methods exist.
- Missing pieces or conflicts
  - No migration path for existing GridFS attachments is defined.
  - Cross-backend move may require copy+delete fallback.
- Assumptions
  - Staged uploads provide stable `fileId` paths on the staging disk.
  - Deployments enable the new service via `record.datastreamService` explicitly.
- Open questions
  - Should the default move strategy be move or copy+delete?
  - Is a one-time migration required for existing attachments when switching services?
- Risks
  - Misconfigured disks can break uploads/downloads.
  - Switching services without migration makes old attachments unavailable.
  - S3 misconfiguration causes runtime failures if validation is incomplete.
