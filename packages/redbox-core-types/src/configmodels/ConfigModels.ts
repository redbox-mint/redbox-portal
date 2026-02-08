import { SystemMessage } from './SystemMessage';
import { AuthorizedDomainsEmails } from './AuthorizedDomainsEmails';
import { MenuConfig, MENU_CONFIG_SCHEMA } from './MenuConfig';
import { HomePanelConfig, HOME_PANEL_CONFIG_SCHEMA } from './HomePanelConfig';
import { AdminSidebarConfig, ADMIN_SIDEBAR_CONFIG_SCHEMA } from './AdminSidebarConfig';
import * as path from 'path';

export interface ConfigModelInfo {
    modelName: string;
    title?: string;
    class: new (...args: never[]) => object;
    schema?: unknown;
    tsGlob?: string | string[];
}

export class ConfigModels {
    private static modelsMap: Map<string, ConfigModelInfo> = new Map([
        ['systemMessage', {
            modelName: 'SystemMessage',
            title: 'System Messages',
            class: SystemMessage,
            tsGlob: path.join(__dirname, '../../src/configmodels/SystemMessage.ts')
        }],
        ['authorizedDomainsEmails', {
            modelName: 'AuthorizedDomainsEmails',
            title: 'Authorized Domains and Emails',
            class: AuthorizedDomainsEmails,
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
    ]);

    public static getModelInfo(key: string): ConfigModelInfo | undefined {
        return this.modelsMap.get(key);
    }

    public static getConfigKeys(): string[] {
        return Array.from(this.modelsMap.keys());
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
