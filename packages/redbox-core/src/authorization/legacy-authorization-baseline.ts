import UrlPattern from 'url-pattern';
import { auth } from '../config/auth.config';
import {
  FROZEN_CONTRACT_ROUTE_IDS,
  FROZEN_LEGACY_PATH_RULE_ROWS,
  FROZEN_LEGACY_ROUTE_BASELINE,
} from './legacy-authorization-baseline.snapshot';
import type { RouteAuthorization } from './types';

export interface LegacyPathRuleBaselineRow {
  readonly index: number;
  readonly path: string;
  readonly role: string;
  readonly canRead: boolean;
  readonly canUpdate: boolean;
  readonly broad: boolean;
}

/**
 * Durable machine-readable projection of the legacy `sails.config.auth.rules`
 * table. This is the Phase 0 compatibility baseline: every row keeps its
 * source index, path pattern, granting role, and read/update flags. Broad
 * `(/*)` rows are flagged so reviewers can see where a general pattern masks
 * a more specific business action.
 */
export const LEGACY_PATH_RULE_BASELINE: readonly LegacyPathRuleBaselineRow[] = Object.freeze(
  auth.rules.map((rule, index) => {
    const raw = rule as { can_read?: unknown; can_update?: unknown; can_write?: unknown };
    const canUpdate = raw.can_update === true || (raw as { can_write?: unknown }).can_write === true;
    return Object.freeze({
      index,
      path: rule.path,
      role: rule.role,
      canRead: raw.can_read === true || canUpdate,
      canUpdate,
      broad: rule.path.includes('(/*)'),
    });
  })
);

export type LegacyAuthExpectation = 'anonymous' | 'pre-auth' | 'session-or-bearer';

export interface LegacyRouteBaselineEntry {
  readonly routeId: string;
  readonly method: string;
  readonly pattern: string;
  readonly controller?: string;
  readonly action?: string;
  /** Sails policy owner (e.g. `disallowedHeadRequestHandler`) for policy-only or policy-guarded routes. */
  readonly policy?: string;
  readonly authorizationKind: RouteAuthorization['kind'];
  readonly scopeOrReason: string;
  readonly authExpectation: LegacyAuthExpectation;
  readonly brandOwned: boolean;
  readonly resourceType?: string;
  /** Indexes into LEGACY_PATH_RULE_BASELINE matched by a representative variant. */
  readonly pathRuleMatches: readonly number[];
  readonly grantingRoles: readonly string[];
  /** True when no legacy rule matches: historically allowed, denied in enforce. */
  readonly noRuleGrant: boolean;
  /** True when a broad (/*) rule participates in the match set. */
  readonly broadRuleMasking: boolean;
  readonly representativeVariants: readonly string[];
}

const VARIANT_SUBSTITUTIONS: Readonly<Record<string, string>> = Object.freeze({
  ':branding': 'default',
  ':portal': 'rdmp',
  ':oid': 'test-oid',
  ':id': 'test-id',
  ':action': 'test-action',
  ':attachId': 'test-attach',
  ':reportName': 'test-report',
  ':lng': 'en',
  ':ns': 'translation',
  ':asset': 'app.js',
  ':token': 'abc123',
});

function instantiateVariant(pattern: string): string {
  let variant = pattern.replace(/^[a-z]+\s+/iu, '');
  for (const [token, value] of Object.entries(VARIANT_SUBSTITUTIONS)) {
    variant = variant.split(token).join(value);
  }
  // Remaining `:param` placeholders become a concrete segment so UrlPattern can match.
  variant = variant.replace(/:[A-Za-z0-9_]+/gu, 'test-param');
  // UrlPattern uses `(/*)` wildcards; keep them, they match the prefix too.
  return variant;
}

export function representativeVariantsForPattern(pattern: string): readonly string[] {
  const trimmed = pattern.trim();
  const withoutMethod = trimmed.replace(/^[a-z]+\s+/iu, '');
  const instantiated = instantiateVariant(trimmed);
  return Object.freeze(instantiated === withoutMethod ? [instantiated] : [withoutMethod, instantiated]);
}

function matchRuleIndexes(variant: string): number[] {
  const matched: number[] = [];
  LEGACY_PATH_RULE_BASELINE.forEach(row => {
    try {
      const pattern = new UrlPattern(row.path);
      if (pattern.match(variant)) matched.push(row.index);
    } catch {
      // A malformed legacy pattern never grants; baseline records no match.
    }
  });
  return matched.sort((a, b) => a - b);
}

const RECORD_CONTROLLERS = new Set([
  'RecordController',
  'webservice/RecordController',
  'RecordAuditController',
  'webservice/RecordSchemaController',
  'ExportController',
  'webservice/ExportController',
  'webservice/SearchController',
]);

const BRAND_OWNED_CONTROLLERS: Readonly<Record<string, string>> = Object.freeze({
  RecordController: 'record',
  'webservice/RecordController': 'record',
  RecordAuditController: 'record-audit',
  'webservice/RecordSchemaController': 'record-schema',
  VocabularyController: 'vocabulary',
  'webservice/VocabularyController': 'vocabulary',
  FormVocabularyController: 'vocabulary-entry',
  'webservice/FigshareVocabularyController': 'vocabulary-mirror',
  'webservice/FigshareCrosswalkController': 'vocabulary-crosswalk',
  FormManagementController: 'form',
  'webservice/FormManagementController': 'form',
  RecordTypeController: 'record-type',
  'webservice/RecordTypeController': 'record-type',
  ReportController: 'report',
  ReportsController: 'report',
  'webservice/ReportController': 'report',
  NamedQueryController: 'named-query',
  'webservice/NamedQueryController': 'named-query',
  DashboardConfigController: 'dashboard-config',
  'webservice/DashboardConfigController': 'dashboard-config',
  HarvestRunController: 'harvest-run',
  'webservice/HarvestRunController': 'harvest-run',
  AdminController: 'admin-ui',
  UserController: 'user',
  'webservice/UserManagementController': 'user',
  TranslationController: 'translation',
  'webservice/TranslationController': 'translation',
  BrandingController: 'branding',
  BrandingAppController: 'branding',
  'webservice/BrandingController': 'branding',
  AppConfigController: 'app-config',
  'webservice/AppConfigController': 'app-config',
  'webservice/AdminController': 'app-config',
  AsynchController: 'workspace-job',
  DynamicAssetController: 'dynamic-asset',
  ActionController: 'record-action',
  WorkspaceTypesController: 'workspace',
  IntegrationAuditController: 'integration-audit',
  'webservice/IntegrationAuditController': 'integration-audit',
});

function authExpectationFor(kind: RouteAuthorization['kind']): LegacyAuthExpectation {
  if (kind === 'public') return 'anonymous';
  if (kind === 'pre-auth') return 'pre-auth';
  return 'session-or-bearer';
}

function scopeOrReasonFor(authorization: RouteAuthorization): string {
  if (authorization.kind === 'scope') return authorization.scope;
  return authorization.reason;
}

function methodFor(pattern: string): string {
  const match = /^\s*([A-Za-z*]+)\s+/u.exec(pattern);
  return match ? match[1].toLowerCase() : '*';
}

export function buildLegacyRouteBaselineEntry(input: {
  readonly pattern: string;
  readonly controller?: string;
  readonly action?: string;
  readonly policy?: string;
  readonly authorization: RouteAuthorization;
  readonly routeId: string;
}): LegacyRouteBaselineEntry {
  const variants = representativeVariantsForPattern(input.pattern);
  const matched = [...new Set(variants.flatMap(matchRuleIndexes))].sort((a, b) => a - b);
  const grantingRoles = [...new Set(matched.map(index => LEGACY_PATH_RULE_BASELINE[index].role))].sort();
  const broadRuleMasking = matched.some(index => LEGACY_PATH_RULE_BASELINE[index].broad);
  const controller = input.controller ?? '';
  const resourceType =
    BRAND_OWNED_CONTROLLERS[controller] ?? (RECORD_CONTROLLERS.has(controller) ? 'record' : undefined);
  return Object.freeze({
    routeId: input.routeId,
    method: methodFor(input.pattern),
    pattern: input.pattern,
    ...(input.controller === undefined ? {} : { controller: input.controller }),
    ...(input.action === undefined ? {} : { action: input.action }),
    ...(input.policy === undefined ? {} : { policy: input.policy }),
    authorizationKind: input.authorization.kind,
    scopeOrReason: scopeOrReasonFor(input.authorization),
    authExpectation: authExpectationFor(input.authorization.kind),
    brandOwned: resourceType !== undefined,
    ...(resourceType === undefined ? {} : { resourceType }),
    pathRuleMatches: Object.freeze(matched),
    grantingRoles: Object.freeze(grantingRoles),
    noRuleGrant: matched.length === 0,
    broadRuleMasking,
    representativeVariants: variants,
  });
}

export function buildLegacyRouteBaseline(
  routes: Readonly<
    Record<
      string,
      {
        controller?: string;
        action?: string;
        policy?: string;
        authorization: RouteAuthorization;
        routeId: string;
      }
    >
  >
): readonly LegacyRouteBaselineEntry[] {
  return Object.freeze(
    Object.entries(routes).map(([pattern, target]) =>
      buildLegacyRouteBaselineEntry({
        pattern,
        controller: target.controller,
        action: target.action,
        policy: target.policy,
        authorization: target.authorization,
        routeId: target.routeId,
      })
    )
  );
}

const MAX_REPORTED_DRIFTS = 10;

function stableJson(value: unknown): string {
  return JSON.stringify(value) ?? 'undefined';
}

/**
 * Compares live-derived baseline projections against the frozen maintained
 * snapshot. Returns human-readable drift descriptions; an empty result means
 * the live sources still match the reviewed characterization evidence.
 *
 * Any non-empty result is a Phase 0 stop-gate failure: either the source
 * changed without review (fix the source) or the change was reviewed (run
 * `npm run snapshot:legacy-baseline` and commit the snapshot diff alongside
 * the source change).
 */
export function describeLegacyBaselineDrift(input: {
  readonly livePathRows: readonly LegacyPathRuleBaselineRow[];
  readonly liveRouteEntries: readonly LegacyRouteBaselineEntry[];
  readonly liveContractRouteIds: readonly string[];
}): readonly string[] {
  const drifts: string[] = [];
  if (input.livePathRows.length !== FROZEN_LEGACY_PATH_RULE_ROWS.length) {
    drifts.push(
      `path-rule row count drift: live ${input.livePathRows.length} vs frozen ${FROZEN_LEGACY_PATH_RULE_ROWS.length}`
    );
  }
  const rowCount = Math.min(input.livePathRows.length, FROZEN_LEGACY_PATH_RULE_ROWS.length);
  for (let index = 0; index < rowCount; index += 1) {
    if (stableJson(input.livePathRows[index]) !== stableJson(FROZEN_LEGACY_PATH_RULE_ROWS[index])) {
      drifts.push(
        `path-rule row ${index} drift: live ${stableJson(input.livePathRows[index])} vs frozen ${stableJson(FROZEN_LEGACY_PATH_RULE_ROWS[index])}`
      );
      if (drifts.length >= MAX_REPORTED_DRIFTS) break;
    }
  }
  if (input.liveRouteEntries.length !== FROZEN_LEGACY_ROUTE_BASELINE.length) {
    drifts.push(
      `route entry count drift: live ${input.liveRouteEntries.length} vs frozen ${FROZEN_LEGACY_ROUTE_BASELINE.length}`
    );
  }
  const liveById = new Map(input.liveRouteEntries.map(entry => [entry.routeId, entry]));
  const frozenById = new Map(FROZEN_LEGACY_ROUTE_BASELINE.map(entry => [entry.routeId, entry]));
  for (const routeId of [...liveById.keys()].sort()) {
    const frozen = frozenById.get(routeId);
    if (frozen === undefined) {
      drifts.push(`unbaselined live route: ${routeId}`);
      if (drifts.length >= MAX_REPORTED_DRIFTS) break;
    } else if (stableJson(liveById.get(routeId)) !== stableJson(frozen)) {
      drifts.push(`route entry drift: ${routeId}`);
      if (drifts.length >= MAX_REPORTED_DRIFTS) break;
    }
  }
  if (drifts.length < MAX_REPORTED_DRIFTS) {
    for (const routeId of [...frozenById.keys()].sort()) {
      if (!liveById.has(routeId)) {
        drifts.push(`missing live route for frozen entry: ${routeId}`);
        if (drifts.length >= MAX_REPORTED_DRIFTS) break;
      }
    }
  }
  const liveContract = [...input.liveContractRouteIds].sort();
  if (stableJson(liveContract) !== stableJson([...FROZEN_CONTRACT_ROUTE_IDS].sort())) {
    const missing = FROZEN_CONTRACT_ROUTE_IDS.filter(id => !liveContract.includes(id));
    const added = liveContract.filter(id => !FROZEN_CONTRACT_ROUTE_IDS.includes(id));
    drifts.push(
      `contract route set drift: live ${liveContract.length} vs frozen ${FROZEN_CONTRACT_ROUTE_IDS.length}` +
        (missing.length > 0 ? `; missing: ${missing.slice(0, 3).join(', ')}` : '') +
        (added.length > 0 ? `; added: ${added.slice(0, 3).join(', ')}` : '')
    );
  }
  return Object.freeze(drifts);
}
