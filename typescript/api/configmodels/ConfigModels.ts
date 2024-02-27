
import {SystemMessage} from './SystemMessage';

export class ConfigModels {
    private static modelsMap: Map<string, any> = new Map([
        ['systemMessage',  {modelName: 'SystemMessage', class: SystemMessage}]
    ]);

    public static getModelInfo(key: string): any {
        return this.modelsMap.get(key);
    }

    public static getConfigKeys(): string[] {
        return Array.from(this.modelsMap.keys());
    }
}