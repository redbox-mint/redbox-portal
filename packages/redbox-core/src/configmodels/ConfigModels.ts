import { SystemMessage, SYSTEM_MESSAGE_SCHEMA } from './SystemMessage';
import { AuthorizedDomainsEmails, AUTHORIZED_DOMAINS_EMAILS_SCHEMA } from './AuthorizedDomainsEmails';
import { MenuConfig, MENU_CONFIG_SCHEMA } from './MenuConfig';
import { HomePanelConfig, HOME_PANEL_CONFIG_SCHEMA } from './HomePanelConfig';
import { AdminSidebarConfig, ADMIN_SIDEBAR_CONFIG_SCHEMA } from './AdminSidebarConfig';
import { FigsharePublishing, FIGSHARE_PUBLISHING_SCHEMA } from './FigsharePublishing';
import {
  DoiPublishing,
  DOI_PUBLISHING_SCHEMA,
  fromDoiPublishingFormModel,
  toDoiPublishingFormModel
} from './DoiPublishing';
import * as path from 'path';

export interface ConfigModelFormAdapter {
  toForm?: (model: unknown) => unknown;
  fromForm?: (model: unknown) => unknown;
}

export interface ConfigModelInfo {
    modelName: string;
    title?: string;
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
    | 'doiPublishing';

export class ConfigModels {
    private static modelsMap: Map<string, ConfigModelInfo> = new Map([
        ['systemMessage', {
            modelName: 'SystemMessage',
            title: 'System Messages',
            class: SystemMessage,
            schema: SYSTEM_MESSAGE_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/SystemMessage.ts')
        }],
        ['authorizedDomainsEmails', {
            modelName: 'AuthorizedDomainsEmails',
            title: 'Authorized Domains and Emails',
            class: AuthorizedDomainsEmails,
            schema: AUTHORIZED_DOMAINS_EMAILS_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/AuthorizedDomainsEmails.ts')
        }],
        ['menu', {
            modelName: 'MenuConfig',
            title: 'Menu Configuration',
            class: MenuConfig,
            schema: MENU_CONFIG_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/MenuConfig.ts')
        }],
        ['homePanels', {
            modelName: 'HomePanelConfig',
            title: 'Home Panels Configuration',
            class: HomePanelConfig,
            schema: HOME_PANEL_CONFIG_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/HomePanelConfig.ts')
        }],
        ['adminSidebar', {
            modelName: 'AdminSidebarConfig',
            title: 'Admin Sidebar Configuration',
            class: AdminSidebarConfig,
            schema: ADMIN_SIDEBAR_CONFIG_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/AdminSidebarConfig.ts')
        }],
        ['figsharePublishing', {
            modelName: 'FigsharePublishing',
            title: 'Figshare Publishing',
            class: FigsharePublishing,
            schema: FIGSHARE_PUBLISHING_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/FigsharePublishing.ts'),
            secretFields: ['connection.token']
        }],
        ['doiPublishing', {
            modelName: 'DoiPublishing',
            title: 'DOI Publishing',
            class: DoiPublishing,
            schema: DOI_PUBLISHING_SCHEMA,
            tsGlob: path.join(__dirname, '../../src/configmodels/DoiPublishing.ts'),
            secretFields: ['connection.password'],
            formAdapter: {
                toForm: toDoiPublishingFormModel,
                fromForm: fromDoiPublishingFormModel
            }
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
