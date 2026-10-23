import { AppConfigSecrets as OwnedAppConfigSecrets } from '../../configuration/AppConfigSecrets';
import { getConfigurationRepositories } from '../../persistence/runtime';
import type { AppConfigSecretsConfig } from '../../config/appConfigSecrets.config';
export * from '../../configuration/AppConfigSecrets';
/** Temporary comparison adapter. New applications bind leases and logging explicitly. */
export class AppConfigSecrets extends OwnedAppConfigSecrets {
  public constructor(config: AppConfigSecretsConfig) {
    super(config, {
      leases: () => getConfigurationRepositories().secretLeases,
      get log() {
        return sails.log;
      },
    });
  }
}
