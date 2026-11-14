import { basename, extname } from 'node:path';
import { validateHeaderValue } from 'node:http';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { RecordsService } from '../../RecordsService';
import type { DatastreamService } from '../../DatastreamService';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { referenceData, referenceErrors, type ReferenceRequest, type ReferenceResult } from './reference';

const disposition: { create(name: string): string } = require('content-disposition');
const mime: { contentType(extension: string): string | false } = require('mime-types');
export interface DatastreamReadInput {
  readonly records: Pick<RecordsService, 'getMeta' | 'getAttachments' | 'hasViewAccess'>;
  readonly datastream: Pick<DatastreamService, 'getDatastream'>;
  readonly log: ILogger;
}
const json = (result: ReferenceResult): JsonResult => ({ ...result, kind: 'json', json: JSON.stringify(result.body) });
const readError = (request: ReferenceRequest, status: number, detail: string) =>
  json(referenceErrors(request, status, [{ detail }]));
type JsonResult = Omit<ReferenceResult, 'kind'> & { readonly kind: 'json'; readonly json: string };
export type DatastreamReadResult =
  | JsonResult
  | { readonly kind: 'missing-attachment' }
  | {
      readonly kind: 'stream';
      readonly status: 200;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: NodeJS.ReadableStream;
    }
  | {
      readonly kind: 'bytes';
      readonly status: 200;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: Buffer | string;
    };

/** Preserve the retained actor/record/identifier guards before declared host
 * validation, including for replacement controllers. No request input is cached. */
export async function datastreamReadPrelude(input: DatastreamReadInput, request: ReferenceRequest, action: string) {
  try {
    const { actor, brand } = request.context,
      oid = request.params.oid;
    if (typeof oid !== 'string' || !oid.trim()) return readError(request, 400, 'Record oid is required.');
    if (!actor) return readError(request, 401, 'Authentication required');
    const record = await input.records.getMeta(oid);
    if (!record || record.metaMetadata?.brandId !== brand.id) return readError(request, 404, 'Record not found');
    const roles = actor.roles.map(role => ({ id: role.id, name: role.name, branding: { id: role.brandId } }));
    if (!input.records.hasViewAccess(Object.assign(new BrandingModel(), brand), { ...actor, roles }, roles, record))
      return readError(request, 403, 'Access Denied');
    const listing = ['getAttachments', 'listDatastreams'].includes(action);
    const id = request.params.datastreamId ?? request.params.attachId ?? request.query.datastreamId;
    if (
      !listing &&
      (typeof id !== 'string' ||
        !id.trim() ||
        (request.query.fileName != null && typeof request.query.fileName !== 'string'))
    )
      return readError(request, 400, 'Invalid datastream identifier or filename');
    return { kind: 'authorized' as const, actor, brand, oid, id };
  } catch {
    input.log.error('Datastream read failed');
    return readError(request, 500, 'Failed to load attachments');
  }
}

/** The retained domain guards and download metadata, shared by both transports.
 * The receiving transport takes sole ownership immediately on stream return. */
export async function executeDatastreamRead(
  input: DatastreamReadInput,
  request: ReferenceRequest,
  action: string,
  browser: boolean,
  brandedNotFound = false
): Promise<DatastreamReadResult> {
  const error = (status: number, detail: string) => readError(request, status, detail);
  try {
    const guarded = await datastreamReadPrelude(input, request, action);
    if (guarded.kind === 'json') return guarded;
    const { actor, brand, oid, id } = guarded;
    const attachments = await input.records.getAttachments(oid, undefined, { username: actor.username });
    if (action === 'getAttachments') return json(referenceData(request, attachments));
    if (action === 'listDatastreams')
      return json(
        referenceData(request, {
          summary: { numFound: attachments.length, page: 1, start: 0 },
          records: attachments,
        })
      );
    const missing = (): DatastreamReadResult =>
      browser && brandedNotFound && request.headers?.['x-source'] !== 'jsclient'
        ? { kind: 'missing-attachment' }
        : error(404, 'Attachment not found');
    const found = attachments.find(attachment => attachment.fileId === id);
    if (!found) return missing();
    const fileName =
      typeof request.query.fileName === 'string' && request.query.fileName
        ? request.query.fileName
        : String(browser && action === 'getDataStream' ? id : (found.name ?? id));
    // res.attachment() uses basename and derives Content-Type from its extension,
    // including the octet-stream fallback for names without an extension.
    // With an empty basename, res.set() still applies MIME charset expansion
    // to the existing attachment Content-Type before attachment() preserves it.
    const name = basename(fileName);
    const headers: Record<string, string> = {
      'Content-Type': name
        ? mime.contentType(extname(name)) || 'application/octet-stream'
        : action === 'doAttachment'
          ? String(mime.contentType(String(found.mimeType ?? 'application/octet-stream')))
          : 'application/octet-stream',
      'Content-Disposition': disposition.create(name),
    };
    if (found.size !== undefined && Number.isSafeInteger(Number(found.size)) && Number(found.size) >= 0)
      headers['Content-Length'] = String(found.size);
    // Complete fallible metadata preparation before borrowing a storage producer.
    for (const [key, value] of Object.entries(headers)) validateHeaderValue(key, value);
    let response: Awaited<ReturnType<DatastreamService['getDatastream']>>;
    try {
      response = await input.datastream.getDatastream(oid, id as string, {
        username: actor.username,
        actorId: actor.id,
        brandId: brand.id,
      });
    } catch (caught) {
      if (
        caught instanceof Error &&
        (caught.message === 'attachment-not-found' || Reflect.get(caught, 'code') === 'ENOENT')
      )
        return missing();
      throw caught;
    }
    return response.readstream
      ? { kind: 'stream', status: 200, headers, body: response.readstream }
      : { kind: 'bytes', status: 200, headers, body: response.body ?? '' };
  } catch {
    input.log.error('Datastream read failed');
    return error(500, 'Failed to load attachments');
  }
}
