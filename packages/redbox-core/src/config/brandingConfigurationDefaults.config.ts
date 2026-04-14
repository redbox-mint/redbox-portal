/**
 * Branding Configuration Defaults Interface
 * (sails.config.brandingConfigurationDefaults and sails.config.auth)
 * 
 * Default configuration for per-brand settings including auth, menus, panels.
 */

import { createDefaultBinding, type DoiPublishingConfigData } from '../configmodels/DoiPublishing';

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
    doiPublishing?: DoiPublishingConfigData;
    figsharePublishing?: import('../configmodels/FigsharePublishing').FigsharePublishingConfigData;
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
                { id: 'adminsidebar', labelKey: 'menu-adminsidebarconfiguration', href: '/admin/appconfig/edit/adminSidebar' },
                { id: 'figsharepublishing', labelKey: 'menu-figsharepublishingconfiguration', href: '/admin/appconfig/edit/figsharePublishing' }
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

const DEFAULT_DOI_BASE_URL = 'https://api.test.datacite.org';
const DEFAULT_DOI_PREFIX = 'xxxxx';
const DEFAULT_DOI_USERNAME = 'xxxxx';
const DEFAULT_DOI_PASSWORD = 'xxxxxxx';
const DEFAULT_DOI_CITATION_URL_PATH = 'metadata.citation_url';
const DEFAULT_DOI_CITATION_DOI_PATH = 'metadata.citation_doi';
const DEFAULT_DOI_GENERATED_CITATION_PATH = 'metadata.citation_generated';

/**
 * Default DOI publishing configuration.
 * This is the canonical runtime baseline for brands that have not saved a DOI override.
 */
const defaultDoiPublishingConfig: DoiPublishingConfigData = {
    enabled: true,
    defaultProfile: 'dataPublication',
    connection: {
        baseUrl: DEFAULT_DOI_BASE_URL,
        username: DEFAULT_DOI_USERNAME,
        password: DEFAULT_DOI_PASSWORD,
        timeoutMs: 30000,
        retry: {
            maxAttempts: 3,
            baseDelayMs: 500,
            maxDelayMs: 4000,
            retryOnStatusCodes: [408, 429, 500, 502, 503, 504],
            retryOnMethods: ['get', 'put', 'patch', 'delete']
        }
    },
    operations: {
        createEvent: 'publish',
        updateEvent: 'publish',
        allowDeleteDraft: true,
        allowStateChange: true
    },
    profiles: {
        dataPublication: {
            enabled: true,
            label: 'Data Publication',
            metadata: {
                prefix: createDefaultBinding('', DEFAULT_DOI_PREFIX),
                url: {
                    kind: 'jsonata',
                    expression: `'https://redboxresearchdata.com.au/published/' & oid`
                },
                publicationYear: {
                    kind: 'jsonata',
                    expression: `record.metadata.citation_publication_date ? $substring(record.metadata.citation_publication_date, 0, 4) : $substring(now, 0, 4)`
                },
                publisher: createDefaultBinding('record.metadata.citation_publisher'),
                sizes: createDefaultBinding('record.metadata.collectionCapacity'),
                creators: [
                    {
                        sourcePath: 'metadata.creators',
                        itemMode: 'array',
                        name: {
                            kind: 'jsonata',
                            expression: `item.text_full_name ? item.text_full_name : item.family_name & ', ' & item.given_name`
                        },
                        nameType: createDefaultBinding('', 'Personal'),
                        givenName: createDefaultBinding('item.given_name'),
                        familyName: createDefaultBinding('item.family_name'),
                        nameIdentifiers: [
                            {
                                nameIdentifier: {
                                    kind: 'jsonata',
                                    expression: `item.orcid ? 'http://orcid.org/' & item.orcid : ''`
                                },
                                nameIdentifierScheme: createDefaultBinding('', 'ORCID'),
                                schemeUri: createDefaultBinding('', 'https://orcid.org')
                            }
                        ]
                    }
                ],
                titles: [
                    {
                        title: createDefaultBinding('record.metadata.citation_title')
                    }
                ],
                subjects: [],
                contributors: [],
                dates: [
                    {
                        date: createDefaultBinding('record.metadata.embargoUntil'),
                        dateType: createDefaultBinding('', 'Available')
                    },
                    {
                        date: createDefaultBinding('record.dateCreated'),
                        dateType: createDefaultBinding('', 'Created')
                    },
                    {
                        date: createDefaultBinding('record.dateUpdated'),
                        dateType: createDefaultBinding('', 'Updated')
                    },
                    {
                        date: createDefaultBinding('record.metadata.startDate'),
                        dateType: createDefaultBinding('', 'Other'),
                        dateInformation: createDefaultBinding('', 'Start Date')
                    },
                    {
                        date: createDefaultBinding('record.metadata.endDate'),
                        dateType: createDefaultBinding('', 'Other'),
                        dateInformation: createDefaultBinding('', 'End Date')
                    }
                ],
                alternateIdentifiers: [],
                relatedIdentifiers: [],
                rightsList: [
                    {
                        rightsUri: createDefaultBinding('record.metadata.license_identifier')
                    }
                ],
                descriptions: [
                    {
                        description: createDefaultBinding('record.metadata.description'),
                        descriptionType: createDefaultBinding('', 'Abstract')
                    }
                ],
                geoLocations: [],
                fundingReferences: [],
                relatedItems: [],
                types: {
                    resourceTypeGeneral: createDefaultBinding('', 'Dataset'),
                    resourceType: createDefaultBinding('', 'Dataset'),
                    ris: createDefaultBinding('', 'DATA'),
                    bibtex: createDefaultBinding('', 'misc'),
                    citeproc: createDefaultBinding('', 'dataset'),
                    schemaOrg: createDefaultBinding('', 'Dataset')
                }
            },
            writeBack: {
                citationUrlPath: DEFAULT_DOI_CITATION_URL_PATH,
                citationDoiPath: DEFAULT_DOI_CITATION_DOI_PATH,
                generatedCitationPath: DEFAULT_DOI_GENERATED_CITATION_PATH,
                citationString: {
                    kind: 'jsonata',
                    expression: `(record.metadata.creators ? $join(record.metadata.creators[$exists(family_name) or $exists(given_name)].((family_name ? family_name : "") & ", " & (given_name ? given_name : "")), "; ") : "") & " (" & $substring(record.metadata.citation_publication_date ? record.metadata.citation_publication_date : now, 0, 4) & "): " & record.metadata.citation_title & ". " & record.metadata.citation_publisher & ". " & (record.metadata.citation_doi = null ? "{ID_WILL_BE_HERE}" : "https://doi.org/" & record.metadata.citation_doi)`
                },
                extraFields: []
            },
            validation: {
                requireUrl: true,
                requirePublisher: true,
                requirePublicationYear: true,
                requireCreators: true,
                requireTitles: true
            }
        }
    },
    migration: {
        source: 'none',
        requiresTemplateReview: false,
        migratedAt: '',
        notes: []
    }
};

/**
 * Default branding configuration defaults
 * Provides fallback values when brand-specific config is not set
 */
export const brandingConfigurationDefaults: Partial<BrandingConfigurationDefaultsConfig> = {
    auth: defaultBrandAuthConfig,
    menu: defaultMenuConfig,
    homePanels: defaultHomePanelsConfig,
    adminSidebar: defaultAdminSidebarConfig,
    doiPublishing: defaultDoiPublishingConfig
};
