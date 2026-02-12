/**
 * Authentication and Authorization Configuration
 * (sails.config.auth)
 * 
 * Bootstrap configuration for roles, rules, and default auth settings.
 * Brand-specific auth configuration is in brandingConfigurationDefaults.config.ts
 */

import { AuthBootstrapConfig, PathRuleConfig, AuthRoleConfig } from './brandingConfigurationDefaults.config';

// Re-export the types for consumers
export { AuthBootstrapConfig, PathRuleConfig, AuthRoleConfig };

/**
 * Default authentication configuration
 * Contains roles, rules, and default brand settings for bootstrap
 */
export const auth: AuthBootstrapConfig = {
    // Bootstrap roles - only used one-time for bootstrapping, not intended for long-term maintenance
    roles: [
        { name: 'Admin' },
        { name: 'Librarians' },
        { name: 'Researcher' },
        { name: 'Guest' }
    ],
    // Default rules for the default brand
    rules: [
        { path: '/:branding/:portal/workspaces(/*)', role: 'Admin', can_update: true },
        { path: '/:branding/:portal/workspaces(/*)', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/workspaces(/*)', role: 'Researcher', can_update: true },
        { path: '/:branding/:portal/record/delete(/*)', role: 'Admin', can_update: true },
        { path: '/:branding/:portal/record/destroy(/*)', role: 'Admin', can_update: true },
        { path: '/:branding/:portal/listDeletedRecords(/*)', role: 'Admin', can_update: true },
        { path: '/:branding/:portal/admin', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/admin/translation', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/app/i18n(/*)', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/admin/reports', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/admin/getReport', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/admin/getReportResults', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/admin/downloadReportCSV', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/admin/report(/*)', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/admin/vocabulary(/*)', role: 'Admin', can_update: true },
        { path: '/:branding/:portal/admin/export', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/admin(/*)', role: 'Admin', can_update: true },
        { path: '/:branding/:portal/record(/*)', role: 'Researcher', can_update: true },
        { path: '/:branding/:portal/record(/*)', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/recordmeta(/*)', role: 'Researcher', can_update: true },
        { path: '/:branding/:portal/vocab(/*)', role: 'Researcher', can_read: true },
        { path: '/:branding/:portal/vocab(/*)', role: 'Librarians', can_read: true },
        { path: '/:branding/:portal/vocab(/*)', role: 'Admin', can_read: true },
        { path: '/:branding/:portal/query/vocab(/*)', role: 'Researcher', can_read: true },
        { path: '/:branding/:portal/query/vocab(/*)', role: 'Librarians', can_read: true },
        { path: '/:branding/:portal/query/vocab(/*)', role: 'Admin', can_read: true },
        { path: '/:branding/:portal/external(/*)', role: 'Researcher', can_update: true },
        { path: '/:branding/:portal/collection(/*)', role: 'Researcher', can_read: true },
        { path: '/:branding/:portal/mint(/*)', role: 'Researcher', can_read: true },
        { path: '/:branding/:portal/user/find(/*)', role: 'Researcher', can_read: true },
        { path: '/:branding/:portal/user/profile', role: 'Researcher', can_read: true },
        { path: '/:branding/:portal/dashboard(/*)', role: 'Researcher', can_update: true },
        { path: '/:branding/:portal/researcher/home', role: 'Researcher', can_update: true },
        { path: '/:branding/:portal/researcher/home', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/export(/*)', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/export(/*)', role: 'Admin', can_update: true },
        { path: '/:branding/:portal/appconfig(/*)', role: 'Admin', can_update: true },
        { path: '/:branding/:portal/asynch(/*)', role: 'Researcher', can_update: true },
        { path: '/:branding/:portal/asynch(/*)', role: 'Librarians', can_update: true },
        { path: '/:branding/:portal/api(/*)', role: 'Admin', can_update: true },
        { path: '/:branding/:portal/home', role: 'Guest', can_read: true },
        { path: '/:branding/:portal/app/branding(/*)', role: 'Admin', can_update: true }
    ],
    defaultBrand: 'default',
    defaultPortal: 'rdmp',
    loginPath: 'user/login',
    hiddenRoles: [],
    hiddenUsers: [],
    postLogoutRedir: '/default/rdmp/home'
};
