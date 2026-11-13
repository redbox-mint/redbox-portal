import type { OniIngestionConfig } from '../../configmodels/OniPublishing';

export function oniIngestionHeaders(config: OniIngestionConfig) {
  return { Authorization: `Bearer ${config.adminToken}`, Accept: 'application/json' };
}
export function oniIndexStatusUrl(config: OniIngestionConfig, type: 'structural' | 'search') {
  return `${config.apiUrl.replace(/\/+$/, '')}/admin/index/${type}`;
}
