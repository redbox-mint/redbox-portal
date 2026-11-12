import { create as attachment } from 'content-disposition';
import _ from 'lodash';
import type { ILogger, ReusableFormDefinitions } from '@researchdatabox/sails-ng-common';
import type { StorageService } from '../../StorageService';
import type { RecordAuditReader } from '../../queries/RecordAuditReader';
import { RecordLists } from '../../records/RecordLists';
import { DeletedRecordReader } from '../../records/DeletedRecordReader';
import { filterRelationshipGraph, relationshipOptions } from '../../records/relationships';
import { FormProjection } from '../../forms/FormProjection';
import type { Forms } from '../../forms/Forms';
import type { ContextVariables } from '../../forms/ContextVariables';
import type { RecordTypes } from '../../recordTypes';
import type { SolrReads } from '../../queries/SolrReads';
import { hasViewAccess, hasEditAccess } from '../../records/access';
import { BrandingModel } from '../../model/storage/BrandingModel';
import type { RecordModel } from '../../model/storage/RecordModel';
import { ListAPIResponse } from '../../model/ListAPIResponse';
import { recordRepresentationConcurrency } from '../../RecordHttpConcurrency';
import { recordSchemaImmutableUrl, recordSchemaDescribedByLink } from '../../api-routes/record-schema-response';
import { normalizeSearchQuery } from '../../api-routes/groups/search-query';
import { userFromActor } from '../actors';
import { safeApiVersion as apiVersion, apiNoCacheHeaders } from '../apiResponses';
import {
  jsonResult,
  referenceErrors,
  referenceValue as singleHttpResult,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';
import type { ValidatedApiRouteRequest } from '../../api-routes/validation';
import type { RecordSchemaReadInput } from './recordSchemaReads';
export interface RecordReadInput extends RecordSchemaReadInput {
  readonly storage: Pick<
    StorageService,
    | 'getMeta'
    | 'getRecords'
    | 'getDeletedRecords'
    | 'getDeletedRecordMeta'
    | 'getTombstone'
    | 'getRelatedRecords'
    | 'exportAllPlans'
  >;
  readonly audit: Pick<RecordAuditReader, 'getRecordAudit' | 'getResolvedPermissionsSummary'>;
  readonly forms: Pick<Forms, 'getFormByName' | 'getFormByStartingWorkflowStep' | 'buildClientFormConfig'>;
  readonly contextVariables: Pick<ContextVariables, 'evaluateContextVariables'>;
  readonly reusableFormDefinitions?: ReusableFormDefinitions;
  readonly recordTypes: Pick<RecordTypes, 'get'>;
  readonly search: Pick<SolrReads, 'searchFuzzy'>;
  readonly returnFields: string[];
  /** API record-list limit, independent of browser list/search pagination. */
  readonly maxRows: number;
  /** Browser record-list and fuzzy search bound; defaults to maxRows for existing callers. */
  readonly maxSearchRows?: number;
  readonly log: ILogger;
  translate(key: string, brand: string): string;
}
class RecordReadError extends Error {
  public constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
function natural(value: unknown, fallback: number, minimum = 0): number {
  if (value === undefined || value === '') return fallback;
  if (
    (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < minimum
  )
    throw new RecordReadError(400, 'Invalid pagination parameter.');
  return Number(value);
}

export function recordReadFailure(input: RecordReadInput, request: ReferenceRequest, error: unknown): ReferenceResult {
  const status = error instanceof RecordReadError ? error.status : 500;
  if (status === 500) input.log.error('Record read failed');
  return referenceErrors(request, status, [
    { detail: error instanceof RecordReadError ? error.message : 'Record read failed.' },
  ]);
}
function prepare(input: RecordReadInput, request: ReferenceRequest, valid: ValidatedApiRouteRequest, browser: boolean) {
  const query = valid.query;
  const projection = new FormProjection(input.log);
  const lists = new RecordLists({
    records: {
      getRecords: input.storage.getRecords.bind(input.storage),
      getDeletedRecords: input.storage.getDeletedRecords.bind(input.storage),
      hasEditAccess,
    },
    log: input.log,
  });
  const deleted = new DeletedRecordReader(input.storage);
  const scalar = (name: string, fallback = '') => {
    const value = request.params[name] ?? query[name] ?? fallback;
    if (typeof value !== 'string' || [...value].some(c => c.charCodeAt(0) < 32))
      throw new RecordReadError(400, 'Invalid parameter: ' + name);
    return value;
  };
  const { brand: snapshot, actor, portal } = request.context;
  if (!actor) {
    throw new RecordReadError(401, 'Authentication required');
  }
  const brand = Object.assign(new BrandingModel(), snapshot);
  const user = userFromActor(actor);
  const roles = user.roles.map(role => ({ ...role, branding: role.branding.id }));
  const view = async (record: Record<string, unknown>) => hasViewAccess(brand, user, user.roles, record);
  const load = async (oid: string, isDeleted = false) => {
    const record = isDeleted ? await deleted.getDeletedRecordMeta(oid, brand) : await input.storage.getMeta(oid);
    if (!record || _.isEmpty(record) || record.metaMetadata?.brandId !== brand.id)
      throw new RecordReadError(404, 'Record not found');
    if (!(await view(record as unknown as Record<string, unknown>))) throw new RecordReadError(403, 'Access Denied');
    return record;
  };
  const send = (data: unknown, meta: Record<string, unknown> = {}, headers: Readonly<Record<string, string>> = {}) => {
    return jsonResult(apiVersion(request) === '2.0' ? { data, meta } : data, 200, { ...apiNoCacheHeaders, ...headers });
  };
  const clientMetadata = async (record: RecordModel) => {
    const name = String(record.metaMetadata?.form ?? '');
    if (!name) return record.metadata;
    const edit = hasEditAccess(brand, user, roles, record as unknown as Record<string, unknown>);
    const mode = edit ? 'edit' : 'view';
    const form = await singleHttpResult(input.forms.getFormByName(name, edit, brand.id));
    if (!form?.configuration) return record.metadata;
    const client = await input.forms.buildClientFormConfig(
      form.configuration,
      mode,
      user.roles.map(r => r.name),
      record.metadata,
      input.reusableFormDefinitions,
      brand.name,
      input.contextVariables.evaluateContextVariables(
        {
          user,
          session: request.session,
          headers: request.headers,
          param: name => request.params[name] ?? request.query[name],
          get: name => request.headers?.[name.toLowerCase()],
        },
        record
      ),
      { brand, user }
    );
    return projection.projectMetadataClientFormConfig(
      record.metadata as Record<string, unknown>,
      client,
      mode,
      input.reusableFormDefinitions
    );
  };

  return { projection, lists, query, scalar, brand, user, roles, portal, view, load, send, clientMetadata };
}

async function list(
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browser: boolean,
  kind: 'api' | 'apiDeleted' | 'browser' | 'browserDeleted'
): Promise<ReferenceResult> {
  const { lists, query, scalar, brand, user, roles, send } = prepare(input, request, valid, browser);

  const start = natural(query.start, 0);
  const rows = natural(query.rows, 10, 1);
  const maxListRows = browser ? (input.maxSearchRows ?? input.maxRows) : input.maxRows;
  if (rows > maxListRows)
    throw new RecordReadError(
      400,
      'You have reached the maximum of request available; Max rows per request ' + maxListRows
    );
  const csv = (name: string) => (scalar(name) ? scalar(name).split(',') : undefined);
  const fields = csv('filterFields');
  if (fields?.some(field => !/^[_A-Za-z]\w*(?:\.[_A-Za-z]\w*)*$/.test(field)))
    throw new RecordReadError(400, 'Invalid filter field.');
  const mode = scalar('filterMode') || undefined;
  if (mode && !['regex', 'equal'].includes(mode)) throw new RecordReadError(400, 'Invalid filter mode.');
  const args = [
    scalar('state') || undefined,
    scalar('recordType') || undefined,
    start,
    rows,
    user,
    roles,
    brand,
    query.editOnly === true || query.editOnly === 'true',
    scalar('packageType') || undefined,
    scalar('sort') || undefined,
    fields,
    scalar('filter') || undefined,
  ] as const;
  const result =
    kind === 'api'
      ? await lists.api(...args)
      : kind === 'apiDeleted'
        ? await lists.apiDeleted(...args)
        : kind === 'browser'
          ? await lists.browser(...args, mode, scalar('secondarySort') || undefined)
          : await lists.browserDeleted(...args, mode);
  return send(result);
}
export const listRecords = (input: RecordReadInput, request: ReferenceRequest, valid: ValidatedApiRouteRequest) =>
  list(input, request, valid, false, 'api');
export const listDeletedRecords = (
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
) => list(input, request, valid, false, 'apiDeleted');
export const getRecordList = (input: RecordReadInput, request: ReferenceRequest, valid: ValidatedApiRouteRequest) =>
  list(input, request, valid, true, 'browser');
export const getDeletedRecordList = (
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest
) => list(input, request, valid, true, 'browserDeleted');

export async function getMetaDefault(
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browser = false
): Promise<ReferenceResult> {
  const { projection, scalar, brand, view, send } = prepare(input, request, valid, browser);

  const edit = scalar('edit') === 'true';
  const type = scalar('name');
  const form = await singleHttpResult(input.forms.getFormByStartingWorkflowStep(brand, type, edit));
  if (!form?.configuration) throw new RecordReadError(500, 'Form configuration not found for record type: ' + type);
  return send(
    await projection.buildDataModelDefaultForFormConfig(
      form.configuration,
      edit ? 'edit' : 'view',
      input.reusableFormDefinitions
    ),
    { formName: form.name, recordType: type, editMode: edit }
  );
}

export async function search(
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browser = false
): Promise<ReferenceResult> {
  const { query, scalar, brand, user, roles, send } = prepare(input, request, valid, browser);

  const type = scalar('type');
  const recordType = await singleHttpResult(input.recordTypes.get(brand, type));
  if (!recordType) throw new RecordReadError(400, 'Record Type provided is not valid');
  const normalized = normalizeSearchQuery(query);
  const entries = (key: string) =>
    Object.entries(normalized[key] as Record<string, unknown>).map(([name, value]) => {
      if (
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
        (value != null && typeof value !== 'string' && typeof value !== 'number')
      )
        throw new RecordReadError(400, 'Invalid search field');
      return { name, value: value as string | number | null };
    });
  const rows = natural(query.rows, 10, 1);
  const page = natural(query.page, 1, 1);
  if (rows > (input.maxSearchRows ?? input.maxRows)) throw new RecordReadError(400, 'Invalid pagination parameter.');
  const result = await input.search.searchFuzzy(
    recordType.searchCore ?? scalar('core', 'default'),
    type,
    scalar('workflow'),
    scalar('searchStr'),
    entries('exactNames'),
    entries('facetNames'),
    brand,
    user,
    user.roles,
    input.returnFields,
    (page - 1) * rows,
    rows
  );
  return send({ ...result, page });
}

async function representation(
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browser: boolean,
  kind: 'getRecordAudit' | 'getPermissions' | 'getObjectMeta' | 'getMeta' | 'getRelatedRecords' | 'getDeletedRecord'
): Promise<ReferenceResult> {
  const { query, scalar, brand, user, portal, view, load, send, clientMetadata } = prepare(
    input,
    request,
    valid,
    browser
  );

  const oid = scalar('oid');
  const record = await load(oid, kind === 'getDeletedRecord');
  const representation = recordRepresentationConcurrency(record);
  let data: unknown;
  let headers = { ...representation.headers };
  const meta: Record<string, unknown> = { oid, ...representation.metadata };
  if (kind === 'getRecordAudit') {
    const dates: Record<string, Date | null> = {};
    for (const key of ['dateFrom', 'dateTo']) {
      const text = scalar(key);
      if (text && Number.isNaN(Date.parse(text))) throw new RecordReadError(400, 'Invalid ' + key + ' parameter.');
      dates[key] = text ? new Date(text) : null;
    }
    if (dates.dateFrom && dates.dateTo && dates.dateFrom > dates.dateTo)
      throw new RecordReadError(400, 'dateFrom must precede dateTo.');
    const audit = await input.audit.getRecordAudit({ oid, dateFrom: dates.dateFrom, dateTo: dates.dateTo });
    const list = new ListAPIResponse();
    list.summary.numFound = audit.length;
    list.summary.page = 1;
    list.records = audit;
    return send(list);
  }
  if (kind === 'getPermissions')
    data = browser ? await input.audit.getResolvedPermissionsSummary(oid) : record.authorization;
  else if (kind === 'getObjectMeta') data = record.metaMetadata;
  else if (kind === 'getMeta' || kind === 'getRelatedRecords') {
    if (kind === 'getMeta') data = browser ? await clientMetadata(record) : record.metadata;
    const include =
      kind === 'getRelatedRecords' ||
      scalar('include').split(',').includes('relationships') ||
      scalar('includeRelationships') === 'true';
    if (include) {
      for (const key of ['relationshipDepth', 'relationshipIds', 'recordTypes', 'fields'])
        if (query[key] !== undefined) scalar(key);
      if (query.relationshipDepth !== undefined) natural(query.relationshipDepth, 1);
      const graph = await input.storage.getRelatedRecords(oid, brand, relationshipOptions(query));
      const filtered = await filterRelationshipGraph(brand, user, graph, async (_brand, _user, record) => view(record));
      if (kind === 'getRelatedRecords')
        data = { ...filtered, processedRelationships: Object.keys(filtered.relatedObjects ?? {}) };
      else if (browser) {
        meta.relationships = filtered;
        if (apiVersion(request) === '1.0') data = { ...(data as Record<string, unknown>), relationships: filtered };
      } else data = { metadata: data, relationships: filtered };
    }
    if (!browser && kind === 'getMeta') {
      try {
        const result = await input.schemas.resolveUpdate({
          brand: brand.id,
          branding: brand.name,
          portal,
          oid,
          caller: { brand, user },
        });
        if (result.kind === 'resolved' || result.kind === 'partial')
          headers = {
            ...headers,
            Link: recordSchemaDescribedByLink(
              recordSchemaImmutableUrl(brand.name, portal, result.digest, input.rootContext)
            ),
          };
      } catch {
        input.log.warn('Record schema metadata-read discovery could not be resolved.');
      }
    }
  } else if (kind === 'getDeletedRecord') {
    data = browser ? await clientMetadata(record) : record.metadata;
    meta.lifecycleState = record.lifecycleState;
    meta.lifecycle = record.lifecycle;
  } else throw new Error('Unbound record read: ' + kind);
  return send(data, meta, headers);
}
export const getRecordAudit = (
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browser = false
) => representation(input, request, valid, browser, 'getRecordAudit');
export const getPermissions = (
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browser = false
) => representation(input, request, valid, browser, 'getPermissions');
export const getObjectMeta = (
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browser = false
) => representation(input, request, valid, browser, 'getObjectMeta');
export const getMeta = (
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browser = false
) => representation(input, request, valid, browser, 'getMeta');
export const getRelatedRecords = (
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browser = false
) => representation(input, request, valid, browser, 'getRelatedRecords');
export const getDeletedRecord = (
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browser = false
) => representation(input, request, valid, browser, 'getDeletedRecord');

export async function downloadRecs(
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browser = false
): Promise<ReferenceResult> {
  const { scalar, brand, user, roles } = prepare(input, request, valid, browser);

  const format = scalar('format');
  if (format !== 'csv' && format !== 'json') throw new RecordReadError(500, 'Unsupported export format');
  for (const key of ['before', 'after'])
    if (scalar(key) && Number.isNaN(Date.parse(scalar(key))))
      throw new RecordReadError(400, 'Invalid ' + key + ' parameter.');
  const disposition = attachment(
    input.translate(scalar('recType') + '-title', brand.name) + ' - Exported Records.' + format
  );
  try {
    return {
      kind: 'stream',
      status: 200,
      headers: {
        'Content-Disposition': disposition,
        'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      },
      body: input.storage.exportAllPlans(
        user.username,
        roles,
        brand,
        format,
        scalar('before') || null,
        scalar('after') || null,
        scalar('recType')
      ),
    };
  } catch (error) {
    // Express publishes the attachment header before acquiring the source.
    const failure = recordReadFailure(input, request, error);
    return { ...failure, headers: { 'Content-Disposition': disposition, ...failure.headers } };
  }
}

export async function listWorkspaces(
  input: RecordReadInput,
  request: ReferenceRequest,
  valid: ValidatedApiRouteRequest,
  browser = false
): Promise<ReferenceResult> {
  const { brand, portal } = prepare(input, request, valid, browser);
  return {
    kind: 'redirect',
    status: 302,
    headers: {
      Location: `${input.rootContext ?? ''}/${brand.name}/${portal}/dashboard/workspace?packageType=workspace&titleLabel=workspaces`,
    },
    body: undefined,
  };
}
