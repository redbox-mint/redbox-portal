# Verification: Users and roles

Branch: `admin-deferred/06-users-roles`; parent: `admin-deferred/05-deleted-records`.

## Automated checks

All resource-intensive checks and builds were completed sequentially. A prematurely started final core rerun was stopped while Webpack completed; the subsequent complete run passed.

| Check | Result |
|---|---|
| `npm run compile:core` | Passed |
| Angular development builds: `portal-ng-common`, `manage-users`, `manage-roles` | Passed |
| `REDBOX_ASSET_MODE=development NODE_OPTIONS=--max-old-space-size=3072 npm run webpack` | Passed |
| `npm run test:core` | 4,589 passed; 121 pending |
| `manage-users` Angular suite | 32 passed |
| `manage-roles` Angular suite | 10 passed |
| `portal-ng-common` Angular suite | 189 passed |
| `npm run test:translations` | Passed: 1,524 metadata keys, 2,927 English keys |
| `npm run validate:api-routes` | 59 passed |
| `npm run doc:api` | Passed; OpenAPI JSON/YAML, API Blueprint and viewer regenerated beneath ignored `support/docs/generated/api` |
| `npm run lint` | No errors; two intentional `no-control-regex` warnings for rejecting control characters in role descriptions |

Added `AdminUsersDeferred.test.ts` and `SignInLastLogin.test.ts`, extended the user-model and Angular suites, and added `test/integration/services/AdminUsersRolesDeferred.test.ts`. The Docker integration suites were not run, as instructed. External AAF/OIDC services are mocked in unit tests.

## Live development check and screenshots

Rebuilt assets, restarted `development-rbportal-mount-1`, and waited for healthy status. Captures live in `/tmp/redbox-admin-shots/stack-06`; `interactions.py` uses the shared `capture.py` for initial routes, then captures interaction states at 1280 and 768 pixels. Reviewed the captures for the existing admin pattern, visible dialogs and absence of horizontal page overflow.

For **both widths**, captured:

- `admin_users-<width>.png`, `admin_roles-<width>.png` (shared capture script).
- `users-local-filter-<width>.png`: Local selected, last login shown, and Never for an unsigned-in account.
- `users-last-login-dialog-<width>.png`: account information with Last login.
- `roles-edited-description-<width>.png`: custom Researcher description saved through the inline editor.
- `roles-default-marked-<width>.png`: Guest default badge, translated fallback description, and default-role rail note.
- `roles-only-role-confirmation-<width>.png`: exact default-role replacement confirmation.
- `roles-default-removal-blocked-<width>.png`: clear explanation requiring another role first.

The interaction script confirmed the successful sole-role replacement by re-reading the user's persisted roles. The first image pass caught the modal opening transition before the dialog had appeared; the final captures wait for the transition to finish. Admin screen interactions have no application console errors. The HTTP development environment emits the existing COOP warning, which the shared capture script excludes. The initial capture helper requested `/csrfToken` immediately after Passport renewed the login session, before re-establishing branding, and received 404. The final helper visits the branded home page after login. Its full run passed with empty application-error and login-setup-error arrays in `data-manifest.json`.

## Data safety

Only the two identified screenshot accounts (`stack06-morgan-1793898539` and `stack06-alex-1793898539`) were used for membership changes. The script restores the Researcher custom description to its original empty value and disables both users in a `finally` block. `/tmp/redbox-admin-shots/stack-06/data-manifest.json` records ids, restoration, replacement verification and disabled-state completion. The admin account's roles and password were never changed; its allowed successful sign-ins update lastLogin. Branding was not published.

## Decisions and limitations

- Use the top-level brand `auth.defaultRole`, with the established Guest fallback, independently of provider-specific authenticated defaults.
- Block sole-role removal if that role is already the default or the configured default cannot be resolved.
- Replace the sole brand membership with one junction-row update; preserve memberships in other brands.
- Last-login display uses the admin date convention and secondary table text. No backfill runs, and optional role descriptions require no MongoDB migration.
- No feature gaps or unresolved product decisions identified. Docker integration execution remains for the normal integration environment.
