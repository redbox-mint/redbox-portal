import type { EmailContextKind } from '@researchdatabox/sails-ng-common';

/** Resolve only this brand's effective app config, exactly as integration dispatch does. */
export async function integrationEmailTemplateIds(brandId: string): Promise<Set<string>> {
  const ids = new Set(['integrationFailure', 'integrationRecovery']);
  let config: Record<string, unknown>;
  try {
    config = (
      typeof AppConfigService !== 'undefined'
        ? await AppConfigService.getAppConfigByBrandAndKey(brandId, 'integrationNotification')
        : (sails.config.brandingConfigurationDefaults as unknown as Record<string, unknown>)?.integrationNotification
    ) as Record<string, unknown>;
  } catch {
    // Unresolvable config cannot establish custom ownership. Never inspect another brand or log config.
    return ids;
  }
  const channels = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    for (const channel of value) {
      if (
        channel?.type === 'email' &&
        typeof channel.template === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(channel.template)
      )
        ids.add(channel.template);
    }
  };
  // Include disabled channels/configurations: the context contract does not change with enablement.
  channels(config?.channels);
  if (config?.perIntegration && typeof config.perIntegration === 'object') {
    for (const override of Object.values(config.perIntegration)) channels(override?.channels);
  }
  return ids;
}

export async function emailTemplateContextKind(brandId: string, templateId: string): Promise<EmailContextKind> {
  return (await integrationEmailTemplateIds(brandId)).has(templateId) ? 'integration' : 'record';
}
