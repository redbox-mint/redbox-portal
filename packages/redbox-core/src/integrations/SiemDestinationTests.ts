import { assertSiemCredentialTarget } from '../services/siem/SiemConfigSecrets';
import { APP_CONFIG_SECRET_MASK } from '../configuration/AppConfigs';
import {
  SiemConfigurationError,
  type SiemDestinationConfig,
  type SiemConfigDto,
} from '../configmodels/SiemConfiguration';
import type { SiemTestInput } from '../services/siem/SiemTypes';
export function assertTestDestinationAllowed(destination: SiemDestinationConfig, config: SiemConfigDto): void {
  if (typeof destination?.id !== 'string' || destination.id.trim() === '') {
    throw new Error('A configured destination id is required.');
  }
  let requestedUrl: URL;
  try {
    requestedUrl = new URL(destination.endpointUrl);
  } catch {
    throw new Error('Destination endpoint URL is invalid.');
  }
  if (!['https:', 'http:'].includes(requestedUrl.protocol)) {
    throw new Error('Destination endpoint URL scheme is not allowed.');
  }
  const configuredDestination = (config.destinations ?? []).find(item => item.id === destination.id);
  if (configuredDestination == null) {
    throw new Error('Destination is not configured for this brand.');
  }
  let configuredUrl: URL;
  try {
    configuredUrl = new URL(configuredDestination.endpointUrl);
  } catch {
    throw new Error('Configured destination endpoint URL is invalid.');
  }
  if (requestedUrl.href !== configuredUrl.href || destination.adapterType !== configuredDestination.adapterType) {
    throw new SiemConfigurationError(
      'Destination endpoint or adapter changed. Save this destination with replacement or explicitly cleared credentials before testing.'
    );
  }
}

export function resolveMaskedTestDestinationSecrets(input: SiemTestInput, config: SiemConfigDto): SiemTestInput {
  const storedDestination = (config.destinations ?? []).find(item => item.id === input.destination.id);
  if (storedDestination == null) {
    return input;
  }
  assertSiemCredentialTarget(input.destination, storedDestination);
  const destination: SiemDestinationConfig = {
    ...input.destination,
    headers: input.destination.headers == null ? undefined : { ...input.destination.headers },
  };
  if (destination.token === APP_CONFIG_SECRET_MASK) {
    destination.token = storedDestination.token;
  }
  if (destination.password === APP_CONFIG_SECRET_MASK) {
    destination.password = storedDestination.password;
  }
  const headers = destination.headers;
  if (headers != null) {
    for (const [key, value] of Object.entries(headers)) {
      if (value !== APP_CONFIG_SECRET_MASK) {
        continue;
      }
      const storedKey = Object.keys(storedDestination.headers ?? {}).find(
        name => name.toLowerCase() === key.toLowerCase()
      );
      const storedValue = storedKey === undefined ? undefined : storedDestination.headers?.[storedKey];
      if (storedValue != null) {
        headers[key] = storedValue;
      } else {
        delete headers[key];
      }
    }
  }
  return { ...input, destination };
}
