import {SystemMessage} from './SystemMessage';
import {AuthorizedDomainsEmails} from './AuthorizedDomainsEmails';

export class ConfigModels {
    private static modelsMap: Map<string, any> = new Map([
        ['systemMessage', {modelName: 'SystemMessage', title: 'System Messages', class: SystemMessage}],
        ['authorizedDomainsEmails', {
            modelName: 'AuthorizedDomainsEmails',
            title: 'Authorized Domains and Emails',
            class: AuthorizedDomainsEmails
        }],
    ]);

    public static getModelInfo(key: string): any {
        return this.modelsMap.get(key);
    }

    public static getConfigKeys(): string[] {
        return Array.from(this.modelsMap.keys());
    }
}