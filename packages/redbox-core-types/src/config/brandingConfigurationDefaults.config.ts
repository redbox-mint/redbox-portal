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
    homePanels: BrandingHomePanelConfig;
    adminSidebar: BrandingAdminSidebarConfig;
}

// Note: Default values contain complex nested structures.
// The original config/brandingConfigurationDefaults.js file should be kept.
