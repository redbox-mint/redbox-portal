/**
 * Opt-in production-like shadow-mode authorization evidence workflow.
 *
 * Unlike `manage-roles.spec.ts` (which mocks `**\/api\/authorization\/**`),
 * this spec performs no request interception: every request below reaches
 * the live deployment through the controlled admin session fixture
 * (`global-setup.ts` logs in as the local `admin` user and stores the
 * session in `adminStorageStatePath`). Unlike
 * `authorization-live-smoke.spec.ts` (legacy mode plus one reversible
 * write), this workflow is read-only: it never issues a grant, revoke,
 * acknowledgement, or retention mutation.
 *
 * Route contracts (all paths below exist in the repository contract
 * registry; no invented endpoints):
 *  - `GET /:branding/:portal/api/authorization/me`
 *    (`getAuthorizationMeRoute` in
 *    `packages/redbox-core/src/api-routes/groups/authorization.ts`,
 *    `authorizationMeSchema` with the contract `brand.id`,
 *    `principal.{category,authMethod,active,userId}`, `roles[].brandId`,
 *    `scopeKeys`, and `rolloutMode` fields).
 *  - `GET /:branding/:portal/api/authorization/roles`
 *    (`listAuthorizationRolesRoute`, `authorizationRoleCatalogItemSchema`
 *    with the required contract `brandId` field).
 *  - `GET /:branding/:portal/api/records/list`
 *    (`listRecordsRoute`, `recordListQuery` with `recordType`/`start`/`rows`).
 *  - `GET /:branding/:portal/api/records/metadata/:oid`
 *    (`getMetaRoute`, direct record read for ACL agreement).
 *  - `GET /:branding/:portal/record/search/:type`
 *    (`RecordController.search` via `routes.config.ts`, `searchStr`/`rows`
 *    query as used by `record-search/search.service.ts` and the Bruno
 *    `Search Index` fixture).
 *  - `GET /:branding/:portal/api/export/record/download/:format`
 *    (`downloadRecsRoute` in `api-routes/groups/export.ts` with
 *    `recType`/`before`/`after` query as used by the Bruno export
 *    fixtures and `export/export.component.ts`).
 *  - `GET /:branding/:portal/api/authorization/rollout/readiness`
 *    (`getAuthorizationReadinessRoute`, `authorizationReadinessSchema`
 *    with the bounded `shadow.{byRoute,byReason,byBrand,byClassification,
 *    groupsTruncated,unresolvedMismatchCount}` section).
 *  - `GET /:branding/:portal/api/authorization/audit`
 *    (`listAuthorizationAuditRoute`, read-only adjacent evidence that
 *    operator mismatch events are observable; skipped when unreadable).
 *
 * Coverage is observational and uses explicit endpoint-unavailable skips only
 * for routes that are not mounted. Once a contract route is present, the
 * authorization and ACL assertions below are mandatory.
 *  1. Authenticated session principal (`GET /me` with the controlled admin
 *     session: `principal.category === 'authenticated'`,
 *     `authMethod === 'session'`, `active === true`, non-empty `userId`,
 *     non-empty `scopeKeys`, contract `brand.id` present).
 *  2. Anonymous projection (`GET /me` without a session still reports
 *     shadow mode without leaking authority).
 *  3. Bearer fail-closed (`GET /me` with an invalid bearer returns 401
 *     in every mode, never a Guest fallback).
 *  4. Two actual brands using the contract `brandId` field (both the
 *     default-brand and second-brand `GET /roles` catalogs, plus the second
 *     branding prefix `GET /me`; both catalogs must expose the mounted
 *     brands).
 *  5. Direct record read/ACL agreement (bounded `GET /api/records/list`
 *     plus `GET /api/records/metadata/:oid` for a listed `oid`; an
 *     absent/unmounted list route is the only skip).
 *  6. Search agreement (bounded `GET /record/search/:type` with
 *     `searchStr`/`rows`; skips on 404/unmounted).
 *  7. Export agreement (bounded read-only `GET
 *     /api/export/record/download/json`; accepts documented observational
 *     status outcomes, never writes).
 *  8. Readiness/mismatch evidence (`GET /rollout/readiness`:
 *     `mode === 'shadow'`, `deploymentIdentity.complete`, bounded grouped
 *     shadow summaries, `readyForEnforce === false` while enforce gates
 *     remain open; plus a bounded read-only `GET /audit` probe).
 *
 * Shadow mismatch acknowledgement and retention remain non-HTTP operator
 * commands (`npm run authorization:shadow-mismatches -- ...`) and are
 * exercised via the Phase 14.2 runbook, not over HTTP: this spec asserts
 * the readiness shadow section is present and bounded, then points at the
 * CLI for triage.
 *
 * Execution (NOT run as part of this change: no live shadow-mode
 * deployment is available in this worktree/CI context, and this file
 * makes no claim to have run):
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:1500 npm run test:playwright:shadow-smoke
 *
 * which runs:
 *
 *   PLAYWRIGHT_SHADOW_AUTHORIZATION_SMOKE=1 \
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:1500 \
 *   npx playwright test authorization-shadow-smoke
 *
 * The spec is disabled by default and treats a live deployment as an
 * external gate: without `PLAYWRIGHT_SHADOW_AUTHORIZATION_SMOKE=1` it
 * skips; against a non-shadow deployment it skips after reporting the
 * observed mode. Results are environment evidence for the deployment
 * under test, not a repository claim.
 */
import { expect, test } from '@playwright/test';
import { adminStorageStatePath } from './helpers';

const SHADOW_SMOKE_ENABLED = process.env.PLAYWRIGHT_SHADOW_AUTHORIZATION_SMOKE === '1';
const DEFAULT_BRANDING = process.env.PLAYWRIGHT_SHADOW_DEFAULT_BRAND ?? 'default';
const PORTAL = process.env.PLAYWRIGHT_SHADOW_PORTAL ?? 'rdmp';
const SECOND_BRANDING = process.env.PLAYWRIGHT_SHADOW_SECOND_BRAND ?? 'second';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:1500';

const defaultAuthBase = `/${DEFAULT_BRANDING}/${PORTAL}/api/authorization`;
const secondAuthBase = `/${SECOND_BRANDING}/${PORTAL}/api/authorization`;
const defaultRecordBase = `/${DEFAULT_BRANDING}/${PORTAL}/api/records`;
const defaultExportBase = `/${DEFAULT_BRANDING}/${PORTAL}/api/export/record/download`;

interface MeProjection {
  rolloutMode?: unknown;
  brand?: { id?: unknown; name?: unknown };
  principal?: { category?: unknown; authMethod?: unknown; active?: unknown; userId?: unknown };
  roles?: Array<{ brandId?: unknown; key?: unknown }>;
  scopeKeys?: unknown;
}

interface ReadinessShadow {
  unresolvedMismatchCount?: unknown;
  byRoute?: unknown;
  byReason?: unknown;
  byBrand?: unknown;
  byClassification?: unknown;
  groupsTruncated?: unknown;
}

interface ReadinessReport {
  mode?: unknown;
  readyForEnforce?: unknown;
  deploymentIdentity?: { complete?: unknown };
  shadow?: ReadinessShadow;
}

test.describe('authorization shadow-mode evidence smoke (opt-in)', () => {
  test.skip(
    !SHADOW_SMOKE_ENABLED,
    'Set PLAYWRIGHT_SHADOW_AUTHORIZATION_SMOKE=1 to run against a controlled shadow-mode deployment.'
  );
  test.use({ storageState: adminStorageStatePath });

  test('collects session, bearer, two-brand, record, and readiness evidence', async ({ page, request, playwright }) => {
    // Intentionally no page.route() interception: this workflow is
    // production-like and must observe the live contract API.
    await page.goto(`/${DEFAULT_BRANDING}/${PORTAL}/admin/roles?tab=roles`);
    await expect(page.locator('#authorization-admin-heading')).toBeVisible();

    const meResponse = await request.get(`${defaultAuthBase}/me`);
    expect(meResponse.ok(), `live GET /me failed with ${meResponse.status()}`).toBe(true);
    const projection = (await meResponse.json()) as MeProjection;
    if (projection.rolloutMode !== 'shadow') {
      test.skip(true, `requires shadow rollout mode, saw ${JSON.stringify(projection.rolloutMode)}.`);
      return;
    }

    // 1. Authenticated session principal: the controlled admin session must
    // project an active authenticated session principal with a user, a
    // contract brand id, and granted scopes.
    expect(projection.principal?.category, 'session principal must be authenticated').toBe('authenticated');
    expect(projection.principal?.authMethod, 'session principal must use session auth').toBe('session');
    expect(projection.principal?.active, 'session principal must be active').toBe(true);
    expect(typeof projection.principal?.userId, 'session principal must carry a userId').toBe('string');
    expect(String(projection.principal?.userId).length > 0, 'session userId must be non-empty').toBe(true);
    expect(typeof projection.brand?.id, 'projection must carry the contract brand.id').toBe('string');
    expect(Array.isArray(projection.scopeKeys), 'projection must carry scopeKeys').toBe(true);
    expect((projection.scopeKeys as unknown[]).length > 0, 'session must hold at least one scope').toBe(true);

    // 2. Anonymous projection: no session must still report shadow mode
    // without leaking authority.
    const anonymousContext = await playwright.request.newContext({ baseURL: BASE_URL });
    try {
      const anonymous = await anonymousContext.get(`${defaultAuthBase}/me`);
      expect(anonymous.ok(), `anonymous GET /me failed with ${anonymous.status()}`).toBe(true);
      const anonymousBody = (await anonymous.json()) as MeProjection;
      expect(anonymousBody.rolloutMode).toBe('shadow');
      expect(anonymousBody.principal?.category, 'anonymous projection must not present as authenticated').not.toBe(
        'authenticated'
      );
    } finally {
      await anonymousContext.dispose();
    }

    // 3. Bearer fail-closed: an invalid bearer must return 401 in every
    // mode and must never fall back to a Guest projection.
    const bearerContext = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Authorization: 'Bearer 00000000-0000-4000-8000-000000000000' },
    });
    try {
      const bearer = await bearerContext.get(`${defaultAuthBase}/me`);
      expect(bearer.status(), 'invalid bearer must fail closed with 401').toBe(401);
    } finally {
      await bearerContext.dispose();
    }

    // 4. Two actual brands using the contract brandId field: the roles
    // catalog carries the required `brandId` per
    // `authorizationRoleCatalogItemSchema`, and the second branding prefix
    // must project a distinct contract `brand.id` when mounted.
    const defaultRolesResponse = await request.get(`${defaultAuthBase}/roles`, {
      params: { status: 'active', limit: 100 },
    });
    expect(defaultRolesResponse.ok(), `live default GET /roles failed with ${defaultRolesResponse.status()}`).toBe(
      true
    );
    const secondRolesResponse = await request.get(`${secondAuthBase}/roles`, {
      params: { status: 'active', limit: 100 },
    });
    expect(secondRolesResponse.ok(), `live second-brand GET /roles failed with ${secondRolesResponse.status()}`).toBe(
      true
    );
    const rolesBody = (await defaultRolesResponse.json()) as {
      items?: Array<{ brandId?: unknown; key?: unknown }>;
      data?: { items?: Array<{ brandId?: unknown }> };
    };
    const secondRolesBody = (await secondRolesResponse.json()) as {
      items?: Array<{ brandId?: unknown }>;
      data?: { items?: Array<{ brandId?: unknown }> };
    };
    const items = Array.isArray(rolesBody.items)
      ? rolesBody.items
      : Array.isArray(rolesBody.data?.items)
        ? (rolesBody.data?.items as Array<{ brandId?: unknown }>)
        : [];
    const secondItems = Array.isArray(secondRolesBody.items)
      ? secondRolesBody.items
      : Array.isArray(secondRolesBody.data?.items)
        ? (secondRolesBody.data?.items as Array<{ brandId?: unknown }>)
        : [];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(typeof item.brandId, 'roles catalog must use the contract brandId field').toBe('string');
    }
    for (const item of secondItems) {
      expect(typeof item.brandId, 'second-brand roles catalog must use the contract brandId field').toBe('string');
    }
    const defaultBrandId = String(projection.brand?.id);
    const catalogBrandIds = new Set(
      [...items, ...secondItems]
        .map(item => (typeof item.brandId === 'string' ? item.brandId : undefined))
        .filter((brandId): brandId is string => Boolean(brandId))
    );
    expect(catalogBrandIds.size, 'role catalog must expose at least two actual brandId values').toBeGreaterThanOrEqual(
      2
    );
    const secondMeResponse = await request.get(`${secondAuthBase}/me`);
    expect(secondMeResponse.status(), `second-brand GET /me failed with ${secondMeResponse.status()}`).toBe(200);
    const secondProjection = (await secondMeResponse.json()) as MeProjection;
    expect(typeof secondProjection.brand?.id, 'second brand must project a contract brand.id').toBe('string');
    const secondBrandId = String(secondProjection.brand?.id);
    expect(secondBrandId, 'second brand must differ from the default brand').not.toBe(defaultBrandId);
    expect(catalogBrandIds.has(secondBrandId), 'second brand must be represented by a role catalog brandId').toBe(true);

    // 5. Direct record read/ACL agreement: bounded contract list
    // (`listRecordsRoute`, `recordListQuery`) then a direct read of a
    // listed oid (`getMetaRoute`). A listed record must agree with direct
    // visibility; an empty readable-record fixture fails the smoke.
    const listResponse = await request.get(`${defaultRecordBase}/list`, {
      params: { recordType: 'rdmp', start: 0, rows: 5 },
    });
    if (listResponse.status() === 404) {
      test.skip(true, 'record list endpoint is not mounted on this deployment.');
      return;
    }
    expect(listResponse.ok(), `live record list failed with ${listResponse.status()}`).toBe(true);
    const listBody = (await listResponse.json()) as {
      records?: Array<{ oid?: unknown }>;
      data?: { records?: Array<{ oid?: unknown }> };
    };
    const records = Array.isArray(listBody.records)
      ? listBody.records
      : Array.isArray(listBody.data?.records)
        ? (listBody.data?.records as Array<{ oid?: unknown }>)
        : [];
    expect(records.length, 'record list must expose a readable record for ACL agreement').toBeGreaterThan(0);
    expect(typeof records[0]?.oid, 'readable record must expose a contract oid').toBe('string');
    const oid = String(records[0].oid);
    const directResponse = await request.get(`${defaultRecordBase}/metadata/${encodeURIComponent(oid)}`, {
      headers: { 'X-ReDBox-Api-Version': '2.0' },
    });
    expect(
      directResponse.status(),
      `listed readable record must be directly readable, saw ${directResponse.status()}`
    ).toBe(200);
    const directBody = (await directResponse.json()) as {
      oid?: unknown;
      data?: { oid?: unknown };
      meta?: { oid?: unknown };
    };
    const directOid = directBody.meta?.oid ?? directBody.data?.oid ?? directBody.oid;
    expect(String(directOid), 'direct read must return the listed oid').toBe(oid);

    // 6. Search agreement: bounded Solr-backed search
    // (`RecordController.search`, `searchStr`/`rows` as used by
    // `record-search/search.service.ts`). Skips when unmounted.
    const searchResponse = await request.get(`/${DEFAULT_BRANDING}/${PORTAL}/record/search/rdmp/`, {
      params: { searchStr: '*', rows: 5 },
    });
    if (searchResponse.status() === 404) {
      test.skip(true, 'record search endpoint is not mounted on this deployment.');
    } else {
      expect(searchResponse.ok(), `live record search failed with ${searchResponse.status()}`).toBe(true);
    }

    // 7. Export agreement: bounded read-only export download
    // (`downloadRecsRoute`, `recType`/`before`/`after` as used by the
    // Bruno export fixtures). Observational only: 200/403/404 are all
    // valid ACL outcomes; the request itself must never mutate.
    const exportResponse = await request.get(`${defaultExportBase}/json`, {
      params: { recType: 'rdmp', before: '', after: '' },
    });
    expect(
      [200, 400, 403, 404].includes(exportResponse.status()),
      `export download must respond with an observational status, saw ${exportResponse.status()}`
    ).toBe(true);

    // 8. Readiness/mismatch evidence: shadow mode, per-instance identity,
    // bounded grouped summaries, enforce still gated open, plus a bounded
    // read-only audit probe for operator mismatch events.
    const readinessResponse = await request.get(`${defaultAuthBase}/rollout/readiness`);
    expect(readinessResponse.ok(), `live GET /rollout/readiness failed with ${readinessResponse.status()}`).toBe(true);
    const readiness = (await readinessResponse.json()) as ReadinessReport;
    expect(readiness.mode).toBe('shadow');
    expect(readiness.deploymentIdentity?.complete).toBe(true);
    expect(typeof readiness.shadow?.unresolvedMismatchCount).toBe('number');
    for (const group of ['byRoute', 'byReason', 'byBrand', 'byClassification'] as const) {
      expect(Array.isArray(readiness.shadow?.[group]), `readiness shadow.${group} must be an array`).toBe(true);
      expect((readiness.shadow?.[group] as unknown[]).length <= 20, `readiness shadow.${group} must stay bounded`).toBe(
        true
      );
    }
    expect(typeof readiness.shadow?.groupsTruncated).toBe('boolean');
    // Shadow evidence collection must never present as enforce-ready:
    // enforce gates (approvals, shadow window, rollback, durable
    // fingerprint) remain external release actions.
    expect(readiness.readyForEnforce).toBe(false);

    const auditResponse = await request.get(`${defaultAuthBase}/audit`, { params: { limit: 1 } });
    if (auditResponse.status() !== 404) {
      expect(auditResponse.ok(), `live GET /audit probe failed with ${auditResponse.status()}`).toBe(true);
    }
  });
});
