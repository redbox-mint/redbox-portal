import { SystemMessage, SYSTEM_MESSAGE_SCHEMA } from './SystemMessage';
import { AuthorizedDomainsEmails, AUTHORIZED_DOMAINS_EMAILS_SCHEMA } from './AuthorizedDomainsEmails';
import { MenuConfig, MENU_CONFIG_SCHEMA } from './MenuConfig';
import { HomePanelConfig, HOME_PANEL_CONFIG_SCHEMA } from './HomePanelConfig';
import { AdminSidebarConfig, ADMIN_SIDEBAR_CONFIG_SCHEMA } from './AdminSidebarConfig';
import { FigsharePublishing, FIGSHARE_PUBLISHING_SCHEMA } from './FigsharePublishing';
import { OniPublishing, ONI_PUBLISHING_SCHEMA } from './OniPublishing';
import {
  DoiPublishing,
  DOI_PUBLISHING_SCHEMA,
  fromDoiPublishingFormModel,
  toDoiPublishingFormModel
} from './DoiPublishing';
import { SIEM_CONFIGURATION_SCHEMA, SiemConfiguration, normalizeSiemConfiguration } from './SiemConfiguration';
import { IntegrationNotificationConfig, INTEGRATION_NOTIFICATION_SCHEMA } from './IntegrationNotificationConfig';
import { RaidPublishing, RAID_PUBLISHING_SCHEMA } from './RaidPublishing';
import { WebAnalytics, WEB_ANALYTICS_SCHEMA } from './WebAnalytics';
import * as path from 'path';

export interface ConfigModelFormAdapter {
  toForm?: (model: unknown) => unknown;
  fromForm?: (model: unknown) => unknown;
}

export interface ConfigModelInfo {
    modelName: string;
    title?: string;
    /** Translation key for the admin page introduction; never stored in config data. */
    descriptionKey?: string;
    /** Optional presentation-only groups of top-level fields. Unlisted fields remain visible. */
    sections?: { titleKey: string; fields: string[] }[];
    requiresSetup?: boolean;
    class: new (...args: never[]) => object;
    schema?: unknown;
    tsGlob?: string | string[];
    secretFields?: string[];
    formAdapter?: ConfigModelFormAdapter;
}

export type ConfigModelKey =
    | 'systemMessage'
    | 'authorizedDomainsEmails'
    | 'menu'
    | 'homePanels'
    | 'adminSidebar'
    | 'figsharePublishing'
    | 'oniPublishing'
    | 'doiPublishing'
    | 'integrationNotification'
    | 'raidPublishing'
    | 'webAnalytics'
    | 'siem';

export class ConfigModels {
    private static modelsMap: Map<string, ConfigModelInfo> = new Map([
        ['systemMessage', {
            descriptionKey: 'admin-config-description-systemMessage',
            modelName: 'SystemMessage',
            title: 'admin-nav-system-msg',
            class: SystemMessage,
            schema: SYSTEM_MESSAGE_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/SystemMessage.ts')
        }],
        ['authorizedDomainsEmails', {
            descriptionKey: 'admin-config-description-authorizedDomainsEmails',
            modelName: 'AuthorizedDomainsEmails',
            title: 'admin-nav-domains',
            class: AuthorizedDomainsEmails,
            sections: [
                { titleKey: 'admin-config-aaf', fields: ['domainsAaf', 'emailsAaf'] },
                { titleKey: 'admin-config-oidc', fields: ['domainsOidc', 'emailsOidc'] }
            ],
            schema: AUTHORIZED_DOMAINS_EMAILS_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/AuthorizedDomainsEmails.ts')
        }],
        ['menu', {
            descriptionKey: 'admin-config-description-menu',
            modelName: 'MenuConfig',
            title: 'admin-nav-menu',
            class: MenuConfig,
            schema: MENU_CONFIG_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/MenuConfig.ts')
        }],
        ['homePanels', {
            descriptionKey: 'admin-config-description-homePanels',
            modelName: 'HomePanelConfig',
            title: 'admin-nav-homepanels',
            class: HomePanelConfig,
            schema: HOME_PANEL_CONFIG_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/HomePanelConfig.ts')
        }],
        ['adminSidebar', {
            descriptionKey: 'admin-config-description-adminSidebar',
            modelName: 'AdminSidebarConfig',
            title: 'admin-nav-adminsidebar',
            class: AdminSidebarConfig,
            schema: ADMIN_SIDEBAR_CONFIG_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/AdminSidebarConfig.ts')
        }],
        ['figsharePublishing', {
            descriptionKey: 'admin-config-description-figsharePublishing',
            modelName: 'FigsharePublishing',
            title: 'admin-nav-figsharepublishing',
            class: FigsharePublishing,
            sections: [
                { titleKey: 'admin-config-connection', fields: ['connection'] },
                { titleKey: 'admin-config-ownership', fields: ['impersonation'] },
                { titleKey: 'admin-config-processing', fields: ['processing'] },
                { titleKey: 'admin-config-article-record', fields: ['article', 'record'] },
                { titleKey: 'admin-config-authors', fields: ['authors'] },
                { titleKey: 'admin-config-metadata', fields: ['metadata'] },
                { titleKey: 'admin-config-categories', fields: ['categories'] },
                { titleKey: 'admin-config-files', fields: ['selection', 'assets'] },
                { titleKey: 'admin-config-embargo', fields: ['embargo'] },
                { titleKey: 'admin-config-queue', fields: ['queue'] },
                { titleKey: 'admin-config-workflow', fields: ['workflow'] },
                { titleKey: 'admin-config-writeback', fields: ['writeBack'] }
            ],
            schema: FIGSHARE_PUBLISHING_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/FigsharePublishing.ts'),
            secretFields: ['connection.token']
        }],
        ['oniPublishing', {
            descriptionKey: 'admin-config-description-oniPublishing',
            modelName: 'OniPublishing',
            title: 'admin-nav-onipublishing',
            class: OniPublishing,
            schema: ONI_PUBLISHING_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/OniPublishing.ts'),
            secretFields: ['sites.*.ingestion.adminToken']
        }],
        ['doiPublishing', {
            descriptionKey: 'admin-config-description-doiPublishing',
            modelName: 'DoiPublishing',
            title: 'admin-nav-doipublishing',
            class: DoiPublishing,
            schema: DOI_PUBLISHING_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/DoiPublishing.ts'),
            secretFields: ['connection.password'],
            formAdapter: {
                toForm: toDoiPublishingFormModel,
                fromForm: fromDoiPublishingFormModel
            }
        }],
        ['siem', {
            modelName: 'SiemConfiguration',
            title: 'SIEM Configuration',
            class: SiemConfiguration,
            schema: SIEM_CONFIGURATION_SCHEMA,
            formAdapter: { fromForm: normalizeSiemConfiguration },
            tsGlob: path.join(__dirname, '../../src/configmodels/SiemConfiguration.ts'),
            secretFields: [
                'destinations[].token',
                'destinations[].password'
            ]
        }],
        ['integrationNotification', {
            descriptionKey: 'admin-config-description-integrationNotification',
            modelName: 'IntegrationNotificationConfig',
            title: 'admin-nav-notifications',
            class: IntegrationNotificationConfig,
            schema: INTEGRATION_NOTIFICATION_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/IntegrationNotificationConfig.ts')
        }],
        ['raidPublishing', {
            descriptionKey: 'admin-config-description-raidPublishing',
            modelName: 'RaidPublishing',
            title: 'admin-nav-raidpublishing',
            class: RaidPublishing,
            schema: RAID_PUBLISHING_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/RaidPublishing.ts'),
            secretFields: ['connection.token', 'connection.oauth.password']
        }],
        ['webAnalytics', {
            descriptionKey: 'admin-config-description-webAnalytics',
            modelName: 'WebAnalytics',
            title: 'admin-nav-web-analytics',
            class: WebAnalytics,
            schema: WEB_ANALYTICS_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/WebAnalytics.ts')
        }],
    ]);

    public static getModelInfo(key: ConfigModelKey): ConfigModelInfo;
    public static getModelInfo(key: string): ConfigModelInfo | undefined;
    public static getModelInfo(key: string): ConfigModelInfo | undefined {
        return this.modelsMap.get(key);
    }

    public static getConfigKeys(): ConfigModelKey[] {
        return Array.from(this.modelsMap.keys()) as ConfigModelKey[];
    }

    /**
     * Allow extensions/hooks to register additional config models at runtime.
     * If a key already exists, it will be overwritten unless preventOverride is true.
     */
    public static register(
        key: string,
        modelInfo: ConfigModelInfo,
        options?: { preventOverride?: boolean }
    ): void {
        const preventOverride = options?.preventOverride === true;
        if (preventOverride && this.modelsMap.has(key)) {
            return;
        }
        this.modelsMap.set(key, modelInfo);
    }

}
