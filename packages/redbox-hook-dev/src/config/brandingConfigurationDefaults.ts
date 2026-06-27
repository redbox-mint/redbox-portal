/**
 * Demo branding configuration defaults for redbox-hook-dev.
 *
 * These demo menu items, home panels, and DOI profile were extracted from
 * redbox-core to keep the core pristine. The loader merges these values
 * into the framework baseline via _.merge().
 */

import type {
    BrandingMenuConfig,
    BrandingHomePanelsConfig,
    BrandingConfigurationDefaultsConfig,
} from '@researchdatabox/redbox-core';
import { createDefaultBinding, type DoiPublishingConfigData } from '@researchdatabox/redbox-core';
import { record } from './record';

const demoMenuConfig: BrandingMenuConfig = {
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

const demoHomePanelsConfig: BrandingHomePanelsConfig = {
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

const DEFAULT_DOI_PREFIX = '';
const DEFAULT_DOI_CITATION_URL_PATH = 'metadata.citation_url';
const DEFAULT_DOI_CITATION_DOI_PATH = 'metadata.citation_doi';
const DEFAULT_DOI_GENERATED_CITATION_PATH = 'metadata.citation_generated';

const demoDoiPublishingConfig: Partial<DoiPublishingConfigData> = {
    defaultProfile: 'dataPublication',
    profiles: {
        dataPublication: {
            enabled: true,
            label: 'Data Publication',
            metadata: {
                prefix: createDefaultBinding('', DEFAULT_DOI_PREFIX),
                url: {
                    kind: 'jsonata',
                    expression: `'${record.baseUrl?.published ?? 'https://redboxresearchdata.com.au/published'}/' & oid`
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
    }
};

export const brandingConfigurationDefaults: Partial<BrandingConfigurationDefaultsConfig> = {
    menu: demoMenuConfig,
    homePanels: demoHomePanelsConfig,
    doiPublishing: demoDoiPublishingConfig as DoiPublishingConfigData,
};
