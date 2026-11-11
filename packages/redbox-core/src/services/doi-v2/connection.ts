import { resolveDoiConnectionPassword, type DoiPublishingConfigData } from '../../configmodels/DoiPublishing';

/** Shared by publishing and the admin read-only probe; Axios uses system TLS trust. */
export function doiConnectionOptions(connection: DoiPublishingConfigData['connection']) {
  return {
    timeout: connection.timeoutMs,
    headers: {
      Authorization: `Basic ${Buffer.from(`${connection.username}:${connection.password}`).toString('base64')}`,
      'Content-Type': 'application/vnd.api+json',
    },
  };
}

export function doiConnectionPassword(password: string): string {
  return resolveDoiConnectionPassword(password, { fallbackEnvVarNames: ['DOI_CONNECTION_PASSWORD', 'DATACITE_PASSWORD'] });
}
