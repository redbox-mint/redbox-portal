# Uppy and TUS Architecture

This page documents how ReDBox orchestrates uploads using:

- Uppy frontend plugins (`@uppy/tus`, provider plugins)
- ReDBox attachment endpoints (`/record/:oid/attach` for browser TUS uploads, plus `/companion/record/:oid/attach` companion route)
- Optional Uppy Companion middleware (`/companion/*`)

## Component Architecture

```mermaid
flowchart LR
    A["Browser: FileUploadComponent (Angular)"] --> B["Uppy Core + Dashboard"]
    B --> C["TUS Plugin (@uppy/tus)"]
    B --> D["Provider Plugins (Google Drive / OneDrive / Dropbox)"]
    C --> E["ReDBox Browser Attach Endpoint\n/:branding/:portal/record/:oid/attach"]
    D --> F["Companion Middleware\n/companion/*"]
    F --> G["Provider OAuth + Provider APIs"]
    F --> H["Redbox Companion Attach Endpont\n/:branding/:portal/companion/record/:oid/attach"]
    E --> I["RecordController.doAttachment"]
    H --> I
    I --> J["TUS Server + Datastream/Storage Services"]
    J --> K["Storage (filesystem/S3 via configured services)"]
```

## Local File Upload Flow (TUS)

```mermaid
sequenceDiagram
    participant U as "User Browser"
    participant FC as "FileUploadComponent"
    participant TUS as "Uppy TUS Plugin"
    participant RB as "ReDBox /record/:oid/attach"
    participant RC as "RecordController.doAttachment"
    participant ST as "TUS Server + Storage"

    U->>FC: Select local file
    FC->>TUS: Configure endpoint + headers (incl CSRF)
    TUS->>RB: POST create upload
    RB->>RC: Route to doAttachment
    RC->>ST: Create/upload session
    TUS->>RB: PATCH chunks
    RB->>RC: Stream chunk handling
    RC->>ST: Persist chunks/finalize
    ST-->>RB: Upload URL + file id
    RB-->>TUS: Upload success
    TUS-->>FC: upload-success event
    FC-->>U: Attachment appears in form model
```

## Companion Provider Upload Flow

```mermaid
sequenceDiagram
    participant U as "User Browser"
    participant FC as "FileUploadComponent"
    participant CP as "Companion /companion/*"
    participant PR as "Cloud Provider OAuth/API"
    participant RB as "ReDBox /companion/record/:oid/attach"
    participant PA as "companionAttachmentUploadAuth"

    U->>FC: Choose provider source (e.g. Drive)
    FC->>CP: Start provider auth/connect flow
    CP->>PR: OAuth redirect + token exchange
    PR-->>CP: Access token
    CP-->>FC: Provider file metadata/stream
    CP->>RB: Server-side upload create/chunks
    RB->>PA: Validate shared secret + locality
    PA-->>RB: Allow companion bypass flag
    RB-->>CP: Upload accepted/finalized
    CP-->>FC: Imported file available to Uppy
```

Route notes:

- `/:branding/:portal/record/:oid/attach` and `/:branding/:portal/record/:oid/attach/:attachId` are used by browser/local uploads and are CSRF-protected.
- `/:branding/:portal/companion/record/:oid/attach` and `/:branding/:portal/companion/record/:oid/attach/:attachId` are used by companion/remote provider uploads.
- Companion auth bypass is route-scoped to `/:branding/:portal/companion/record/:oid/attach*`.

## Companion Authorization Orchestration

Companion requests are authorized before handing over to Uppy Companion app logic.

```mermaid
flowchart TD
    A["Incoming request"] --> B{"Path matches /companion/*?"}
    B -- "No" --> C["Pass to next middleware"]
    B -- "Yes" --> D{"Authenticated session?"}
    D -- "No" --> E["Return 401 JSON"]
    D -- "Yes" --> F{"Branding context present + valid?"}
    F -- "No" --> G["Return 403 JSON"]
    F -- "Yes" --> H{"Companion path rules configured?"}
    H -- "No" --> I["Allow (authenticated default)"]
    H -- "Yes" --> J{"PathRules canRead?"}
    J -- "No" --> K["Return 403 JSON"]
    J -- "Yes" --> I
    I --> L["Run companion middleware\n(token restore, send-token flow,\nlazy app/socket init, provider APIs)"]
```

## Key Code Paths

- Companion middleware orchestration:
  - `packages/redbox-core-types/src/config/http.config.ts`
- Companion config defaults:
  - `packages/redbox-core-types/src/config/companion.config.ts`
- Attach endpoints:
  - `packages/redbox-core-types/src/config/routes.config.ts`
- Attach endpoint policies:
  - `packages/redbox-core-types/src/config/policies.config.ts`
  - `packages/redbox-core-types/src/policies/companionAttachmentUploadAuth.ts`
- Uppy frontend integration:
  - `angular/projects/researchdatabox/form/src/app/component/file-upload.component.ts`
