import type { APIRequestContext, Page } from '@playwright/test';
import { PortalApi, type ResourceLedger } from '../fixtures/resources';

type RecordResponse = {
  oid?: string;
  data?: { oid?: string; metadata?: Record<string, unknown> };
  metadata?: Record<string, unknown>;
};

export type OwnedRecord = {
  oid: string;
  etag: string;
  metadata: Record<string, unknown>;
};

function responseData(body: RecordResponse): RecordResponse['data'] {
  return body.data ?? body;
}

async function responseBody(response: Awaited<ReturnType<APIRequestContext['post']>>): Promise<RecordResponse> {
  const body = (await response.json()) as RecordResponse;
  return body;
}

/** Create a record through the same browser-session API used by the portal. */
export async function createRecord(
  page: Page,
  csrfToken: string,
  resources: ResourceLedger,
  recordType: string,
  metadata: Record<string, unknown>
): Promise<OwnedRecord> {
  const response = await page
    .context()
    .request.post(`/default/rdmp/api/records/metadata/${encodeURIComponent(recordType)}`, {
      data: metadata,
      headers: { 'X-CSRF-Token': csrfToken },
    });
  const data = responseData(await responseBody(response));
  const oid = data?.oid;
  if (oid) trackRecord(page.context().request, csrfToken, resources, oid);
  if (response.status() !== 201) throw new Error(`Could not create ${recordType} record (${response.status()}).`);
  const etag = response.headers()['etag'];
  if (!oid || !etag) throw new Error(`Create ${recordType} did not return an OID and ETag.`);

  return { oid, etag, metadata };
}

/** Register API- or browser-created records as soon as the server issues the ID. */
export function trackRecord(request: APIRequestContext, csrfToken: string, resources: ResourceLedger, oid: string): void {
  resources.track({
    kind: 'record',
    id: oid,
    cleanup: async () => {
      const active = await request.get(`/default/rdmp/api/records/metadata/${oid}`);
      if (active.ok()) {
        const etag = active.headers()['etag'];
        if (!etag) throw new Error(`Record ${oid} cleanup read did not include an ETag.`);
        const deleted = await request.delete(`/default/rdmp/api/records/metadata/${oid}`, {
          headers: { 'If-Match': etag, 'X-CSRF-Token': csrfToken },
        });
        if (!deleted.ok()) throw new Error(`Could not delete ${oid} (${deleted.status()}).`);
      } else if (active.status() !== 404) {
        throw new Error(`Could not read ${oid} for cleanup (${active.status()}).`);
      }
      const tombstone = await request.get(`/default/rdmp/record/delete/${oid}`);
      if (tombstone.status() === 404) return;
      if (!tombstone.ok()) throw new Error(`Could not read deleted record ${oid} (${tombstone.status()}).`);
      const etag = tombstone.headers()['etag'];
      if (!etag) throw new Error(`Deleted record ${oid} did not issue a purge ETag.`);
      const purged = await request.delete(`/default/rdmp/record/destroy/${oid}`, {
        headers: { 'If-Match': etag, 'X-CSRF-Token': csrfToken },
      });
      if (!purged.ok()) throw new Error(`Could not purge ${oid} (${purged.status()}).`);
    },
  });
}

export async function readRecord(api: PortalApi, oid: string): Promise<{ body: Record<string, unknown>; etag: string }> {
  const response = await api.get(`/default/rdmp/api/records/metadata/${encodeURIComponent(oid)}`);
  if (!response.ok()) throw new Error(`Could not read record ${oid} (${response.status()}).`);
  const etag = response.headers()['etag'];
  if (!etag) throw new Error(`Record ${oid} response did not include an ETag.`);
  return { body: await response.json() as Record<string, unknown>, etag };
}

export async function updateRecord(
  api: PortalApi,
  oid: string,
  etag: string,
  metadata: Record<string, unknown>
): Promise<{ body: RecordResponse; etag: string }> {
  const response = await api.mutate('put', `/default/rdmp/api/records/metadata/${encodeURIComponent(oid)}`, metadata, {
    'If-Match': etag,
  });
  if (!response.ok()) throw new Error(`Could not update record ${oid} (${response.status()}).`);
  const nextEtag = response.headers()['etag'];
  if (!nextEtag) throw new Error(`Record ${oid} update did not include an ETag.`);
  return { body: await responseBody(response), etag: nextEtag };
}
