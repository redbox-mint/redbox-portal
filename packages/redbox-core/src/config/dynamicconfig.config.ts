/**
 * Dynamic Config Interface
 * (configuration.dynamicconfig)
 *
 * Dynamic configuration settings.
 */

export interface DynamicConfigConfig {
  /** Active dynamic config modules */
  active: string[];
}

export const dynamicconfig: DynamicConfigConfig = {
  active: ['auth'],
};
