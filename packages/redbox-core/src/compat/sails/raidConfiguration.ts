/* oxlint-disable typescript/no-explicit-any */
import _ from 'lodash';
import type { RaidPublishingConfigData, RaidMappingField } from '../../configmodels/RaidPublishing';
type AnyRecord = Record<string, any>;
function legacyPathToJsonata(path: string): string {
  const parts = _.toPath(path);
  const expression = parts
    .map((part, index) => {
      if (/^\d+$/.test(part)) return `[${part}]`;
      const segment = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part)
        ? part
        : `"${part.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
      return index === 0 ? segment : `.${segment}`;
    })
    .join('');
  return /^(record|options|mappedData|types)(\.|\[|$)/.test(expression) ? expression : `record.${expression}`;
}

function normalizeLegacyMapping(mapping: AnyRecord): RaidPublishingConfigData['mapping'] {
  return Object.fromEntries(
    Object.entries(mapping ?? {}).map(([profile, rawFields]) => [
      profile,
      Object.fromEntries(
        Object.entries(rawFields as AnyRecord).map(([name, rawField]) => {
          const field = rawField as AnyRecord;
          if (field.engine || typeof field.src !== 'string') return [name, field as RaidMappingField];
          const normalized = {
            ...field,
            engine: 'jsonata',
            expression: legacyPathToJsonata(field.src),
            parseJson: undefined,
            src: undefined,
          };
          return [name, normalized as unknown as RaidMappingField];
        })
      ),
    ])
  );
}

export function legacyConfigToPublishing(raw: AnyRecord): RaidPublishingConfigData {
  return {
    enabled: raw.enabled !== false,
    connection: {
      baseUrl: String(raw.basePath ?? ''),
      token: String(raw.token ?? ''),
      timeoutMs: Number(raw.timeoutMs ?? 30000),
      oauth: {
        url: String(raw.oauth?.url ?? ''),
        clientId: String(raw.oauth?.client_id ?? raw.oauth?.clientId ?? ''),
        username: String(raw.oauth?.username ?? ''),
        password: String(raw.oauth?.password ?? ''),
        timeoutMs: Number(raw.oauth?.timeoutMs ?? 10000),
        expirySkewMs: Number(raw.oauth?.expirySkewMs ?? 30000),
      },
      retry: {
        maxAttempts: Number(raw.retry?.maxAttempts ?? 3),
        baseDelayMs: Number(raw.retry?.baseDelayMs ?? 500),
        maxDelayMs: Number(raw.retry?.maxDelayMs ?? 10000),
        jitter: raw.retry?.jitter !== false,
        retryOnStatusCodes: raw.retry?.retryOnStatusCodes ?? [408, 425, 429, 500, 502, 503, 504],
      },
    },
    durableRetry: {
      jobName: String(raw.retryJobName ?? 'RaidMintRetryJob'),
      schedule: String(raw.retryJobSchedule ?? 'in 5 minutes'),
      maxAttempts: Number(raw.retryJobMaxAttempts ?? 5),
    },
    saveBodyInMeta: raw.saveBodyInMeta !== false,
    raidFieldName: String(raw.raidFieldName ?? 'raidUrl'),
    orcidBaseUrl: String(raw.orcidBaseUrl ?? 'https://orcid.org/'),
    types: raw.types ?? {},
    mapping: normalizeLegacyMapping(raw.mapping ?? {}),
  };
}
