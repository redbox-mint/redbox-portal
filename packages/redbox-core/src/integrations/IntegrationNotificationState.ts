import type { CacheEntryRepository } from '../persistence/cache/CacheEntryRepository';
import type { IntegrationNotificationInput } from './IntegrationNotifications';

/** The existing durable cache representation, without a timer or detached persistence writes. */
export function integrationNotificationState(
  repository: CacheEntryRepository,
  cacheExpirySeconds: number
): IntegrationNotificationInput['state'] {
  return {
    async get(name) {
      const row = await repository.findByName(name);
      // The legacy database fallback uses the configured cache lifetime. The
      // notification algorithm separately checks the failure's expiresAt window.
      if (!row || Math.floor(Date.now() / 1000) - row.ts_added > cacheExpirySeconds) return null;
      return row.data ?? null;
    },
    async set(name, data, _expirySeconds) {
      const existing = await repository.findByName(name);
      const entry = { name, data, ts_added: Math.floor(Date.now() / 1000) };
      if (existing) await repository.updateByName(name, entry);
      else await repository.create(entry);
    },
  };
}
