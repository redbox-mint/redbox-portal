import { SystemMessage, SYSTEM_MESSAGE_SCHEMA } from '../configmodels/SystemMessage';
import { AuthorizedDomainsEmails, AUTHORIZED_DOMAINS_EMAILS_SCHEMA } from '../configmodels/AuthorizedDomainsEmails';
import { MenuConfig, MENU_CONFIG_SCHEMA } from '../configmodels/MenuConfig';
import { HomePanelConfig, HOME_PANEL_CONFIG_SCHEMA } from '../configmodels/HomePanelConfig';
import { AdminSidebarConfig, ADMIN_SIDEBAR_CONFIG_SCHEMA } from '../configmodels/AdminSidebarConfig';
import { FigsharePublishing, FIGSHARE_PUBLISHING_SCHEMA } from '../configmodels/FigsharePublishing';
import { OniPublishing, ONI_PUBLISHING_SCHEMA } from '../configmodels/OniPublishing';
import {
  DoiPublishing,
  DOI_PUBLISHING_SCHEMA,
  fromDoiPublishingFormModel,
  toDoiPublishingFormModel,
} from '../configmodels/DoiPublishing';
import {
  SIEM_CONFIGURATION_SCHEMA,
  SiemConfiguration,
  normalizeSiemConfiguration,
} from '../configmodels/SiemConfiguration';
import {
  IntegrationNotificationConfig,
  INTEGRATION_NOTIFICATION_SCHEMA,
} from '../configmodels/IntegrationNotificationConfig';
import { RaidPublishing, RAID_PUBLISHING_SCHEMA } from '../configmodels/RaidPublishing';
import { WebAnalytics, WEB_ANALYTICS_SCHEMA } from '../configmodels/WebAnalytics';
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
  | 'oniPublishing'
  | 'doiPublishing'
  | 'integrationNotification'
  | 'raidPublishing'
  | 'webAnalytics'
  | 'siem';

export class ConfigModelRegistry {
  private modelsMap: Map<string, ConfigModelInfo> = new Map([
    [
      'systemMessage',
      {
        modelName: 'SystemMessage',
        title: 'System Messages',
        class: SystemMessage,
        schema: SYSTEM_MESSAGE_SCHEMA,
        tsGlob: path.join(__dirname, '../../src/configmodels/SystemMessage.ts'),
      },
    ],
    [
      'authorizedDomainsEmails',
      {
        modelName: 'AuthorizedDomainsEmails',
        title: 'Authorized Domains and Emails',
        class: AuthorizedDomainsEmails,
        schema: AUTHORIZED_DOMAINS_EMAILS_SCHEMA,
        tsGlob: path.join(__dirname, '../../src/configmodels/AuthorizedDomainsEmails.ts'),
      },
    ],
    [
      'menu',
      {
        modelName: 'MenuConfig',
        title: 'Menu Configuration',
        class: MenuConfig,
        schema: MENU_CONFIG_SCHEMA,
        tsGlob: path.join(__dirname, '../../src/configmodels/MenuConfig.ts'),
      },
    ],
    [
      'homePanels',
      {
        modelName: 'HomePanelConfig',
        title: 'Home Panels Configuration',
        class: HomePanelConfig,
        schema: HOME_PANEL_CONFIG_SCHEMA,
        tsGlob: path.join(__dirname, '../../src/configmodels/HomePanelConfig.ts'),
      },
    ],
    [
      'adminSidebar',
      {
        modelName: 'AdminSidebarConfig',
        title: 'Admin Sidebar Configuration',
        class: AdminSidebarConfig,
        schema: ADMIN_SIDEBAR_CONFIG_SCHEMA,
        tsGlob: path.join(__dirname, '../../src/configmodels/AdminSidebarConfig.ts'),
      },
    ],
    [
      'figsharePublishing',
      {
        modelName: 'FigsharePublishing',
        title: 'Figshare Publishing',
        class: FigsharePublishing,
        schema: FIGSHARE_PUBLISHING_SCHEMA,
        tsGlob: path.join(__dirname, '../../src/configmodels/FigsharePublishing.ts'),
        secretFields: ['connection.token'],
      },
    ],
    [
      'oniPublishing',
      {
        modelName: 'OniPublishing',
        title: 'Oni Publishing',
        class: OniPublishing,
        schema: ONI_PUBLISHING_SCHEMA,
        tsGlob: path.join(__dirname, '../../src/configmodels/OniPublishing.ts'),
        secretFields: ['sites.*.ingestion.adminToken'],
      },
    ],
    [
      'doiPublishing',
      {
        modelName: 'DoiPublishing',
        title: 'DOI Publishing',
        class: DoiPublishing,
        schema: DOI_PUBLISHING_SCHEMA,
        tsGlob: path.join(__dirname, '../../src/configmodels/DoiPublishing.ts'),
        secretFields: ['connection.password'],
        formAdapter: {
          toForm: toDoiPublishingFormModel,
          fromForm: fromDoiPublishingFormModel,
        },
      },
    ],
    [
      'siem',
      {
        modelName: 'SiemConfiguration',
        title: 'SIEM Configuration',
        class: SiemConfiguration,
        schema: SIEM_CONFIGURATION_SCHEMA,
        formAdapter: {
          fromForm: (model: unknown) => {
            const config = normalizeSiemConfiguration(model);
            // Preserve Waterline's physical omission of absent optional credentials.
            // The repository boundary continues to require plain JSON.
            for (const destination of config.destinations) {
              if (destination.token === undefined) delete destination.token;
              if (destination.username === undefined) delete destination.username;
              if (destination.password === undefined) delete destination.password;
            }
            return config;
          },
        },
        tsGlob: path.join(__dirname, '../../src/configmodels/SiemConfiguration.ts'),
        secretFields: ['destinations[].token', 'destinations[].password'],
      },
    ],
    [
      'integrationNotification',
      {
        modelName: 'IntegrationNotificationConfig',
        title: 'Integration Notification',
        class: IntegrationNotificationConfig,
        schema: INTEGRATION_NOTIFICATION_SCHEMA,
        tsGlob: path.join(__dirname, '../../src/configmodels/IntegrationNotificationConfig.ts'),
      },
    ],
    [
      'raidPublishing',
      {
        modelName: 'RaidPublishing',
        title: 'RAiD Publishing',
        class: RaidPublishing,
        schema: RAID_PUBLISHING_SCHEMA,
        tsGlob: path.join(__dirname, '../../src/configmodels/RaidPublishing.ts'),
        secretFields: ['connection.token', 'connection.oauth.password'],
      },
    ],
    [
      'webAnalytics',
      {
        modelName: 'WebAnalytics',
        title: 'Web Analytics',
        class: WebAnalytics,
        schema: WEB_ANALYTICS_SCHEMA,
        tsGlob: path.join(__dirname, '../../src/configmodels/WebAnalytics.ts'),
      },
    ],
  ]);

  public getModelInfo(key: ConfigModelKey): ConfigModelInfo;
  public getModelInfo(key: string): ConfigModelInfo | undefined;
  public getModelInfo(key: string): ConfigModelInfo | undefined {
    return this.modelsMap.get(key);
  }

  public getConfigKeys(): ConfigModelKey[] {
    return Array.from(this.modelsMap.keys()) as ConfigModelKey[];
  }

  /**
   * Allow extensions/hooks to register additional config models at runtime.
   * If a key already exists, it will be overwritten unless preventOverride is true.
   */
  public register(key: string, modelInfo: ConfigModelInfo, options?: { preventOverride?: boolean }): void {
    const preventOverride = options?.preventOverride === true;
    if (preventOverride && this.modelsMap.has(key)) {
      return;
    }
    this.modelsMap.set(key, modelInfo);
  }
}
