import { createHash } from 'node:crypto';
import type { ProtectedRoleKind, RoleKey, ScopeKey } from './types';
import type { ScopeRegistry } from './scope-registry';
import { asNewRoleKey, asScopeKey, compareScopeKeys } from './validators';

export interface DefaultRoleTemplateDefinition {
  readonly key: RoleKey;
  readonly legacyRoleName?: string;
  readonly displayName: string;
  readonly description: string;
  readonly revision: number;
  readonly protectedKind: ProtectedRoleKind;
  readonly contextType: 'brand' | 'system';
  readonly scopeKeys: readonly ScopeKey[];
  readonly contentHash: string;
}

const keys = (...values: string[]): readonly ScopeKey[] => Object.freeze(values.map(asScopeKey).sort(compareScopeKeys));

/**
 * Scopes an anonymous or merely-authenticated principal may hold. This list is declared
 * independently of the Guest template rather than derived from it, so that widening the
 * template cannot silently widen the safety check that validates it. Extending this set
 * is a reviewed, deliberate change.
 */
export const GUEST_SCOPE_ALLOWLIST: ReadonlySet<ScopeKey> = new Set(
  ['authorization.self.read', 'portal.home.read'].map(asScopeKey)
);

const GUEST_SCOPE_KEYS = keys('authorization.self.read', 'portal.home.read');

const RESEARCHER_SCOPE_KEYS = keys(
  ...GUEST_SCOPE_KEYS,
  'attachment.manage',
  'attachment.read',
  'dashboard.read',
  'form.read',
  'portal.profile.read',
  'record-type.read',
  'record.create',
  'record.read',
  'record.update',
  'search.execute',
  'vocabulary.read',
  'workspace.manage',
  'workspace.read'
);

const LIBRARIAN_SCOPE_KEYS = keys(
  ...RESEARCHER_SCOPE_KEYS,
  'dashboard.configure',
  'export.run',
  'form.manage',
  'harvest.read',
  'record-type.manage',
  'record.audit.read',
  'record.delete',
  'record.permission.manage',
  'record.read.all',
  'record.restore',
  'record.update.all',
  'report.run',
  'translation.manage',
  'vocabulary.manage'
);

const BRAND_ADMIN_SCOPE_KEYS = keys(
  ...LIBRARIAN_SCOPE_KEYS,
  'app-config.manage',
  'authorization.assignment.manage',
  'authorization.assignment.read',
  'authorization.audit.read',
  'authorization.explain',
  'authorization.role.manage',
  'authorization.role.read',
  'authorization.scope.read',
  'branding.manage',
  'harvest.manage',
  'integration.audit.read',
  'named-query.manage',
  'navigation.manage',
  'record.destroy',
  'report.manage',
  'user.account-link.manage',
  'user.manage',
  'user.read',
  'user.token.manage'
);

const SYSTEM_ADMIN_SCOPE_KEYS = keys(
  'authorization.assignment.manage',
  'authorization.assignment.read',
  'authorization.role.manage',
  'authorization.role.read',
  'authorization.scope.read',
  'authorization.self.read',
  'system.authorization.manage',
  'system.brand.read'
);

function defineTemplate(
  definition: Omit<DefaultRoleTemplateDefinition, 'contentHash' | 'key'> & { readonly key: string }
): DefaultRoleTemplateDefinition {
  const key = asNewRoleKey(definition.key);
  const contentHash = createHash('sha256')
    .update(
      JSON.stringify({
        key,
        revision: definition.revision,
        protectedKind: definition.protectedKind,
        contextType: definition.contextType,
        scopeKeys: definition.scopeKeys,
      })
    )
    .digest('hex');
  return Object.freeze({ ...definition, key, scopeKeys: Object.freeze([...definition.scopeKeys]), contentHash });
}

export const DEFAULT_ROLE_TEMPLATES: readonly DefaultRoleTemplateDefinition[] = Object.freeze([
  defineTemplate({
    key: 'brand-admin',
    legacyRoleName: 'Admin',
    displayName: 'Brand administrators',
    description: 'Administrators for one brand, with an explicit protected administration floor.',
    revision: 1,
    protectedKind: 'brand-admin',
    contextType: 'brand',
    scopeKeys: BRAND_ADMIN_SCOPE_KEYS,
  }),
  defineTemplate({
    key: 'guest',
    legacyRoleName: 'Guest',
    displayName: 'Guest',
    description: 'The implicit safe baseline for every request in a brand.',
    revision: 1,
    protectedKind: 'guest',
    contextType: 'brand',
    scopeKeys: GUEST_SCOPE_KEYS,
  }),
  defineTemplate({
    key: 'librarian',
    legacyRoleName: 'Librarians',
    displayName: 'Librarians',
    description: 'Curation and operational capabilities within one brand.',
    revision: 1,
    protectedKind: 'none',
    contextType: 'brand',
    scopeKeys: LIBRARIAN_SCOPE_KEYS,
  }),
  defineTemplate({
    key: 'researcher',
    legacyRoleName: 'Researcher',
    displayName: 'Researchers',
    description: 'Normal record and workspace capabilities within one brand.',
    revision: 1,
    protectedKind: 'none',
    contextType: 'brand',
    scopeKeys: RESEARCHER_SCOPE_KEYS,
  }),
  defineTemplate({
    key: 'system-admin',
    displayName: 'System administrators',
    description: 'Protected installation-wide authorization administration.',
    revision: 1,
    protectedKind: 'system-admin',
    contextType: 'system',
    scopeKeys: SYSTEM_ADMIN_SCOPE_KEYS,
  }),
]);

export function validateDefaultRoleTemplates(registry: ScopeRegistry): void {
  for (const template of DEFAULT_ROLE_TEMPLATES) {
    const validation = registry.validateScopeKeys(template.scopeKeys);
    if (validation.inactiveScopeKeys.length > 0 || validation.missingScopeKeys.length > 0) {
      throw new Error(`Default role template '${template.key}' references inactive or missing scopes.`);
    }
    if (template.protectedKind === 'guest') {
      if (!template.scopeKeys.includes(asScopeKey('authorization.self.read'))) {
        throw new Error("The protected Guest template must contain 'authorization.self.read'.");
      }
      for (const scopeKey of template.scopeKeys) {
        if (!GUEST_SCOPE_ALLOWLIST.has(scopeKey)) {
          throw new Error(
            `The protected Guest template contains '${scopeKey}', which is outside the reviewed safe allowlist.`
          );
        }
        // Defence in depth: even an allowlisted key must not carry a privileged risk
        // classification, so a scope that is later reclassified fails startup validation.
        const risk = registry.get(scopeKey)?.risk;
        if (risk !== 'read') {
          throw new Error(`The protected Guest template contains '${scopeKey}', which is not a read-risk scope.`);
        }
      }
    }
    if ((template.protectedKind === 'system-admin') !== (template.contextType === 'system')) {
      throw new Error(`Default role template '${template.key}' has an incompatible protected context.`);
    }
  }
}
