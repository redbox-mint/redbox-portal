import type { RecordTypes } from '../../recordTypes';
import type { RecordTypeModel } from '../../model/storage/RecordTypeModel';
import type { ValidatedApiRouteRequest } from '../../api-routes/validation';
import { recordSchemaCreateResolverUrl } from '../../api-routes/record-schema-response';
import { isRecordSchemaEnabled } from '../../config/recordSchema.config';
import { ListAPIResponse } from '../../model/ListAPIResponse';
import { apiNoCacheHeaders } from '../apiResponses';
import { referenceValue, referenceData, jsonResult, type ReferenceRequest } from './reference';

export interface RecordTypeReadInput {
  readonly recordTypes: Pick<RecordTypes, 'get' | 'getAll'>;
  readonly recordSchema?: unknown;
  readonly rootContext?: string;
}
function discoverable(input: RecordTypeReadInput, req: ReferenceRequest, type: RecordTypeModel, fallback = '') {
  if (!isRecordSchemaEnabled(input.recordSchema)) return type;
  const { brand, portal } = req.context;
  if (typeof brand.name !== 'string') throw new TypeError('Resolved brand must have a public name.');
  const stored: unknown = Reflect.get(type, 'name');
  const name = typeof stored === 'string' && stored.trim() ? stored.trim() : fallback.trim();
  return {
    ...type,
    recordSchemaCreateResolver: recordSchemaCreateResolverUrl(brand.name, portal, name, input.rootContext),
  };
}
export async function getRecordType(
  input: RecordTypeReadInput,
  req: ReferenceRequest,
  valid: ValidatedApiRouteRequest
) {
  const name = valid.query.name;
  if (typeof name !== 'string') throw new TypeError('Record-type contract must supply a validated name.');
  const type = await referenceValue(input.recordTypes.get(req.context.brand, name));
  // This legacy failure is always a v2 envelope, even for v1 callers.
  if (!type) return jsonResult({ errors: [{ detail: 'Check server logs.' }], meta: {} }, 500, apiNoCacheHeaders);
  return referenceData(req, discoverable(input, req, type, name));
}
export async function listRecordTypes(input: RecordTypeReadInput, req: ReferenceRequest) {
  const types = await referenceValue(input.recordTypes.getAll(req.context.brand));
  const result = new ListAPIResponse();
  result.summary.numFound = types.length;
  result.records = types.map(type => discoverable(input, req, type));
  return referenceData(req, result);
}
