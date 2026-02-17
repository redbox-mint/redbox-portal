# TUS and Uppy Companion Setup

This guide explains how to configure resumable uploads (TUS) and cloud provider imports (Uppy Companion) in ReDBox Portal.

## Overview

ReDBox file uploads use:

- `@uppy/tus` in the Angular `FileUploadComponent`
- TUS server endpoints at:
  - Browser/local upload route (CSRF-protected): `/:branding/:portal/record/:oid/attach`
  - Companion/remote provider upload route: `/:branding/:portal/companion/record/:oid/attach`
- Optional Uppy Companion middleware at `/companion/*` for provider sources (Google Drive, OneDrive, Dropbox)

## 1. Enable Companion

Companion defaults are defined in:

- `packages/redbox-core-types/src/config/companion.config.ts`

Set environment variables:

```bash
UPPY_COMPANION_ENABLED=true
UPPY_COMPANION_SECRET=<at-least-32-characters>
UPPY_COMPANION_FILE_PATH=/tmp/companion

# Public app URL used for provider callback handling
UPPY_COMPANION_HOST=localhost:1500
UPPY_COMPANION_PROTOCOL=http
UPPY_COMPANION_PATH=/companion
```

Provider credentials:

```bash
# Google Drive
UPPY_GOOGLE_KEY=<google-client-id>
UPPY_GOOGLE_SECRET=<google-client-secret>

# OneDrive
UPPY_ONEDRIVE_KEY=<onedrive-client-id>
UPPY_ONEDRIVE_SECRET=<onedrive-client-secret>
```

## 1.1 Provider OAuth App Setup (External Docs)

Use these external references when creating provider OAuth apps/client credentials.

### Dropbox

- Uppy Dropbox provider setup (includes Companion-specific notes and scopes):
  - https://uppy.io/docs/dropbox/
- Dropbox OAuth guide:
  - https://developers.dropbox.com/oauth-guide
- Dropbox App Console (create app, set redirect URIs, get app key/secret):
  - https://www.dropbox.com/developers/apps

### Google Drive

- Uppy Google Drive provider setup:
  - https://uppy.io/docs/google-drive/
- Google OAuth 2.0 for web/server apps:
  - https://developers.google.com/identity/protocols/oauth2/web-server
- Google OAuth app verification overview:
  - https://support.google.com/cloud/answer/13464321

### OneDrive (Microsoft)

- Uppy OneDrive provider setup:
  - https://uppy.io/docs/onedrive/
- Microsoft Entra app registration:
  - https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app
- Add redirect URIs in app registration:
  - https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri

### Redirect URIs to register in provider consoles

For a Companion base URL like `https://uploads.example.edu/companion`:

- Dropbox: `https://uploads.example.edu/companion/dropbox/redirect`
- Google Drive: `https://uploads.example.edu/companion/drive/redirect`
- OneDrive: `https://uploads.example.edu/companion/onedrive/redirect`

For local development (`http://localhost:1500/companion`):

- Dropbox: `http://localhost:1500/companion/dropbox/redirect`
- Google Drive: `http://localhost:1500/companion/drive/redirect`
- OneDrive: `http://localhost:1500/companion/onedrive/redirect`

Optional:

```bash
UPPY_COMPANION_UPLOAD_URLS=http://localhost:1500/default/rdmp/companion/record/pending-oid/attach
UPPY_COMPANION_ATTACHMENT_SECRET=<shared-secret-for-companion-attach>
UPPY_COMPANION_ATTACHMENT_SECRET_HEADER=x-companion-secret
UPPY_COMPANION_ATTACHMENT_LOCAL_ONLY=true
```

Notes:

- Companion will fail startup if `UPPY_COMPANION_SECRET` is missing or shorter than 32 chars.
- Companion requires at least one provider with a complete key+secret pair (`UPPY_GOOGLE_KEY` + `UPPY_GOOGLE_SECRET` and/or `UPPY_ONEDRIVE_KEY` + `UPPY_ONEDRIVE_SECRET`).
- Do not edit generated shims in `config/*.js`; update `packages/redbox-core-types/src/config/*.ts` defaults or environment variables.

### What the two Companion secrets are for

#### `UPPY_COMPANION_SECRET`

Primary Companion application secret.

- Used by Companion itself (configured as `companion.secret`) for internal token/signing behavior in provider auth flows.
- Required when Companion is enabled.
- Must be at least 32 characters in this codebase.

#### `UPPY_COMPANION_ATTACHMENT_SECRET`

Shared secret used between Companion and ReDBox attachment upload endpoints.

- Added by Companion as a request header (default header: `x-companion-secret`) on server-side upload requests to `/:branding/:portal/companion/record/:oid/attach`.
- Validated by `companionAttachmentUploadAuth` policy on companion attachment routes before allowing Companion-originated upload create/chunk requests to bypass normal `checkAuth`.
- Works with `UPPY_COMPANION_ATTACHMENT_LOCAL_ONLY` (default true) so only local/private-origin requests with a valid secret are accepted.

Behavior when unset:

- `UPPY_COMPANION_ATTACHMENT_SECRET` falls back to `UPPY_COMPANION_SECRET`.

Recommended practice:

- Set both explicitly in production.
- Use different values so OAuth/session signing secret and upload-bridge secret can be rotated independently.

## 2. Configure Form Field (Uppy Frontend)

Use the `FileUploadComponent` in record form config and set:

- `enabledSources`: any of `dropbox`, `googleDrive`, `onedrive`
- `companionUrl`: typically `/companion`
- optional `tusHeaders`, `restrictions`, `allowUploadWithoutSave`

Routing behavior:

- Local/browser uploads use `/:branding/:portal/record/:oid/attach`.
- Remote provider uploads (via Companion) use `/:branding/:portal/companion/record/:oid/attach`.

Example:

```json
{
  "name": "attachments",
  "component": {
    "class": "FileUploadComponent",
    "config": {
      "enabledSources": ["googleDrive", "onedrive"],
      "companionUrl": "/companion",
      "allowUploadWithoutSave": true,
      "restrictions": {
        "maxFileSize": 1073741824
      }
    }
  },
  "model": {
    "class": "FileUploadModel",
    "config": {
      "defaultValue": []
    }
  }
}
```

## 3. TUS Endpoint Behavior

Routes are defined in:

- `packages/redbox-core-types/src/config/routes.config.ts`

Endpoints:

- `/:branding/:portal/record/:oid/attach` (browser/local upload route, CSRF-protected)
- `/:branding/:portal/record/:oid/attach/:attachId` (browser/local upload route, CSRF-protected)
- `/:branding/:portal/companion/record/:oid/attach` (companion/remote provider upload route)
- `/:branding/:portal/companion/record/:oid/attach/:attachId` (companion/remote provider upload route)

These support TUS create/chunk flows used by Uppy.

## 4. Security and Authorization

### Companion (`/companion/*`)

Companion middleware is in:

- `packages/redbox-core-types/src/config/http.config.ts`

Current behavior:

- Unauthenticated requests are rejected with `401` JSON.
- Authenticated users are allowed by default.
- If path rules are configured for companion paths, they are enforced for authenticated users and can return `403`.

### Attachment upload (`/record/:oid/attach` and `/companion/record/:oid/attach`)

Attachment upload policies are configured in:

- `packages/redbox-core-types/src/config/policies.config.ts`
- `packages/redbox-core-types/src/policies/companionAttachmentUploadAuth.ts`

Companion server-side create/chunk requests can bypass standard `checkAuth` only when shared-secret and locality checks pass.
Bypass is route-scoped and is ignored on non-companion attachment routes (including CSRF-protected legacy endpoints).

## 5. Verification

1. Start local stack:
   - `npm run dev:run`
2. As authenticated user:
   - Open a form with `FileUploadComponent`.
   - Confirm provider buttons appear and provider login/import works.
3. Unauthenticated check:
   - Visit `/companion/drive/list/root` in incognito.
   - Expect `401` response.
4. Upload check:
   - Upload a local file and confirm TUS upload success.
5. Optional policy check:
   - Add companion path rule restrictions and verify non-permitted authenticated users receive `403`.

## 6. Troubleshooting

- Companion endpoints return 500 at startup:
  - Check `UPPY_COMPANION_SECRET` (must be set and >= 32 chars).
  - Check `UPPY_COMPANION_FILE_PATH` read/write permissions.
- Provider login popup closes without token:
  - Verify `UPPY_COMPANION_HOST/PROTOCOL/PATH` and provider callback URLs match deployed URL.
- Companion calls return `401`:
  - Verify user is logged in to ReDBox before opening provider picker.
- Companion calls return `403`:
  - Check `session.branding` context and any companion path rules.
  - Check `companionAttachmentUploadAuth` secret/header/local-only settings for server-side upload creation.
