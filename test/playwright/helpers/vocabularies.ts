import { expect } from '@playwright/test';
import { PortalApi, type ResourceLedger } from '../fixtures/resources';

export function trackVocabulary(api: PortalApi, resources: ResourceLedger, id: string): void {
  resources.track({ kind: 'vocabulary', id, cleanup: async () => {
    const deleted = await api.mutate('delete', `api/vocabulary/${id}`);
    expect(deleted.ok() || deleted.status() === 404).toBeTruthy();
    expect((await api.get(`api/vocabulary/${id}`)).status()).toBe(404);
  } });
}
