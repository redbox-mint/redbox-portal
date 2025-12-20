import {SystemMessage} from './SystemMessage';
import {AuthorizedDomainsEmails} from './AuthorizedDomainsEmails';
import {MenuConfig} from './MenuConfig';

export class ConfigModels {
    private static modelsMap: Map<string, any> = new Map([
        ['systemMessage', {modelName: 'SystemMessage', title: 'System Messages', class: SystemMessage}],
        ['authorizedDomainsEmails', {
            modelName: 'AuthorizedDomainsEmails',
            title: 'Authorized Domains and Emails',
            class: AuthorizedDomainsEmails
        }],
        ['menu', {
            modelName: 'MenuConfig',
            title: 'Menu Configuration',
            class: MenuConfig,
            tsGlob: 'typescript/api/configmodels/MenuConfig.ts'
        }],
    ]);

    public static getModelInfo(key: string): any {
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
        modelInfo: { modelName: string; title?: string; class: any; schema?: any; tsGlob?: string | string[] },
        options?: { preventOverride?: boolean }
    ): void {
        const preventOverride = options?.preventOverride === true;
        if (preventOverride && this.modelsMap.has(key)) {
            return;
        }
        this.modelsMap.set(key, modelInfo);
    }

}