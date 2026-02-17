# Implement Auth Guards for Uppy Companion

## Goal

Secure Uppy Companion endpoints (`/companion/*`) so only authenticated ReDBox users can use provider flows (e.g. Google Drive, OneDrive, Dropbox), while preserving optional role/path-rule restrictions for authenticated users.

## User Review Required

> [!IMPORTANT]
> This change enforces authenticated access to Companion by default.
>
> - Unauthenticated requests to `/companion/*` return `401` (JSON), not login redirects.
> - Authenticated users are allowed by default.
> - Optional PathRules-based role restriction is supported for authenticated users when matching companion rules are configured.
> - Companion authorization must be implemented in core source (`packages/redbox-core-types/src/...`), not generated shim files in `config/*.js`.

## Proposed Changes

### Configuration

#### [MODIFY] `packages/redbox-core-types/src/config/http.config.ts`

- Add a dedicated companion auth guard at the start of the `companion` middleware flow:
  - Detect `/companion/*` requests.
  - Require `req.isAuthenticated()` for all companion requests.
  - Return `401` JSON for unauthenticated requests.
- Do not wrap Companion middleware directly with `checkAuth` to avoid HTML redirect behavior and branding/portal coupling for non-controller middleware routes.
- Keep existing companion behavior intact (token restore, send-token page, lazy app/socket init).

#### [ADD] `packages/redbox-core-types/src/services` or helper in `http.config.ts` (small scoped helper)

- Add optional role/path-rule refinement for authenticated users:
  - Resolve brand from `req.session.branding`.
  - If companion-specific rules exist, enforce `canRead`; deny with `403` when rule exists and user role is not allowed.
  - If no companion-specific rule exists, allow authenticated user (secure authenticated default).
  - If brand context is missing, treat as `403` for rule-gated checks (do not emit `404` from generic `checkAuth` semantics).

#### [NO CHANGE] `config/companion.js`, `config/policies.js`

- These are generated shims and must not be directly edited.
- If configuration defaults are needed, update `packages/redbox-core-types/src/config/*.ts` only.

#### [OPTIONAL] `packages/redbox-core-types/src/config/auth.config.ts`

- Document an example companion rule pattern for admins who want role restrictions, e.g. `/:branding/:portal/companion(/*)`.

## Verification Plan

### Automated Tests

1. Add/extend tests for companion auth middleware behavior:
   - unauthenticated `/companion/*` returns `401` JSON.
   - authenticated `/companion/*` proceeds when no companion path rule exists.
   - authenticated `/companion/*` returns `403` when matching companion rule denies role.
2. Confirm existing companion attachment bypass tests still pass:
   - `companionAttachmentUploadAuth` policy tests.
   - `checkAuth` bypass-flag tests.
3. Run:
   - `cd packages/redbox-core-types && npm test`
   - `npm run test:mocha`

### Manual Verification

1. Setup:
   - Start local environment (`npm run dev:run`).
   - Enable companion providers and verify uploader form has `companionUrl`.
2. Allowed path:
   - Log in as a normal permitted user.
   - Open form uploader and confirm provider list/auth popup works and uploads complete.
3. Unauthenticated:
   - Open `/companion/drive/list/root` in incognito.
   - Verify `401` JSON response.
4. Rule denied (if companion rule configured):
   - Configure a companion rule for restricted roles only.
   - Verify authenticated non-permitted role receives `403`.
5. Regression:
   - Verify direct attachment upload paths still work for valid authenticated users.
   - Verify companion-driven attachment creation still works (shared-secret + local-only safeguards unchanged).
