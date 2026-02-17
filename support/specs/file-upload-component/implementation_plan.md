# FileUpload Component — Uppy + TUS + Cloud Sources

Create a new `FileUploadComponent` for the v5 form framework, replacing the legacy `RelatedFileUploadField` / `DataLocationField`. Uses Uppy v4.x with Dashboard UI, TUS resumable uploads, and cloud source plugins (Dropbox, Google Drive, OneDrive) via **Companion running as Express middleware** on the same server.

---

## Proposed Changes

### Server-Side: Companion as Express Middleware

#### [NEW] Companion middleware integration

Mount `@uppy/companion` as Express middleware alongside the existing Sails/Express app. This avoids a separate server — cloud source plugins (Dropbox, Google Drive, OneDrive) authenticate and proxy files through Companion routes on the same host.

**Setup requirements:**

- Install `@uppy/companion` as a server-side dependency
- Mount via `companion.app(options)` on a sub-path (e.g. `/companion`)
- Wire `companion.socket(server)` for WebSocket progress
- Configure `providerOptions` in `sails.config.companion`:
  ```js
  companion: {
    secret: '<random-secret>',
    filePath: '/tmp/companion',  // temp download dir
    server: { host: 'localhost:1500', protocol: 'http', path: '/companion' },
    providerOptions: {
      dropbox: { key: 'DROPBOX_KEY', secret: 'DROPBOX_SECRET' },
      drive:   { key: 'GOOGLE_KEY',  secret: 'GOOGLE_SECRET' },
      onedrive:{ key: 'ONEDRIVE_KEY',secret: 'ONEDRIVE_SECRET' },
    },
    uploadUrls: ['https://your-domain/...']  // SSRF allowlist
  }
  ```
- The `companionUrl` on the client side becomes the same origin (e.g. `/companion`)

> [!NOTE]
> The actual OAuth key/secret configuration and provider app registration is a separate deployment concern. The component itself just needs the `companionUrl` to point to the mounted path.

---

### Pending-OID Pattern

The component supports uploading files **before the record has been saved** using the established `pending-oid` pattern:

1. If **no OID** exists (new record), the TUS endpoint uses `pending-oid` as the OID segment: `{brandingUrl}/record/pending-oid/attach`
2. The `RecordController.doAttachment` already handles `pending-oid` specially — it skips record lookup and passes the request straight to the TUS server
3. Uploaded file metadata stores `pending-oid` in `location` and `uploadUrl` fields
4. On first save, `RecordsService.create()` replaces all `pending-oid` occurrences in attachment fields with the real OID
5. On subsequent saves, `RecordsService.updateMeta()` also performs this replacement

The component listens for the **record-saved** event to update its internal attachment URLs from `pending-oid` → real OID, matching the existing `DataLocationComponent` behavior.

---

### sails-ng-common: Component Contract

#### [MODIFY] [file-upload.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/component/file-upload.outline.ts)

Constants, types, and interfaces (refined per user implementation):

| Item                        | Description                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `FileUploadComponentName`   | `"FileUploadComponent"` (as const)                                                                                                     |
| `FileUploadModelName`       | `"FileUploadModel"` (as const)                                                                                                         |
| `FileUploadAttachmentValue` | `{ type: "attachment", location, uploadUrl, fileId, name, mimeType?, notes?, size?, pending? }`                                        |
| `FileUploadModelValueType`  | `FileUploadAttachmentValue[]`                                                                                                          |
| `FileUploadSourceType`      | `"dropbox" \| "googleDrive" \| "onedrive"`                                                                                             |
| Component config props      | `restrictions: Record<string, unknown>`, `enabledSources`, `companionUrl`, `allowUploadWithoutSave`, `uppyDashboardNote`, `tusHeaders` |

The outline now uses the full `Frame` vs `Outline` interface pattern standard to the `sails-ng-common` package, and includes `kind` mapping for all types.

#### [NEW] [file-upload.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/component/file-upload.model.ts)

Config/definition classes implementing the refined interfaces with `accept(visitor)` methods + `FileUploadMap` / `FileUploadDefaults`.

---

### sails-ng-common: Dictionary & Export Registration

#### [MODIFY] [dictionary.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/dictionary.outline.ts)

Add `FileUploadTypes` to `AllTypes` union.

#### [MODIFY] [dictionary.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/dictionary.model.ts)

Add `FileUploadMap`/`FileUploadDefaults` to aggregation arrays.

#### [MODIFY] [index.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/index.ts)

Export new outline + model modules.

---

### sails-ng-common: Visitor Infrastructure

Add 3 methods each (`visitFileUploadFieldComponentDefinition`, `visitFileUploadFieldModelDefinition`, `visitFileUploadFormComponentDefinition`) to these 8 files:

| Visitor File                                                                                                                                                 | Notes                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| [base.outline.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/visitor/base.outline.ts)                   | Interface signatures               |
| [base.model.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/visitor/base.model.ts)                       | Default stubs                      |
| [construct.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/visitor/construct.visitor.ts)         | `setPropOverride` for config props |
| [client.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/visitor/client.visitor.ts)               | Pass-through                       |
| [data-value.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/visitor/data-value.visitor.ts)       | Pass-through                       |
| [json-type-def.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/visitor/json-type-def.visitor.ts) | Pass-through                       |
| [validator.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/visitor/validator.visitor.ts)         | Pass-through                       |
| [template.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/visitor/template.visitor.ts)           | Pass-through                       |

#### [MODIFY] [migrate-config-v4-v5.visitor.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/packages/sails-ng-common/src/config/visitor/migrate-config-v4-v5.visitor.ts)

Add `RelatedFileUpload` / `DataLocation` → `FileUploadComponent` mapping + migration visitor methods.

---

### Angular: Dependencies

#### [MODIFY] [package.json](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/angular/package.json)

Install (client-side only):

```
@uppy/core  @uppy/dashboard  @uppy/tus  @uppy/dropbox  @uppy/google-drive  @uppy/onedrive
```

No `@uppy/angular` — using programmatic API for full control.

---

### Angular: Component

#### [NEW] [file-upload.component.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/angular/projects/researchdatabox/form/src/app/component/file-upload.component.ts)

Key behaviors:

- **Init**: Read config props; derive TUS endpoint from `ConfigService.getBrandingAndPortalUrl` + OID (or `pending-oid`)
- **Uppy setup** (`ngAfterViewInit`): Create `Uppy()` → `.use(Dashboard, { inline: true, target })` → `.use(Tus, { endpoint, headers: { 'X-CSRF-Token' } })` → conditionally `.use(Dropbox/GoogleDrive/OneDrive, { companionUrl })`
- **`upload-success` handler**: Build `FileUploadAttachment`, append to model value, mark dirty
- **Pending-OID**: If no OID, use `pending-oid`; listen for `recordCreated` / `recordSaved` events to swap endpoint and update URLs
- **View mode**: Render file list only (no Dashboard)
- **Disabled state**: When no OID and `allowUploadWithoutSave === false`, show "Save your record to attach files"
- **Cleanup**: `ngOnDestroy` → `uppy.destroy()`

---

### Angular: Registration

#### [MODIFY] [form.module.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/angular/projects/researchdatabox/form/src/app/form.module.ts)

Declare `FileUploadComponent`.

#### [MODIFY] [static-comp-field.dictionary.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts)

Map `FileUploadComponentName` → `FileUploadComponent` and `FileUploadModelName` → `FileUploadModel`.

---

## Verification Plan

### Automated Tests

**[NEW] [file-upload.component.spec.ts](file:///Users/andrewbrazzatti/source/github/redbox-portal-2/angular/projects/researchdatabox/form/src/app/component/file-upload.component.spec.ts)**

1. Component creates successfully
2. Respects `enabledSources` config
3. File list renders existing attachments
4. Disabled state when no OID and `allowUploadWithoutSave === false`
5. `upload-success` handler builds correct `FileUploadAttachment`
6. `ngOnDestroy` cleans up Uppy instance

```bash
cd /Users/andrewbrazzatti/source/github/redbox-portal-2/angular && npm test
```

### Manual Verification

1. Uppy Dashboard renders inline with drag-and-drop
2. Local TUS upload completes and file appears in attachments list
3. Cloud source buttons appear when Companion is configured
4. Pending-OID flow: upload before save → save record → URLs updated
5. View mode shows file list without Dashboard
