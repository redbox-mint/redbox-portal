# User Management

This page documents the user-management enhancements centered on the `/admin/users` screen, the CSRF-backed admin AJAX endpoints used by that screen, and the related legacy `/api/users/*` webservice endpoints.

## Overview

Brand administrators can now:

- Link duplicate user accounts so one account becomes the canonical primary and the others become linked aliases.
- Disable and re-enable accounts without deleting them.
- View a user-centric audit history for login/logout and account-management actions.

These changes affect both the admin UI and the backend authentication and authorization flows.

## Route Split: Admin AJAX vs Webservice API

User-management functionality now exists in two route families:

- `/:branding/:portal/admin/users/*`
  Browser-facing admin AJAX routes handled by `AdminController`
  These routes participate in the normal session-based browser flow and are intended for the Angular Manage Users app.
- `/:branding/:portal/api/users/*`
  Webservice routes handled by `webservice/UserManagementController`
  These remain available for REST/API consumers and keep `csrf: false`.

The Manage Users Angular app now calls the admin AJAX routes for account-linking, user-audit, and disable/enable operations so those browser actions are covered by CSRF protection.

## Linked Accounts

Account linking is an admin-only action performed from `/admin/users`.

### Primary and alias behavior

- A linked account relationship is stored in the `userlink` collection.
- The secondary account is marked with:
  - `accountLinkState: "linked-alias"`
  - `linkedPrimaryUserId`
- Primary accounts remain `accountLinkState: "active"`.
- Existing linked accounts for a primary are shown in the Manage Users edit dialog.

### What linking does

When an admin links a secondary account to a primary account, ReDBox:

- Stores a `UserLink` record with the primary user, secondary user, brand, and actor.
- Merges any brand-matching roles from the secondary into the primary account.
- Revokes the secondary account API token.
- Marks the secondary as a linked alias of the primary.
- Rewrites record authorization entries so references to the secondary username are replaced with the primary username.
- Resolves pending email-based permissions for the secondary email onto the primary account.
- Writes a `link-accounts` user-audit event.

### Important constraints

- Linking is manual only. There is no automatic duplicate detection or auto-linking.
- A user cannot be linked to itself.
- A linked alias cannot be chosen as the primary.
- A secondary that is already linked cannot be linked again.
- A secondary that already has its own linked accounts cannot be used as a secondary.
- The primary account must already belong to the current brand.
- Candidates are excluded if they are disabled, already linked, or already have linked accounts.
- There is no unlink operation in this feature set.

### Effective user resolution

Linked aliases resolve to the primary account during authentication and permission assignment. This applies to:

- session deserialization
- bearer-token authentication
- AAF/OIDC sign-in flows
- record-permission assignment paths that now resolve to the effective primary user

## Disabled Accounts

Users can now be disabled without being deleted.

### Data fields

The user model now includes:

- `loginDisabled`
- `effectiveLoginDisabled`
- `disabledByPrimaryUserId`
- `disabledByPrimaryUsername`

The effective fields matter for linked aliases, because an alias is effectively disabled when its primary account is disabled.

### Admin UI behavior

On `/admin/users`:

- disabled users are hidden by default
- admins can reveal them with the `Show disabled users` toggle
- status badges distinguish direct disablement from disablement inherited from a primary account
- the edit modal shows the current disabled state and exposes enable/disable actions

### Authentication behavior

Disabled users are blocked from new authentication attempts. This includes:

- local login
- AAF login
- OIDC login
- bearer-token authentication

Existing sessions are not forcibly terminated by this feature. They expire normally.

### Important constraints

- A linked alias cannot be directly disabled or re-enabled; the primary account controls its effective state.
- An admin cannot disable their own account through the new `disable` endpoint.
- Disabling and enabling both write user-audit events.

## User Audit History

The Manage Users screen now includes a `View Audit` action.

### What the audit modal shows

The audit view is user-centric. It combines:

- direct login/logout events written against the selected user
- admin account-management events that target the selected user:
  - `disable-user`
  - `enable-user`
  - `link-accounts`

The response is normalized before it reaches the UI and includes:

- `user`
- `records`
- `summary.returnedCount`
- `summary.truncated`

Each normalized record includes:

- `id`
- `timestamp`
- `action`
- `actor`
- `details`
- `parsedAdditionalContext`
- `rawAdditionalContext`
- `parseError`

### Safety and limits

- Audit results are sorted newest-first.
- Responses are capped at the 100 most recent rows.
- Sensitive request-debug data is redacted before being returned to the browser.
- Malformed `additionalContext` payloads are tolerated and surfaced as parse errors instead of breaking the response.

## Endpoint Summary

### Admin AJAX endpoints used by the Manage Users app

These routes are exposed under `/:branding/:portal/admin`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/users/get` | Fetch the Manage Users table, enriched with link-state and effective-disabled metadata |
| `POST` | `/users/update` | Update user details and roles |
| `POST` | `/users/genKey` | Generate a user API key |
| `POST` | `/users/revokeKey` | Revoke a user API key |
| `POST` | `/users/newUser` | Create a local user |
| `GET` | `/users/link/candidates?primaryUserId=<id>&query=<text>` | Search valid secondary-account candidates |
| `GET` | `/users/:id/links` | Fetch a primary account and its linked aliases |
| `POST` | `/users/link` | Link a secondary account to a primary account |
| `GET` | `/users/:id/audit` | Fetch normalized audit history for a selected user |
| `POST` | `/users/:id/disable` | Disable a user |
| `POST` | `/users/:id/enable` | Re-enable a user |

The main `GET /admin/users/get` response supports `includeDisabled=true`.

### Legacy webservice endpoints

Equivalent brand-admin webservice endpoints remain exposed under `/:branding/:portal/api`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/users/link/candidates?primaryUserId=<id>&query=<text>` | Search valid secondary-account candidates |
| `GET` | `/users/:id/links` | Fetch a primary account and its linked aliases |
| `POST` | `/users/link` | Link a secondary account to a primary account |
| `GET` | `/users/:id/audit` | Fetch normalized audit history for a selected user |
| `POST` | `/users/:id/disable` | Disable a user |
| `POST` | `/users/:id/enable` | Re-enable a user |

The webservice routes remain useful for REST/API clients, but the browser Manage Users flow should use the admin AJAX routes.

## Data Model Changes

Relevant model additions:

- `User`
  - `linkedPrimaryUserId`
  - `accountLinkState`
  - `loginDisabled`
  - effective disabled/link display fields on the API/view models
- `UserLink`
  - `primaryUserId`
  - `primaryUsername`
  - `secondaryUserId`
  - `secondaryUsername`
  - `brandId`
  - `status`
  - `createdBy`
  - `notes`

## Test Coverage

This feature is covered by:

- `packages/redbox-core/test/services/UsersService.test.ts`
- `packages/redbox-core/test/controllers/webservice/UserManagementController.test.ts`
- `packages/redbox-core/test/controllers/AdminController.test.ts`
- `angular/projects/researchdatabox/manage-users/src/app/manage-users.component.spec.ts`
- `test/integration/services/AdminUserManagementAjax.test.ts`
- Bruno REST requests for user-linking flows under `test/bruno/1 - REST API/2 - User Management/`
- Bruno admin AJAX requests under `test/bruno/2 - AJAX calls/1 - Admin User Tests/` covering:
  - create-secondary-user for linking
  - link-candidate search
  - linked-account retrieval
  - account linking
  - disable / enable
  - user audit retrieval

Current automated coverage verifies both route families:

- webservice `/api/users/*` behavior through REST Bruno and controller/service tests
- CSRF-backed `/admin/users/*` browser behavior through AdminController tests, the integration Mocha test, and AJAX Bruno requests
