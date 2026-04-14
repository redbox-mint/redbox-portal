import _ from 'lodash';
import type { ResolvedDoiProfile } from './types';
import type { ResolvedDoiPublishingConfigData } from './types';

export function resolveProfileName(
  config: ResolvedDoiPublishingConfigData,
  options: Record<string, unknown> = {}
): string {
  const explicit = String(options.profile ?? '').trim();
  if (!_.isEmpty(explicit)) {
    return explicit;
  }
  const fallback = String(config.defaultProfile ?? '').trim();
  if (!_.isEmpty(fallback)) {
    return fallback;
  }
  throw new Error('DOI publishing profile was not provided and no default profile is configured');
}

export function resolveProfile(
  config: ResolvedDoiPublishingConfigData,
  options: Record<string, unknown> = {}
): ResolvedDoiProfile {
  const name = resolveProfileName(config, options);
  const profile = config.profiles[name];
  if (profile == null) {
    throw new Error(`DOI publishing profile '${name}' does not exist`);
  }
  if (profile.enabled !== true) {
    throw new Error(`DOI publishing profile '${name}' is disabled`);
  }
  return { name, profile };
}
