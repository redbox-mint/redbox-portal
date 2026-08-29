import { asScopeKey } from './validators';
import type { AuthorizationScopeDefinition, ScopeRegistrySource } from './types';

export const CORE_AUTHORIZATION_CATALOG_VERSION = '1';

const scope = (
  key: string,
  label: string,
  description: string,
  risk: AuthorizationScopeDefinition['risk']
): AuthorizationScopeDefinition => Object.freeze({ key: asScopeKey(key), label, description, risk });

export const CORE_AUTHORIZATION_SCOPES: readonly AuthorizationScopeDefinition[] = Object.freeze([
  scope('app-config.manage', 'Manage application configuration', 'Manage brand application configuration.', 'admin'),
  scope('attachment.manage', 'Manage attachments', 'Create, replace, and remove record attachments.', 'write'),
  scope('attachment.read', 'Read attachments', 'Read attachments for otherwise accessible records.', 'read'),
  scope(
    'authorization.assignment.manage',
    'Manage role assignments',
    'Grant and revoke brand role assignments.',
    'admin'
  ),
  scope(
    'authorization.assignment.read',
    'Read role assignments',
    'Inspect role assignments and their provenance.',
    'read'
  ),
  scope(
    'authorization.audit.read',
    'Read authorization audit',
    'Inspect authorization administration audit events.',
    'admin'
  ),
  scope(
    'authorization.explain',
    'Explain authorization decisions',
    'Inspect detailed authorization decision evidence.',
    'admin'
  ),
  scope('authorization.role.manage', 'Manage roles', 'Create and configure roles within an authorized brand.', 'admin'),
  scope('authorization.role.read', 'Read roles', 'Inspect roles and their effective scopes.', 'read'),
  scope('authorization.scope.read', 'Read scope catalog', 'Inspect the deployed authorization scope catalog.', 'read'),
  scope(
    'authorization.self.read',
    'Read own authorization',
    'Read the safe authorization projection for the current principal.',
    'read'
  ),
  scope('branding.manage', 'Manage branding', 'Manage brand presentation and identity configuration.', 'admin'),
  scope('dashboard.configure', 'Configure dashboards', 'Configure dashboards within an authorized brand.', 'admin'),
  scope('dashboard.read', 'Read dashboards', 'View dashboards within an authorized brand.', 'read'),
  scope('export.run', 'Run exports', 'Export authorized brand data.', 'write'),
  scope('form.manage', 'Manage forms', 'Create and configure record forms.', 'admin'),
  scope('form.read', 'Read forms', 'Read record form definitions.', 'read'),
  scope('harvest.manage', 'Manage harvesting', 'Configure and operate harvesting jobs.', 'admin'),
  scope('harvest.read', 'Read harvesting', 'Inspect harvesting jobs and results.', 'read'),
  scope(
    'integration.audit.read',
    'Read integration audit',
    'Inspect integration activity for an authorized brand.',
    'admin'
  ),
  scope('named-query.manage', 'Manage named queries', 'Create and configure named queries.', 'admin'),
  scope('navigation.manage', 'Manage navigation', 'Configure brand navigation.', 'admin'),
  scope('portal.home.read', 'Read portal home', 'View the portal home experience.', 'read'),
  scope('portal.profile.read', 'Read profile', 'View the current user profile.', 'read'),
  scope('record-type.manage', 'Manage record types', 'Create and configure record types.', 'admin'),
  scope('record-type.read', 'Read record types', 'Read record type definitions.', 'read'),
  scope('record.audit.read', 'Read record audit', 'Inspect record audit history.', 'read'),
  scope('record.create', 'Create records', 'Create records within an authorized brand.', 'write'),
  scope('record.delete', 'Delete records', 'Soft-delete records within an authorized brand.', 'write'),
  scope('record.destroy', 'Destroy records', 'Permanently destroy eligible records.', 'admin'),
  scope('record.permission.manage', 'Manage record permissions', 'Manage record-level access lists.', 'admin'),
  scope('record.read', 'Read records', 'Read records permitted by brand and record access rules.', 'read'),
  scope(
    'record.read.all',
    'Read all brand records',
    'Bypass record ACL checks for reads within an authorized brand.',
    'admin'
  ),
  scope('record.restore', 'Restore records', 'Restore soft-deleted records.', 'write'),
  scope('record.update', 'Update records', 'Update records permitted by brand and record access rules.', 'write'),
  scope(
    'record.update.all',
    'Update all brand records',
    'Bypass record ACL checks for updates within an authorized brand.',
    'admin'
  ),
  scope('report.manage', 'Manage reports', 'Create and configure reports.', 'admin'),
  scope('report.run', 'Run reports', 'Run reports within an authorized brand.', 'read'),
  scope('search.execute', 'Search records', 'Search records within an authorized brand.', 'read'),
  scope(
    'system.authorization.manage',
    'Manage system authorization',
    'Manage protected system authorization state.',
    'system'
  ),
  scope('system.brand.read', 'Read system brands', 'Inspect brands across the installation.', 'system'),
  scope('translation.manage', 'Manage translations', 'Manage translated portal content.', 'admin'),
  scope('user.account-link.manage', 'Manage account links', 'Link compatible user identities.', 'admin'),
  scope('user.manage', 'Manage users', 'Manage users within an authorized brand.', 'admin'),
  scope('user.read', 'Read users', 'Read users within an authorized brand.', 'read'),
  scope('user.token.manage', 'Manage legacy user tokens', 'Issue and revoke legacy bearer credentials.', 'admin'),
  scope('vocabulary.manage', 'Manage vocabularies', 'Create and configure vocabularies.', 'admin'),
  scope('vocabulary.read', 'Read vocabularies', 'Read vocabulary definitions and entries.', 'read'),
  scope('workspace.manage', 'Manage workspaces', 'Create and update workspaces.', 'write'),
  scope('workspace.read', 'Read workspaces', 'Read workspaces within an authorized brand.', 'read'),
]);

export function createCoreAuthorizationScopeSource(sourceVersion: string): ScopeRegistrySource {
  return Object.freeze({
    sourceType: 'core',
    sourcePackage: '@researchdatabox/redbox-core',
    sourceVersion,
    definitions: CORE_AUTHORIZATION_SCOPES,
  });
}
