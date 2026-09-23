import type { Page } from '@playwright/test';
import type { ResourceLedger } from '../fixtures/resources';
import { createRecord } from '../helpers/records';

export async function routeForEntry(
  route: string,
  id: string,
  page: Page,
  csrfToken: string,
  resources: ResourceLedger
): Promise<string> {
  if (!['A03', 'A04', 'A07'].includes(id)) return route;
  const record = await createRecord(page, csrfToken, resources, 'rdmp', {
    title: resources.name(id, 'audit-record'), description: 'Playwright audit coverage record',
  });
  return id === 'A07' ? route.replace('e2e-playwright-audit', record.oid) : route;
}
