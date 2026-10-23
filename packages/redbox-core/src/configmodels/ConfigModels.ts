export * from '../configuration/ConfigModelRegistry';
import { ConfigModelRegistry, type ConfigModelKey, type ConfigModelInfo } from '../configuration/ConfigModelRegistry';

/** Legacy comparison registration facade; standalone applications construct their own registry. */
const comparisonModels = new ConfigModelRegistry();
export class ConfigModels {
  public static getModelInfo(key: ConfigModelKey): ConfigModelInfo;
  public static getModelInfo(key: string): ConfigModelInfo | undefined;
  public static getModelInfo(key: string): ConfigModelInfo | undefined {
    return comparisonModels.getModelInfo(key);
  }
  public static getConfigKeys(): ConfigModelKey[] {
    return comparisonModels.getConfigKeys();
  }
  public static register(key: string, info: ConfigModelInfo, options?: { preventOverride?: boolean }): void {
    comparisonModels.register(key, info, options);
  }
}
