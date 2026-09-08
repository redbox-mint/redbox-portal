/**
 * Opt-in production-like legacy-mode authorization API smoke workflow.
 *
 * Unlike `manage-roles.spec.ts` (which mocks `**\/api\/authorization\/**`,
 * including writes), this spec performs no request interception: every
 * request below reaches the live deployment through the controlled admin
 * session fixture (`global-setup.ts` logs in as the local `admin` user and
 * stores the session in `adminStorageStatePath`).
 *
 * What it does:
 *  1. Loads the live roles administration UI and asserts it renders.
 *  2. Reads the live authorization projection (`GET /me`) and requires
 *     `rolloutMode === 'legacy'` (skips otherwise: this workflow is scoped
 *     to legacy-mode deployments only).
 *  3. Resolves a safe write target: an explicitly configured non-protected
 *     role, or the first `protectedKind === 'none'` active role in the
 *     catalog. Skips when no safe target exists rather than touching a
 *     protected role.
 *  4. Performs one reversible supported write: grants a manual assignment
 *     for a dedicated fixture user (`PUT
 *     /assignments/:roleKey/users/:userId`), verifies it, then revokes it
 *     (`DELETE` with the grant's `expectedVersion`) in a `finally` block so
 *     the write is always reversed, even on verification failure. A
 *     preflight `GET /assignments` skips the run when the fixture user
 *     already holds the target role, so cleanup only ever revokes the
 *     assignment created by this run and never a pre-existing grant. The
 *     grant's `changed` flag claims cleanup ownership: only `changed ===
 *     true` owns the assignment and may revoke it; a `changed === false`
 *     idempotent no-op (concurrent grant race) is never revoked. A
 *     post-revoke `GET` verifies no active assignment remains while the
 *     retained row is `status === 'revoked'` at the expected version
 *     (revoke retains the row rather than deleting it).
 *
 * Fixture provisioning (controlled deployment only):
 *  - A local user with the configured fixture id (default
 *    `playwright-live-smoke-user`). The grant targets this user only.
 *  - Optionally set `PLAYWRIGHT_LIVE_AUTHORIZATION_SMOKE_ROLE` to pin the
 *    role under test; it must be non-protected.
 *
 * Execution (NOT run as part of this change: no live legacy-mode
 * deployment is available in this worktree/CI context, and this file
 * makes no claim to have run):
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:1500 npm run test:playwright:live-smoke
 *
 * which runs:
 *
 *   PLAYWRIGHT_LIVE_AUTHORIZATION_SMOKE=1 \
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:1500 \
 *   npx playwright test authorization-live-smoke
 */
import { expect, test } from '@playwright/test';
import { adminStorageStatePath } from './helpers';

const LIVE_SMOKE_ENABLED = process.env.PLAYWRIGHT_LIVE_AUTHORIZATION_SMOKE === '1';
const API_BASE = '/default/rdmp/api/authorization';
const SMOKE_USER_ID = process.env.PLAYWRIGHT_LIVE_AUTHORIZATION_SMOKE_USER ?? 'playwright-live-smoke-user';
const PINNED_ROLE_KEY = process.env.PLAYWRIGHT_LIVE_AUTHORIZATION_SMOKE_ROLE ?? '';
const SMOKE_REASON = 'playwright live authorization smoke (automated reversible check)';

interface RoleSummary {
  key: string;
  protectedKind: string;
  status: string;
}

test.describe('authorization live legacy-mode API smoke (opt-in)', () => {
  test.skip(
    !LIVE_SMOKE_ENABLED,
    'Set PLAYWRIGHT_LIVE_AUTHORIZATION_SMOKE=1 to run against a controlled legacy-mode deployment.'
  );
  test.use({ storageState: adminStorageStatePath, extraHTTPHeaders: { 'X-ReDBox-Api-Version': '1.0' } });

  test('legacy-mode reads plus a reversible grant/revoke write against the live API', async ({ page, request }) => {
    // Intentionally no page.route() interception: this workflow is
    // production-like and must observe the live contract API.
    await page.goto('/default/rdmp/admin/roles?tab=roles');
    await expect(page.locator('#authorization-admin-heading')).toBeVisible();

    const meResponse = await request.get(`${API_BASE}/me`);
    expect(meResponse.ok(), `live GET /me failed with ${meResponse.status()}`).toBe(true);
    const projection = (await meResponse.json()) as { rolloutMode?: unknown };
    if (projection.rolloutMode !== 'legacy') {
      test.skip(true, `requires legacy rollout mode, saw ${JSON.stringify(projection.rolloutMode)}.`);
      return;
    }

    const rolesResponse = await request.get(`${API_BASE}/roles`, { params: { limit: 100 } });
    expect(rolesResponse.ok(), `live GET /roles failed with ${rolesResponse.status()}`).toBe(true);
    const rolesBody = (await rolesResponse.json()) as { items?: RoleSummary[] };
    const candidates = Array.isArray(rolesBody.items) ? rolesBody.items : [];
    const target =
      candidates.find(role => role.key === PINNED_ROLE_KEY && role.protectedKind === 'none') ??
      (PINNED_ROLE_KEY === ''
        ? candidates.find(role => role.protectedKind === 'none' && role.status === 'active')
        : undefined);
    if (target === undefined) {
      test.skip(true, 'no non-protected role available as a safe reversible-write target.');
      return;
    }

    const assignmentPath = `${API_BASE}/assignments/${encodeURIComponent(target.key)}/users/${encodeURIComponent(SMOKE_USER_ID)}`;
    // Preflight: never touch a pre-existing assignment. If the fixture
    // user already holds this role (left over from another run, a shared
    // deployment, or manual setup), skip rather than revoke someone else's
    // grant in the cleanup below.
    const preflightResponse = await request.get(`${API_BASE}/assignments`, {
      params: { userId: SMOKE_USER_ID, roleKey: target.key },
    });
    expect(preflightResponse.ok(), `live GET /assignments (preflight) failed with ${preflightResponse.status()}`).toBe(
      true
    );
    const preflightBody = (await preflightResponse.json()) as { items?: unknown[] };
    if (Array.isArray(preflightBody.items) && preflightBody.items.length > 0) {
      test.skip(
        true,
        `fixture user ${SMOKE_USER_ID} already holds role ${target.key}; refusing to revoke a pre-existing assignment.`
      );
      return;
    }
    // Bootstrap CSRF on the authenticated request session used for both
    // mutations; the page and request fixtures have separate cookie stores.
    const csrfResponse = await request.get('/csrfToken');
    expect(csrfResponse.ok(), `live GET /csrfToken failed with ${csrfResponse.status()}`).toBe(true);
    const csrfBody = (await csrfResponse.json()) as { _csrf?: unknown };
    expect(csrfBody._csrf, 'CSRF bootstrap must return a non-empty session token').toEqual(expect.any(String));
    const csrfToken = csrfBody._csrf as string;
    expect(csrfToken.length, 'CSRF token must be non-empty before attempting a grant').toBeGreaterThan(0);
    const mutationHeaders = { 'X-CSRF-Token': csrfToken };

    // Only the grant created by this test below may be revoked, tracked via
    // its returned version plus the grant's `changed` ownership flag. The
    // `finally` cleanup revokes exactly that owned version and asserts no
    // active assignment remains while the retained row is revoked.
    let grantedVersion: number | undefined;
    let cleanupOwned = false;
    try {
      const grantResponse = await request.put(assignmentPath, {
        headers: mutationHeaders,
        data: { reason: SMOKE_REASON },
      });
      expect(grantResponse.ok(), `live grant failed with ${grantResponse.status()}`).toBe(true);
      const grantBody = (await grantResponse.json()) as {
        version?: unknown;
        auditEventId?: unknown;
        changed?: unknown;
        data?: { id?: unknown; status?: unknown; version?: unknown };
      };
      expect(typeof grantBody.version, 'grant must return a versioned mutation result').toBe('number');
      // Concurrent idempotent-grant race: a `changed === false` no-op means
      // another writer already owns the assignment, so this run must never
      // revoke it. Only `changed === true` claims cleanup ownership.
      // Record the owned version before further assertions so even an
      // invalid audit event identity still triggers the versioned revoke.
      cleanupOwned = grantBody.changed === true;
      if (cleanupOwned) {
        grantedVersion = grantBody.version as number;
      }
      expect(typeof grantBody.auditEventId, 'grant must return an audit event identity').toBe('string');

      const listResponse = await request.get(`${API_BASE}/assignments`, {
        params: { userId: SMOKE_USER_ID, roleKey: target.key },
      });
      expect(listResponse.ok(), `live GET /assignments failed with ${listResponse.status()}`).toBe(true);
    } finally {
      // Reversal is strictly scoped to the assignment this test created:
      // `cleanupOwned` is only true after this run's own grant returned
      // `changed === true` (the preflight above skipped when an assignment
      // already existed, and a concurrent no-op never takes ownership).
      if (cleanupOwned && grantedVersion !== undefined) {
        const revokeResponse = await request.delete(assignmentPath, {
          headers: mutationHeaders,
          data: { expectedVersion: grantedVersion, reason: SMOKE_REASON },
        });
        expect(revokeResponse.ok(), `live revoke (reversal) failed with ${revokeResponse.status()}`).toBe(true);
        const revokeBody = (await revokeResponse.json()) as { version?: unknown; changed?: unknown };
        expect(typeof revokeBody.version, 'revoke must return a versioned mutation result').toBe('number');
        const revokedVersion = revokeBody.version as number;
        const verifyResponse = await request.get(`${API_BASE}/assignments`, {
          params: { userId: SMOKE_USER_ID, roleKey: target.key },
        });
        expect(
          verifyResponse.ok(),
          `live GET /assignments (cleanup verify) failed with ${verifyResponse.status()}`
        ).toBe(true);
        const verifyBody = (await verifyResponse.json()) as {
          items?: Array<{ status?: unknown; version?: unknown; roleKey?: unknown; principalId?: unknown }>;
        };
        const verifyItems = Array.isArray(verifyBody.items) ? verifyBody.items : [];
        const activeItems = verifyItems.filter(item => item.status === 'active');
        expect(activeItems.length, 'smoke-test assignment must have no active row after revoke').toBe(0);
        const revokedRow = verifyItems.find(item => item.status === 'revoked' && item.version === revokedVersion);
        expect(revokedRow, 'revoke must retain the assignment row as revoked at the expected version').toBeDefined();
      }
    }
  });
});
