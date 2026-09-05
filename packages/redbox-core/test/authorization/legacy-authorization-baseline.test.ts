import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
  buildLegacyRouteBaseline,
  buildLegacyRouteBaselineEntry,
  describeLegacyBaselineDrift,
  LEGACY_PATH_RULE_BASELINE,
  representativeVariantsForPattern,
} from '../../src/authorization/legacy-authorization-baseline';
import {
  FROZEN_BASELINE_COUNTS,
  FROZEN_CONTRACT_ROUTE_IDS,
  FROZEN_LEGACY_PATH_RULE_ROWS,
  FROZEN_LEGACY_ROUTE_BASELINE,
} from '../../src/authorization/legacy-authorization-baseline.snapshot';
import { getMergedApiRoutes } from '../../src/api-routes';
import { routes } from '../../src/config/routes.config';
import { auth } from '../../src/config/auth.config';

describe('legacy authorization baseline', function () {
  it('keeps an immutable frozen PathRule snapshot with one row per reviewed rule', function () {
    assert.equal(FROZEN_LEGACY_PATH_RULE_ROWS.length, 78);
    assert.equal(FROZEN_LEGACY_PATH_RULE_ROWS.length, auth.rules.length);
    const indexes = FROZEN_LEGACY_PATH_RULE_ROWS.map(row => row.index);
    assert.deepEqual(
      [...indexes].sort((a, b) => a - b),
      auth.rules.map((_rule, index) => index)
    );
    for (const row of FROZEN_LEGACY_PATH_RULE_ROWS) {
      assert.ok(row.path.length > 0);
      assert.ok(row.role.length > 0);
      assert.equal(typeof row.canRead, 'boolean');
      assert.equal(typeof row.canUpdate, 'boolean');
      assert.equal(row.broad, row.path.includes('(/*)'));
      // canRead is the legacy read grant: can_read OR can_update.
      if (row.canUpdate) assert.equal(row.canRead, true);
      const source = auth.rules[row.index];
      assert.equal(row.path, source.path);
      assert.equal(row.role, source.role);
    }
    assert.ok(FROZEN_LEGACY_PATH_RULE_ROWS.some(row => row.broad));
    assert.ok(FROZEN_LEGACY_PATH_RULE_ROWS.some(row => !row.broad));
    assert.ok(Object.isFrozen(FROZEN_LEGACY_PATH_RULE_ROWS));
  });

  it('detects any drift between live sources and the frozen snapshot', function () {
    const liveRouteEntries = buildLegacyRouteBaseline(routes);
    const liveContractRouteIds = getMergedApiRoutes().map(route => {
      if (typeof route.routeId !== 'string') throw new Error('contract route is missing its stable routeId');
      return route.routeId;
    });
    const drifts = describeLegacyBaselineDrift({
      livePathRows: [...LEGACY_PATH_RULE_BASELINE],
      liveRouteEntries,
      liveContractRouteIds,
    });
    assert.deepEqual(
      [...drifts],
      [],
      `Legacy baseline drift requires a reviewed source change plus 'npm run snapshot:legacy-baseline':\n${drifts.join('\n')}`
    );
  });

  it('covers every configured route exactly once with no unexplained authorization state', function () {
    assert.equal(FROZEN_LEGACY_ROUTE_BASELINE.length, FROZEN_BASELINE_COUNTS.configuredRoutes);
    assert.equal(FROZEN_LEGACY_ROUTE_BASELINE.length, Object.keys(routes).length);
    assert.ok(FROZEN_LEGACY_ROUTE_BASELINE.length > 300);
    const routeIds = FROZEN_LEGACY_ROUTE_BASELINE.map(entry => entry.routeId);
    assert.equal(new Set(routeIds).size, routeIds.length);
    const kinds = { scope: 0, public: 0, 'pre-auth': 0 } as Record<string, number>;
    for (const entry of FROZEN_LEGACY_ROUTE_BASELINE) {
      assert.ok(entry.routeId.length > 0);
      assert.ok(entry.pattern.length > 0);
      assert.ok(entry.method.length > 0);
      assert.ok(['scope', 'public', 'pre-auth'].includes(entry.authorizationKind));
      kinds[entry.authorizationKind] += 1;
      // No unexplained state: every route carries its declaration and expectation.
      assert.ok(entry.scopeOrReason.length > 0);
      assert.ok(['anonymous', 'pre-auth', 'session-or-bearer'].includes(entry.authExpectation));
      assert.equal(
        entry.authExpectation,
        entry.authorizationKind === 'public'
          ? 'anonymous'
          : entry.authorizationKind === 'pre-auth'
            ? 'pre-auth'
            : 'session-or-bearer'
      );
      assert.equal(typeof entry.brandOwned, 'boolean');
      assert.equal(entry.brandOwned, entry.resourceType !== undefined);
      assert.ok(entry.representativeVariants.length >= 1);
      assert.equal(entry.noRuleGrant, entry.pathRuleMatches.length === 0);
      assert.equal(typeof entry.broadRuleMasking, 'boolean');
      if (entry.broadRuleMasking) assert.ok(entry.pathRuleMatches.length > 0);
      for (const match of entry.pathRuleMatches) {
        assert.ok(Number.isSafeInteger(match) && match >= 0 && match < FROZEN_LEGACY_PATH_RULE_ROWS.length);
      }
      const expectedRoles = [
        ...new Set(entry.pathRuleMatches.map(index => FROZEN_LEGACY_PATH_RULE_ROWS[index].role)),
      ].sort();
      assert.deepEqual([...entry.grantingRoles], expectedRoles);
      assert.deepEqual(
        [...entry.pathRuleMatches].sort((a, b) => a - b),
        [...entry.pathRuleMatches]
      );
    }
    assert.equal(kinds['scope'], FROZEN_BASELINE_COUNTS.scopedRoutes);
    assert.equal(kinds['public'], FROZEN_BASELINE_COUNTS.publicRoutes);
    assert.equal(kinds['pre-auth'], FROZEN_BASELINE_COUNTS.preAuthRoutes);
    const noRule = FROZEN_LEGACY_ROUTE_BASELINE.filter(entry => entry.noRuleGrant);
    const broadMasked = FROZEN_LEGACY_ROUTE_BASELINE.filter(entry => entry.broadRuleMasking);
    assert.ok(noRule.length > 0);
    assert.ok(broadMasked.length > 0);
  });

  it('contains every contract route exactly once within the configured baseline', function () {
    const contractRoutes = getMergedApiRoutes();
    assert.equal(FROZEN_CONTRACT_ROUTE_IDS.length, FROZEN_BASELINE_COUNTS.contractRoutes);
    assert.equal(contractRoutes.length, FROZEN_CONTRACT_ROUTE_IDS.length);
    assert.deepEqual(contractRoutes.map(route => route.routeId).sort(), [...FROZEN_CONTRACT_ROUTE_IDS].sort());
    const configuredIds = new Set(FROZEN_LEGACY_ROUTE_BASELINE.map(entry => entry.routeId));
    for (const routeId of FROZEN_CONTRACT_ROUTE_IDS) {
      assert.ok(configuredIds.has(routeId), `contract route missing from configured baseline: ${routeId}`);
    }
    assert.ok(Object.keys(routes).length >= contractRoutes.length);
  });

  it('instantiates representative concrete variants for brand/portal parameters', function () {
    const variants = representativeVariantsForPattern('/:branding/:portal/record/:oid');
    assert.ok(variants.some(variant => variant.includes('/default/rdmp/')));
    assert.ok(variants[variants.length - 1].includes('/default/rdmp/'));
    assert.ok(!variants[variants.length - 1].includes(':branding'));
    assert.ok(!variants[variants.length - 1].includes(':oid'));
  });

  it('records the policy owner for policy-only and policy-guarded routes', function () {
    const byId = new Map(FROZEN_LEGACY_ROUTE_BASELINE.map(entry => [entry.routeId, entry]));
    const head = byId.get('HEAD /user/begin_oidc (policy-only)');
    assert.ok(head, 'policy-only OIDC HEAD route must be baselined');
    assert.equal(head.policy, 'disallowedHeadRequestHandler');
    assert.equal(head.controller, undefined);
    assert.equal(head.action, undefined);
    for (const pattern of [
      '/:branding/:portal/companion/record/:oid/attach',
      '/:branding/:portal/companion/record/:oid/attach/:attachId',
    ]) {
      const entry = FROZEN_LEGACY_ROUTE_BASELINE.find(candidate => candidate.pattern === pattern);
      assert.ok(entry, `companion route must be baselined: ${pattern}`);
      assert.equal(entry.policy, 'companionAttachmentUploadAuth');
      assert.equal(entry.controller, 'RecordController');
      assert.equal(entry.action, 'doAttachment');
    }
    // Completeness: every configured route with a policy carries it in the baseline.
    const liveByPattern = new Map(buildLegacyRouteBaseline(routes).map(entry => [entry.pattern, entry]));
    for (const [pattern, target] of Object.entries(routes)) {
      const live = liveByPattern.get(pattern);
      assert.ok(live, `live baseline missing pattern: ${pattern}`);
      const frozen = byId.get(live.routeId);
      assert.ok(frozen, `frozen baseline missing route: ${live.routeId}`);
      assert.equal(frozen.policy, live.policy, `policy drift for ${live.routeId}`);
      if (target.policy !== undefined) {
        assert.equal(frozen.policy, target.policy, `policy owner not recorded for ${live.routeId}`);
      }
    }
    // Builder preserves an explicit policy owner.
    const built = buildLegacyRouteBaselineEntry({
      pattern: 'HEAD /user/begin_oidc',
      policy: 'disallowedHeadRequestHandler',
      authorization: { kind: 'pre-auth', reason: 'Rejected OpenID Connect HEAD request.' },
      routeId: 'HEAD /user/begin_oidc (policy-only)',
    });
    assert.equal(built.policy, 'disallowedHeadRequestHandler');
  });
});
