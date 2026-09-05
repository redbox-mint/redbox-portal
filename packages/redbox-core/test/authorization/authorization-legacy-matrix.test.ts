import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import UrlPattern from 'url-pattern';
import {
  LEGACY_MATRIX_BRANDS,
  LEGACY_MATRIX_EXPECTATIONS,
  LEGACY_MATRIX_PRINCIPALS,
  LEGACY_MATRIX_ROLES,
  LEGACY_MATRIX_ROUTE_EXCLUSIONS,
  type LegacyMatrixGate,
} from '../fixtures/authorization-legacy-matrix.fixtures';
import { APPROVED_SECURITY_DIFFERENCES } from '../fixtures/authorization-security-differences.fixtures';
import {
  FROZEN_LEGACY_PATH_RULE_ROWS,
  FROZEN_LEGACY_ROUTE_BASELINE,
} from '../../src/authorization/legacy-authorization-baseline.snapshot';

const PRINCIPAL_ROLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  anonymous: Object.freeze(['Guest']),
  'authenticated-guest-baseline': Object.freeze(['Guest']),
  'guest-brand-2-baseline': Object.freeze(['Guest']),
  'researcher-brand-1': Object.freeze(['Researcher']),
  'librarians-brand-1': Object.freeze(['Librarians']),
  'admin-brand-1': Object.freeze(['Admin']),
  'researcher-brand-2': Object.freeze(['Researcher']),
  'librarians-brand-2': Object.freeze(['Librarians']),
  'admin-brand-2': Object.freeze(['Admin']),
  'local-researcher-brand-1': Object.freeze(['Researcher']),
  'aaf-librarians-brand-1': Object.freeze(['Librarians']),
  'oidc-researcher-brand-1': Object.freeze(['Researcher']),
  'multi-role-researcher-plus-librarians-brand-1': Object.freeze(['Researcher', 'Librarians']),
  'custom-reviewer-brand-1': Object.freeze(['CustomReviewer']),
  'bootstrap-system-admin': Object.freeze(['Admin']),
  'linked-alias-canonicalized-to-primary': Object.freeze(['Researcher']),
  'legacy-bearer-researcher-brand-1': Object.freeze(['Researcher']),
  'legacy-bearer-librarians-brand-2': Object.freeze(['Librarians']),
});

function frozenAllows(path: string, roles: readonly string[], operation: 'read' | 'write'): boolean {
  return FROZEN_LEGACY_PATH_RULE_ROWS.some(row => {
    if (!roles.includes(row.role)) return false;
    try {
      if (!new UrlPattern(row.path).match(path)) return false;
    } catch {
      return false;
    }
    return operation === 'read' ? row.canRead : row.canUpdate;
  });
}

function rolesFor(principal: string, gate: LegacyMatrixGate): readonly string[] {
  // Brand-isolation rows model a principal evaluated where none of its
  // assignments exist, so the legacy outcome must be deny.
  if (gate === 'brand-isolation') return [];
  const roles = PRINCIPAL_ROLES[principal];
  assert.ok(roles !== undefined, `unmapped principal: ${principal}`);
  return roles;
}

describe('two-brand legacy characterization matrix', function () {
  it('covers two brands with Guest, Researcher, Librarians, Admin, custom, and system roles', function () {
    assert.equal(LEGACY_MATRIX_BRANDS.length, 2);
    const keys = LEGACY_MATRIX_ROLES.map(role => role.key);
    for (const expected of ['Guest', 'Researcher', 'Librarians', 'Admin', 'CustomReviewer', 'system-admin']) {
      assert.ok(keys.includes(expected), expected);
    }
    assert.ok(LEGACY_MATRIX_ROLES.some(role => role.brandId === 'brand-2'));
    for (const principal of LEGACY_MATRIX_PRINCIPALS) {
      assert.ok(PRINCIPAL_ROLES[principal] !== undefined, principal);
    }
    for (const principal of [
      'anonymous',
      'multi-role-researcher-plus-librarians-brand-1',
      'bootstrap-system-admin',
      'legacy-bearer-researcher-brand-1',
    ]) {
      assert.ok(LEGACY_MATRIX_PRINCIPALS.includes(principal), principal);
    }
  });

  it('verifies every expectation against the frozen rule table with no duplicates', function () {
    assert.ok(LEGACY_MATRIX_EXPECTATIONS.length >= 500, `matrix has ${LEGACY_MATRIX_EXPECTATIONS.length} rows`);
    const baselineIds = new Set(FROZEN_LEGACY_ROUTE_BASELINE.map(entry => entry.routeId));
    const seen = new Set<string>();
    for (const row of LEGACY_MATRIX_EXPECTATIONS) {
      // Uniqueness is scoped by the witnessed route: distinct routes may share
      // the same concrete path shape (e.g. GET vs POST on one pattern).
      const key = `${row.routeId}|${row.principal}|${row.path}|${row.operation}`;
      assert.ok(!seen.has(key), `duplicate matrix row: ${key}`);
      seen.add(key);
      assert.ok(row.routeId.length > 0, `row without routeId: ${row.principal}|${row.path}|${row.operation}`);
      if (!row.routeId.startsWith('template-only:')) {
        assert.ok(baselineIds.has(row.routeId), `row names an unknown routeId: ${row.routeId}`);
      }
      assert.ok(['read', 'write'].includes(row.operation));
      assert.ok(['allow', 'deny'].includes(row.expected));
      assert.ok(row.reason.length > 0);
      assert.ok(
        ['path-rule', 'record-acl', 'brand-isolation', 'bearer-parity', 'guest-baseline', 'legacy-error'].includes(
          row.gate
        )
      );
      assert.ok(['brand-1', 'brand-2'].includes(row.brandId));
      assert.equal(row.path.startsWith(row.brandId === 'brand-1' ? '/default/' : '/second/'), true, row.path);
      const actual = frozenAllows(row.path, rolesFor(row.principal, row.gate), row.operation);
      assert.equal(
        actual,
        row.expected === 'allow',
        `${key}: frozen rules say ${actual ? 'allow' : 'deny'} but matrix expects ${row.expected} (${row.reason})`
      );
    }
    const byKey = new Map(
      LEGACY_MATRIX_EXPECTATIONS.map(row => [`${row.principal}|${row.path}|${row.operation}`, row])
    );
    assert.equal(byKey.get('researcher-brand-1|/default/rdmp/record/123/attach|write')?.expected, 'allow');
    assert.equal(byKey.get('researcher-brand-1|/default/rdmp/record/test-oid/attach|write')?.expected, 'allow');
    assert.equal(byKey.get('researcher-brand-1|/default/rdmp/admin/users|write')?.expected, 'deny');
    assert.equal(byKey.get('admin-brand-1|/second/rdmp/admin/users|write')?.expected, 'deny');
  });

  it('covers every frozen rule template with both read and write rows in each brand', function () {
    const templates = [...new Set(FROZEN_LEGACY_PATH_RULE_ROWS.map(row => row.path))];
    assert.ok(templates.length >= 61);
    const uncovered: string[] = [];
    const missingOperation: string[] = [];
    const matchesTemplate = (
      template: string,
      brandPrefix: '/default/' | '/second/'
    ): typeof LEGACY_MATRIX_EXPECTATIONS => {
      let pattern: UrlPattern;
      try {
        pattern = new UrlPattern(template);
      } catch {
        return [] as unknown as typeof LEGACY_MATRIX_EXPECTATIONS;
      }
      return LEGACY_MATRIX_EXPECTATIONS.filter(row => {
        if (!row.path.startsWith(brandPrefix)) return false;
        try {
          return pattern.match(row.path) !== undefined && pattern.match(row.path) !== null;
        } catch {
          return false;
        }
      });
    };
    for (const template of templates) {
      let pattern: UrlPattern;
      try {
        pattern = new UrlPattern(template);
      } catch {
        uncovered.push(`${template} (unmatchable)`);
        continue;
      }
      void pattern;
      for (const brand of ['brand-1', 'brand-2'] as const) {
        const prefix = brand === 'brand-1' ? '/default/' : '/second/';
        const matching = matchesTemplate(template, prefix);
        if (matching.length === 0) uncovered.push(`${template} (${brand})`);
        else {
          if (!matching.some(row => row.operation === 'read'))
            missingOperation.push(`${template} (${brand} no read row)`);
          if (!matching.some(row => row.operation === 'write'))
            missingOperation.push(`${template} (${brand} no write row)`);
        }
      }
    }
    assert.deepEqual(uncovered, [], `rule templates without per-brand matrix coverage:\n${uncovered.join('\n')}`);
    assert.deepEqual(
      missingOperation,
      [],
      `rule templates without both operations per brand:\n${missingOperation.join('\n')}`
    );
  });

  it('pins read-only grants with explicit write denies in both brands', function () {
    // Templates where no rule grants can_update on that exact template must
    // have a write-deny row proving the read-only boundary, in EACH brand.
    const readOnlyTemplates = [...new Set(FROZEN_LEGACY_PATH_RULE_ROWS.map(row => row.path))].filter(
      template => !FROZEN_LEGACY_PATH_RULE_ROWS.some(source => source.path === template && source.canUpdate === true)
    );
    assert.ok(readOnlyTemplates.length > 0);
    const missing: string[] = [];
    for (const template of readOnlyTemplates) {
      let pattern: UrlPattern;
      try {
        pattern = new UrlPattern(template);
      } catch {
        continue;
      }
      for (const brandPrefix of ['/default/', '/second/'] as const) {
        const deny = LEGACY_MATRIX_EXPECTATIONS.some(row => {
          if (row.operation !== 'write' || row.expected !== 'deny') return false;
          if (!row.path.startsWith(brandPrefix)) return false;
          try {
            return pattern.match(row.path) !== undefined && pattern.match(row.path) !== null;
          } catch {
            return false;
          }
        });
        if (!deny) missing.push(`${template} (${brandPrefix})`);
      }
    }
    assert.deepEqual(missing, [], `read-only templates without a per-brand write-deny row:\n${missing.join('\n')}`);
    const brandPaths = LEGACY_MATRIX_EXPECTATIONS.map(row => row.path);
    assert.ok(brandPaths.some(path => path.startsWith('/default/')));
    assert.ok(brandPaths.some(path => path.startsWith('/second/')));
    // Exact per-brand template reconciliation replaces family spot checks:
    // every frozen template must match at least one row in each brand.
    const templates = [...new Set(FROZEN_LEGACY_PATH_RULE_ROWS.map(row => row.path))];
    for (const template of templates) {
      let pattern: UrlPattern;
      try {
        pattern = new UrlPattern(template);
      } catch {
        continue;
      }
      for (const prefix of ['/default/', '/second/'] as const) {
        const covered = LEGACY_MATRIX_EXPECTATIONS.some(row => {
          if (!row.path.startsWith(prefix)) return false;
          try {
            return pattern.match(row.path) !== undefined && pattern.match(row.path) !== null;
          } catch {
            return false;
          }
        });
        assert.ok(covered, `${template} (${prefix})`);
      }
    }
  });

  it('exercises every principal, role, and gate with isolation and bearer counterparts', function () {
    for (const principal of LEGACY_MATRIX_PRINCIPALS) {
      assert.ok(
        LEGACY_MATRIX_EXPECTATIONS.some(row => row.principal === principal),
        `principal without rows: ${principal}`
      );
    }
    const exercisedRoles = new Set(
      LEGACY_MATRIX_EXPECTATIONS.flatMap(row =>
        row.gate === 'brand-isolation' ? [] : [...rolesFor(row.principal, row.gate)]
      )
    );
    for (const role of ['Guest', 'Researcher', 'Librarians', 'Admin', 'CustomReviewer']) {
      assert.ok(exercisedRoles.has(role), `role without rows: ${role}`);
    }
    const gates = new Set(LEGACY_MATRIX_EXPECTATIONS.map(row => row.gate));
    for (const gate of [
      'path-rule',
      'record-acl',
      'brand-isolation',
      'bearer-parity',
      'guest-baseline',
      'legacy-error',
    ] as const) {
      assert.ok(gates.has(gate), `gate without rows: ${gate}`);
    }
    // Brand-isolation denies must have a same-path allow companion proving the
    // deny comes from brand scoping rather than a missing grant.
    for (const row of LEGACY_MATRIX_EXPECTATIONS.filter(candidate => candidate.gate === 'brand-isolation')) {
      assert.equal(row.expected, 'deny');
      assert.ok(
        LEGACY_MATRIX_EXPECTATIONS.some(
          companion =>
            companion.path === row.path && companion.operation === row.operation && companion.expected === 'allow'
        ),
        `isolation row without allow companion: ${row.principal}|${row.path}|${row.operation}`
      );
    }
    // Valid-bearer rows must match a non-bearer counterpart: a bearer adds no
    // authority beyond the resolved assignments.
    for (const row of LEGACY_MATRIX_EXPECTATIONS.filter(candidate => candidate.gate === 'bearer-parity')) {
      assert.ok(
        LEGACY_MATRIX_EXPECTATIONS.some(
          companion =>
            !companion.principal.startsWith('legacy-bearer-') &&
            companion.path === row.path &&
            companion.operation === row.operation &&
            companion.expected === row.expected
        ),
        `bearer row without session counterpart: ${row.principal}|${row.path}|${row.operation}`
      );
    }
  });

  it('records security deltas separately with no fabricated approval', function () {
    const ids = APPROVED_SECURITY_DIFFERENCES.map(row => row.id);
    for (const expected of [
      'invalid-bearer-401',
      'enforce-no-rule-deny',
      'cross-brand-404',
      'guest-explicit-assignment-rejected',
      'stale-session-roles-ignored',
    ]) {
      assert.ok(ids.includes(expected), expected);
    }
    for (const row of APPROVED_SECURITY_DIFFERENCES) {
      assert.equal(row.approval, 'external-required');
      assert.ok(row.historicalBehavior.length > 0);
      assert.ok(row.targetBehavior.length > 0);
      assert.ok(row.modes.length > 0);
    }
    // Parity expectations never smuggle a security-delta path/claim.
    const parityText = JSON.stringify(LEGACY_MATRIX_EXPECTATIONS);
    assert.ok(!parityText.includes('external-required'));
  });

  it('records the Guest explicit-assignment delta as a rejected security difference', function () {
    const guest = APPROVED_SECURITY_DIFFERENCES.find(row => row.id === 'guest-explicit-assignment-rejected');
    assert.ok(guest);
    assert.match(guest.targetBehavior, /never has assignment rows/u);
    assert.match(guest.targetBehavior, /rejected/u);
  });

  it('reconciles every inventoried routeId with explicit exclusions for non-brand routes', function () {
    // Direct routeId-keyed reconciliation: keys are frozen route IDs ×
    // granting roles × applicable operations × brand. Every parity row carries
    // an explicit routeId, and every key must have a same-routeId,
    // same-brand, same-operation witness whose principal resolves the
    // granting role and whose path instantiates the named route's own
    // pattern. Overlapping-template inference is NOT accepted: the witness
    // must name the routeId directly and match its pattern. Layered and
    // error gates (record-acl, brand-isolation, bearer-parity,
    // guest-baseline, legacy-error) are explicitly excluded from the path
    // requirement but still name concrete in-scope routes. Public, pre-auth,
    // and no-rule-grant routes are excluded only via
    // LEGACY_MATRIX_ROUTE_EXCLUSIONS; the exclusion list itself is pinned
    // exact so omissions fail.
    const excludedById = new Map(LEGACY_MATRIX_ROUTE_EXCLUSIONS.map(entry => [entry.routeId, entry.reason]));
    assert.equal(
      new Set(LEGACY_MATRIX_ROUTE_EXCLUSIONS.map(entry => entry.routeId)).size,
      LEGACY_MATRIX_ROUTE_EXCLUSIONS.length
    );
    const baselineById = new Map(FROZEN_LEGACY_ROUTE_BASELINE.map(entry => [entry.routeId, entry]));
    for (const entry of LEGACY_MATRIX_ROUTE_EXCLUSIONS) {
      assert.ok(entry.routeId.length > 0);
      assert.ok(entry.reason.length > 0, entry.routeId);
      const baseline = baselineById.get(entry.routeId);
      assert.ok(baseline !== undefined, `stale matrix exclusion without a frozen route: ${entry.routeId}`);
      assert.ok(
        baseline.authorizationKind !== 'scope' || baseline.noRuleGrant,
        `exclusion covers an in-scope route that requires matrix rows: ${entry.routeId}`
      );
    }
    const inScope = FROZEN_LEGACY_ROUTE_BASELINE.filter(
      entry => entry.authorizationKind === 'scope' && !entry.noRuleGrant
    );
    assert.ok(inScope.length >= 280, `in-scope route count ${inScope.length}`);
    for (const entry of FROZEN_LEGACY_ROUTE_BASELINE) {
      const isInScope = entry.authorizationKind === 'scope' && !entry.noRuleGrant;
      assert.equal(excludedById.has(entry.routeId), !isInScope, entry.routeId);
    }

    const ruleIndexesForPath = (concretePath: string): Set<number> => {
      const matched = new Set<number>();
      FROZEN_LEGACY_PATH_RULE_ROWS.forEach(row => {
        try {
          if (new UrlPattern(row.path).match(concretePath)) matched.add(row.index);
        } catch {
          // A malformed legacy pattern never grants.
        }
      });
      return matched;
    };
    // Brand-neutral principals serve both brands; `-brand-2` principals serve
    // brand-2; every other named principal serves brand-1.
    const principalBrand = (principal: string): 'brand-1' | 'brand-2' | null => {
      if (principal === 'anonymous' || principal === 'bootstrap-system-admin') return null;
      if (principal.includes('brand-2')) return 'brand-2';
      return 'brand-1';
    };
    const operationsForMethod = (method: string): Array<'read' | 'write'> => {
      if (method === 'get') return ['read'];
      if (method === '*') return ['read', 'write'];
      if (['post', 'put', 'patch', 'delete'].includes(method)) return ['write'];
      throw new Error(`unmapped route method: ${method}`);
    };
    // Strict named-route witnessing: a row witnesses the route it names only
    // when its concrete path instantiates that route's own pattern. Shared
    // legacy-rule overlap is NOT accepted as witnessing: overlapping templates
    // (e.g. a broad `api(/*)` grant) must not stand in for the named route.
    const routeMatchesPath = (routePattern: string, concretePath: string): boolean => {
      const withoutMethod = routePattern.replace(/^[a-z*]+\s+/iu, '');
      try {
        return (
          new UrlPattern(withoutMethod).match(concretePath) !== undefined &&
          new UrlPattern(withoutMethod).match(concretePath) !== null
        );
      } catch {
        // A malformed route pattern never witnesses.
        return false;
      }
    };
    // Strict exact matching with NO blanket gate exemption: every
    // non-template row must directly name its witnessed route and
    // instantiate that route's own pattern. Layered/error gates
    // (`record-acl`, `brand-isolation`, `bearer-parity`, `guest-baseline`,
    // `legacy-error`) receive no path-instantiation exemption: each such row
    // still names a concrete in-scope routeId and its concrete path must
    // instantiate that route's pattern (shared legacy-rule overlap never
    // witnesses). This is a regression guard for the 38 previously-exempted
    // mismatches (attach without suffix, generic admin, download, asynch
    // progress, integration-audit renames).
    // Every non-sentinel row must directly name its witnessed route and
    // instantiate that route's own pattern. Allow rows must resolve a
    // granting role of that route; deny rows are supplementary evidence for
    // the named route.
    const stray: string[] = [];
    for (const row of LEGACY_MATRIX_EXPECTATIONS) {
      if (row.routeId.startsWith('template-only:')) continue;
      const entry = baselineById.get(row.routeId);
      if (entry === undefined) {
        stray.push(`${row.routeId} (unknown route, witnessed by ${row.principal}|${row.path}|${row.operation})`);
        continue;
      }
      if (entry.authorizationKind !== 'scope' || entry.noRuleGrant) {
        stray.push(`${row.routeId} (out-of-scope route witnessed by ${row.principal}|${row.path}|${row.operation})`);
        continue;
      }
      if (!routeMatchesPath(entry.pattern, row.path)) {
        stray.push(
          `${row.routeId} (path does not instantiate the named route: ${row.principal}|${row.path}|${row.operation}|${row.gate})`
        );
        continue;
      }
      if (row.expected === 'allow') {
        const resolvesGrant = rolesFor(row.principal, row.gate).some(role => entry.grantingRoles.includes(role));
        if (!resolvesGrant) {
          stray.push(
            `${row.routeId} (allow row resolves no granting role: ${row.principal}|${row.path}|${row.operation})`
          );
        }
      }
    }
    assert.deepEqual(stray, [], `rows with unjustified routeId witnesses:\n${stray.join('\n')}`);
    // Regression: no non-template row may rely on shared PathRule overlap.
    // Every non-template path must instantiate its named route (checked
    // above); additionally pin that historically-mismatched shapes are gone.
    const legacyMismatchShapes = LEGACY_MATRIX_EXPECTATIONS.filter(
      row =>
        !row.routeId.startsWith('template-only:') &&
        (row.path === '/default/rdmp/record/123' ||
          row.path === '/second/rdmp/record/123' ||
          row.path === '/default/rdmp/asynch/progress' ||
          row.path === '/second/rdmp/asynch/progress' ||
          row.path === '/default/rdmp/admin/named-query/list' ||
          row.path === '/second/rdmp/admin/named-query/list')
    );
    assert.deepEqual(
      legacyMismatchShapes.map(row => `${row.routeId}|${row.principal}|${row.path}`),
      [],
      'legacy mismatched witness shapes must not return'
    );
    // Template-only sentinels are justified only when NO frozen route (in any
    // authorization kind) references the cited rule indexes.
    const sentinelRows = LEGACY_MATRIX_EXPECTATIONS.filter(row => row.routeId.startsWith('template-only:'));
    assert.ok(sentinelRows.length > 0, 'expected template-only rows for routeless legacy templates');
    const unjustifiedSentinels: string[] = [];
    for (const row of sentinelRows) {
      const cited = [...ruleIndexesForPath(row.path)];
      if (cited.length === 0) {
        unjustifiedSentinels.push(`${row.routeId} (row path matches no legacy rule: ${row.path})`);
        continue;
      }
      const referencing = FROZEN_LEGACY_ROUTE_BASELINE.filter(entry =>
        entry.pathRuleMatches.some(index => cited.includes(index))
      );
      if (referencing.length > 0) {
        unjustifiedSentinels.push(`${row.routeId} (rules ${cited.join(',')} referenced by ${referencing[0].routeId})`);
      }
      if (!row.routeId.includes(`rule-${cited.sort((a, b) => a - b).join('+')}`)) {
        unjustifiedSentinels.push(`${row.routeId} (sentinel does not cite matched rules ${cited.join(',')})`);
      }
    }
    assert.deepEqual(
      unjustifiedSentinels,
      [],
      `unjustified template-only sentinels:\n${unjustifiedSentinels.join('\n')}`
    );
    // Direct key coverage: every routeId × granting role × applicable
    // operation × brand key must have a witness row naming that exact routeId
    // whose path instantiates the route pattern (no shared-rule inference).
    const missing: string[] = [];
    for (const entry of inScope) {
      assert.ok(entry.grantingRoles.length > 0, entry.routeId);
      const instantiated = entry.representativeVariants[entry.representativeVariants.length - 1];
      assert.ok(instantiated.includes('/default/'), `${entry.routeId}: ${instantiated}`);
      for (const brand of ['brand-1', 'brand-2'] as const) {
        for (const operation of operationsForMethod(entry.method)) {
          for (const grantingRole of entry.grantingRoles) {
            const witness = LEGACY_MATRIX_EXPECTATIONS.find(row => {
              if (row.routeId !== entry.routeId) return false;
              if (row.brandId !== brand || row.operation !== operation) return false;
              // The witness pins the legacy outcome for the granting role on
              // the named route, whether allow or deny; each row's expected
              // value is already verified against the frozen table.
              if (!rolesFor(row.principal, row.gate).includes(grantingRole)) return false;
              const allowedBrand = principalBrand(row.principal);
              if (allowedBrand !== null && allowedBrand !== brand) return false;
              return routeMatchesPath(entry.pattern, row.path);
            });
            if (witness === undefined) {
              missing.push(`${entry.routeId} [${grantingRole}/${operation}/${brand}]`);
            }
          }
        }
      }
    }
    assert.deepEqual(missing, [], `routeId keys without a direct matrix witness:\n${missing.join('\n')}`);
  });
});
