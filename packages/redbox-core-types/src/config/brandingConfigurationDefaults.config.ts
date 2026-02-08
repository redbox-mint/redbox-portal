/**
 * Branding Configuration Defaults Interface
 * (sails.config.brandingConfigurationDefaults and sails.config.auth)
 * 
 * Default configuration for per-brand settings including auth, menus, panels.
 */

export interface BrandAuthLocalConfig {
    usernameField: string;
    passwordField: string;
    default?: {
        adminUser: string;
        adminPw: string;
        email: string;
    };
    templatePath: string;
    postLoginRedir: string;
    hooks?: Record<string, unknown>;
}

export interface BrandAuthAafConfig {
    defaultRole: string;
    attributesField: string;
    usernameField: string;
    postLoginRedir: string;
    opts: Record<string, unknown>;
    templatePath: string;
}

export interface BrandAuthOidcConfig {
    debugMode: boolean;
    discoverAttemptsMax: number;
    discoverFailureSleep: number;
    defaultRole: string;
    postLoginRedir: string;
    claimMappings: Record<string, string>;
    opts: {
        issuer: string;
        client: {
            client_id: string;
            client_secret: string;
            redirect_uris: string[];
            post_logout_redirect_uris: string[];
        };
        params: {
            scope: string;
        };
    };
    templatePath: string;
}

export interface BrandAuthConfig {
    defaultRole: string;
    active: string[];
    local: BrandAuthLocalConfig;
    aaf: BrandAuthAafConfig;
    oidc: BrandAuthOidcConfig;
}

export interface MenuItemConfig {
    id: string;
    labelKey: string;
    href: string;
    requiresAuth?: boolean;
    hideWhenAuth?: boolean;
    requiredRoles?: string[];
    visibleWhenTranslationExists?: boolean;
    children?: MenuItemConfig[];
}

export interface BrandingMenuConfig {
    items: MenuItemConfig[];
    showSearch: boolean;
}

export interface HomePanelItemConfig {
    id: string;
    labelKey: string;
    href: string;
}

export interface BrandingHomePanelConfig {
    id: string;
    titleKey: string;
    iconClass: string;
    columnClass: string;
    items: HomePanelItemConfig[];
}

export interface BrandingHomePanelsConfig {
    panels: BrandingHomePanelConfig[];
}

export interface AdminSidebarItemConfig {
    id: string;
    labelKey: string;
    href: string;
}

export interface AdminSidebarSectionConfig {
    id: string;
    titleKey: string;
    defaultExpanded: boolean;
    requiredRoles?: string[];
    items: AdminSidebarItemConfig[];
}

export interface BrandingAdminSidebarConfig {
    header: {
        titleKey: string;
        iconClass: string;
    };
    sections: AdminSidebarSectionConfig[];
    footerLinks: AdminSidebarItemConfig[];
}

export interface PathRuleConfig {
    path: string;
    role: string;
    can_update?: boolean;
    can_read?: boolean;
}

export interface AuthRoleConfig {
    name: string;
}

export interface AuthBootstrapConfig {
    roles: AuthRoleConfig[];
    rules: PathRuleConfig[];
    defaultBrand: string;
    defaultPortal: string;
    loginPath: string;
    hiddenRoles: string[];
    hiddenUsers: string[];
    postLogoutRedir: string;
}

export interface BrandingConfigurationDefaultsConfig {
    auth: BrandAuthConfig;
    menu: BrandingMenuConfig;
    homePanels: BrandingHomePanelsConfig;
    adminSidebar: BrandingAdminSidebarConfig;
}

/**
 * Default brand auth config - used when brand-specific config is not set
 */
const defaultBrandAuthConfig: BrandAuthConfig = {
    defaultRole: 'Guest',
    active: [],
    local: {
        usernameField: 'username',
        passwordField: 'password',
        default: {
            adminUser: 'admin',
            adminPw: 'rbadmin',
            email: 'admin@redboxresearchdata.com.au'
        },
        templatePath: 'local.ejs',
        postLoginRedir: 'researcher/home',
        hooks: {
            onCreate: { pre: [], post: [] },
            onUpdate: { pre: [], post: [] }
        }
    },
    aaf: {
        defaultRole: 'Researcher',
        attributesField: 'https://aaf.edu.au/attributes',
        usernameField: 'sub',
        postLoginRedir: 'researcher/home',
        opts: {
            jsonWebTokenOptions: {
                issuer: 'https://rapid.aaf.edu.au',
                ignoreNotBefore: true,
                clockTolerance: 120,
            },
            passReqToCallback: true
        },
        templatePath: 'aaf.ejs'
    },
    oidc: {
        debugMode: false,
        discoverAttemptsMax: 5,
        discoverFailureSleep: 5000,
        defaultRole: 'Researcher',
        postLoginRedir: 'researcher/home',
        claimMappings: {
            username: 'sub',
            name: 'name',
            email: 'email',
            givenname: 'given_name',
            surname: 'family_name',
            cn: 'name',
            displayName: 'name'
        },
        opts: {
            issuer: '',
            client: {
                client_id: '',
                client_secret: '',
                redirect_uris: [''],
                post_logout_redirect_uris: ['']
            },
            params: {
                scope: 'openid email profile'
            }
        },
        templatePath: 'openidconnect.ejs'
    }
};

/**
 * Default menu configuration that mirrors the current static menu structure.
 * This can be overridden per-brand via the admin UI or environment config.
 */
const defaultMenuConfig: BrandingMenuConfig = {
    items: [
        {
            id: 'home-auth',
            labelKey: 'menu-home',
            href: '/researcher/home',
            requiresAuth: true
        },
        {
            id: 'plan',
            labelKey: 'menu-plan-nav',
            href: '#',
            requiresAuth: true,
            children: [
                { id: 'plan-create', labelKey: 'create-rdmp', href: '/record/rdmp/edit' },
                { id: 'plan-dashboard', labelKey: 'edit-dashboard-rdmp', href: '/dashboard/rdmp' },
                {
                    id: 'plan-advice',
                    labelKey: 'get-advice',
                    href: '/getAdvice',
                    visibleWhenTranslationExists: true
                }
            ]
        },
        {
            id: 'org',
            labelKey: 'menu-organisation-nav',
            href: '#',
            requiresAuth: true,
            children: [
                { id: 'org-workspaces', labelKey: 'workspaces-dashboard', href: '/workspaces/list' },
                {
                    id: 'org-services',
                    labelKey: 'workspace-services-list',
                    href: '/availableServicesList',
                    visibleWhenTranslationExists: true
                }
            ]
        },
        {
            id: 'manage',
            labelKey: 'menu-manage-nav',
            href: '#',
            requiresAuth: true,
            children: [
                { id: 'manage-create', labelKey: 'create-datarecord', href: '/record/dataRecord/edit' },
                { id: 'manage-dashboard', labelKey: 'edit-dashboard-datarecord', href: '/dashboard/dataRecord' }
            ]
        },
        {
            id: 'publish',
            labelKey: 'menu-publish-nav',
            href: '#',
            requiresAuth: true,
            children: [
                { id: 'publish-create', labelKey: 'create-data-publication', href: '/record/dataPublication/edit' },
                { id: 'publish-dashboard', labelKey: 'edit-dashboard-publication', href: '/dashboard/dataPublication' }
            ]
        },
        {
            id: 'admin',
            labelKey: 'menu-admin',
            href: '/admin',
            requiresAuth: true,
            requiredRoles: ['Admin', 'Librarians']
        },
        {
            id: 'home-anon',
            labelKey: 'menu-home',
            href: '/home',
            requiresAuth: false,
            hideWhenAuth: true
        }
    ],
    showSearch: true
};

/**
 * Default home panel configuration that mirrors the current static researcher home page.
 * This can be overridden per-brand via the admin UI or environment config.
 */
const defaultHomePanelsConfig: BrandingHomePanelsConfig = {
    panels: [
        {
            id: 'plan',
            titleKey: 'menu-plan',
            iconClass: 'icon-checklist icon-3x',
            columnClass: 'col-md-3 homepanel',
            items: [
                { id: 'plan-create', labelKey: 'create-rdmp', href: '/record/rdmp/edit' },
                { id: 'plan-dashboard', labelKey: 'edit-dashboard-rdmp', href: '/dashboard/rdmp' },
                {
                    id: 'plan-advice',
                    labelKey: 'get-advice',
                    href: '/getAdvice'
                }
            ]
        },
        {
            id: 'organise',
            titleKey: 'menu-organise-worspace',
            iconClass: 'fa fa-sitemap fa-3x',
            columnClass: 'col-md-3 homepanel',
            items: [
                { id: 'org-workspaces', labelKey: 'workspaces-dashboard', href: '/workspaces/list' },
                {
                    id: 'org-services',
                    labelKey: 'workspace-services-list',
                    href: '/availableServicesList'
                }
            ]
        },
        {
            id: 'manage',
            titleKey: 'menu-manage',
            iconClass: 'fa fa-laptop fa-3x',
            columnClass: 'col-md-3 homepanel',
            items: [
                { id: 'manage-create', labelKey: 'create-datarecord', href: '/record/dataRecord/edit' },
                { id: 'manage-dashboard', labelKey: 'edit-dashboard-datarecord', href: '/dashboard/dataRecord' }
            ]
        },
        {
            id: 'publish',
            titleKey: 'menu-publish',
            iconClass: 'fa fa-rocket fa-3x',
            columnClass: 'col-md-3 homepanel',
            items: [
                { id: 'publish-create', labelKey: 'create-data-publication', href: '/record/dataPublication/edit' },
                { id: 'publish-dashboard', labelKey: 'edit-dashboard-publication', href: '/dashboard/dataPublication' }
            ]
        }
    ]
};

/**
 * Default admin sidebar configuration that mirrors the current static admin sidebar structure.
 * This can be overridden per-brand via the admin UI or environment config.
 */
const defaultAdminSidebarConfig: BrandingAdminSidebarConfig = {
    header: {
        titleKey: 'menu-admin',
        iconClass: 'fa fa-cog'
    },
    sections: [
        {
            id: 'analyze',
            titleKey: 'menu-analyze',
            defaultExpanded: true,
            items: [
                { id: 'reports', labelKey: 'reports-heading', href: '/admin/reports' },
                { id: 'export', labelKey: 'menu-export', href: '/admin/export' },
                { id: 'deleted', labelKey: 'deleted-records-heading', href: '/admin/deletedRecords' }
            ]
        },
        {
            id: 'system',
            titleKey: 'menu-syssettings',
            defaultExpanded: true,
            requiredRoles: ['Admin'],
            items: [
                { id: 'roles', labelKey: 'menu-rolemgmt', href: '/admin/roles' },
                { id: 'users', labelKey: 'menu-usermgmt', href: '/admin/users' },
                { id: 'support', labelKey: 'menu-supportagreement', href: '/admin/supportAgreement' },
                { id: 'system-msg', labelKey: 'menu-systemmessages', href: '/admin/appconfig/edit/systemMessage' },
                { id: 'domains', labelKey: 'menu-authorizeddomainsemails', href: '/admin/appconfig/edit/authorizedDomainsEmails' }
            ]
        },
        {
            id: 'navigation',
            titleKey: 'menu-navigation',
            defaultExpanded: true,
            requiredRoles: ['Admin'],
            items: [
                { id: 'menu', labelKey: 'menu-menuconfiguration', href: '/admin/appconfig/edit/menu' },
                { id: 'homepanels', labelKey: 'menu-homepanelsconfiguration', href: '/admin/appconfig/edit/homePanels' },
                { id: 'adminsidebar', labelKey: 'menu-adminsidebarconfiguration', href: '/admin/appconfig/edit/adminSidebar' }
            ]
        },
        {
            id: 'lookup',
            titleKey: 'system-lookup-records',
            defaultExpanded: true,
            requiredRoles: ['Admin'],
            items: [
                { id: 'party', labelKey: 'system-lookup-record-item1', href: '/dashboard/party' },
                { id: 'vocabulary', labelKey: 'menu-vocabulary-management', href: '/admin/vocabulary/manager' }
            ]
        }
    ],
    footerLinks: [
        { id: 'branding', labelKey: 'admin-configure-branding', href: '/admin/branding' },
        { id: 'translation', labelKey: 'admin-configure-translation', href: '/admin/translation' }
    ]
};

/**
 * Default branding configuration defaults
 * Provides fallback values when brand-specific config is not set
 */
export const brandingConfigurationDefaults: Partial<BrandingConfigurationDefaultsConfig> = {
    auth: defaultBrandAuthConfig,
    menu: defaultMenuConfig,
    homePanels: defaultHomePanelsConfig,
    adminSidebar: defaultAdminSidebarConfig
};
