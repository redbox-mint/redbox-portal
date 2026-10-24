import type { Router } from 'express';
import { pipeline } from 'node:stream/promises';
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
import { UserModel } from '../../model/storage/UserModel';
import type { RecordModel } from '../../model/storage/RecordModel';
import { ListAPIResponse } from '../../model/ListAPIResponse';
import { recordRepresentationConcurrency } from '../../RecordHttpConcurrency';
import { recordSchemaImmutableUrl, recordSchemaDescribedByLink } from '../../api-routes/record-schema-response';
import { recordApiRoutes } from '../../api-routes/groups/records';
import { exportApiRoutes } from '../../api-routes/groups/export';
import { normalizeSearchQuery } from '../../api-routes/groups/search-query';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { httpAction, singleHttpResult } from './middleware';
import { bindHttpPolicies, requestContext, resolveEffectivePolicies } from './policies';
import { sendApiErrors, apiVersion, apiNoCacheHeaders, validationApiVersion } from './responses';
import {
  mountRecordSchemaReadRoutes,
  recordSchemaReadRoutes,
  type RecordSchemaReadHttpInput,
} from './recordSchemaReads';
const apiReads = recordApiRoutes.filter(route =>
  [
    'listRecords',
    'listDeletedRecords',
    'getDeletedRecord',
    'getMeta',
    'getObjectMeta',
    'getPermissions',
    'getRecordAudit',
  ].includes(route.action)
);
// Literal lists precede object identifiers, as in the accepted route inventory.
apiReads.sort((a, b) => Number(!a.path.endsWith('/list')) - Number(!b.path.endsWith('/list')));
const browserReads = [
  ['/listRecords', 'getRecordList'],
  ['/listDeletedRecords', 'getDeletedRecordList'],
  ['/record/metadata/:oid', 'getMeta'],
  ['/record/default/:name', 'getMetaDefault'],
  ['/record/delete/:oid', 'getDeletedRecord'],
  ['/record/:oid/permissions', 'getPermissions'],
  ['/record/:oid/relatedRecords', 'getRelatedRecords'],
  ['/record/search/:type', 'search'],
].map(([path, action]) => ({
  method: 'get' as const,
  path: '/:branding/:portal' + path,
  controller: 'RecordController',
  action,
}));
const exportReads = [
  ...exportApiRoutes,
  ...exportApiRoutes.map(r => ({ ...r, path: r.path.replace('/api/', '/'), controller: 'ExportController' })),
];
export const recordReadRoutes = [
  ...apiReads,
  ...browserReads,
  ...exportReads,
  ...recordSchemaReadRoutes,
  {
    method: 'all' as const,
    path: '/:branding/:portal/workspaces/list',
    controller: 'RecordController',
    action: 'listWorkspaces',
  },
];
export interface RecordReadHttpInput extends RecordSchemaReadHttpInput {
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
  readonly maxRows: number;
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
/** Owned read-only HTTP group; storage retains traversal, filtering and export-stream ownership. */
export function mountRecordReadRoutes(router: Router, input: RecordReadHttpInput): void {
  if (!Number.isSafeInteger(input.maxRows) || input.maxRows < 1)
    throw new TypeError('Record reads require an explicit maximum row count.');
  mountRecordSchemaReadRoutes(router, input);
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
  for (const route of recordReadRoutes.filter(r => !r.path.includes('/schemas/'))) {
    router[route.method](
      route.path,
      ...bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
      httpAction(async (req, res) => {
        try {
          let query: Record<string, unknown> = req.query;
          if ('request' in route) {
            const validated = validateApiRouteRequest(req, route as ApiRouteDefinition);
            if (!validated.valid) {
              sendApiErrors(
                req,
                res,
                400,
                validated.issues.map(i => ({ title: i.path, detail: i.message })),
                validationApiVersion(req)
              );
              return;
            }
            query = validated.query;
          }
          const scalar = (name: string, fallback = '') => {
            const value = req.params[name] ?? query[name] ?? fallback;
            if (typeof value !== 'string' || [...value].some(c => c.charCodeAt(0) < 32))
              throw new RecordReadError(400, 'Invalid parameter: ' + name);
            return value;
          };
          const { brand: snapshot, actor, portal } = requestContext(req);
          if (!actor) {
            sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
            return;
          }
          const brand = Object.assign(new BrandingModel(), snapshot);
          const user = Object.assign(
            new UserModel(),
            {
              id: actor.id,
              username: actor.username,
              type: actor.type ?? '',
              name: actor.name ?? '',
              email: actor.email ?? '',
            },
            {
              roles: actor.roles.map(role => ({
                id: role.id,
                name: role.name ?? '',
                users: [],
                branding: Object.assign(new BrandingModel(), { id: role.brandId }),
              })),
            }
          );
          const roles = user.roles.map(role => ({ ...role, branding: role.branding.id }));
          const browser = route.controller === 'RecordController';
          const view = async (record: Record<string, unknown>) => hasViewAccess(brand, user, user.roles, record);
          const load = async (oid: string, isDeleted = false) => {
            const record = isDeleted
              ? await deleted.getDeletedRecordMeta(oid, brand)
              : await input.storage.getMeta(oid);
            if (!record || _.isEmpty(record) || record.metaMetadata?.brandId !== brand.id)
              throw new RecordReadError(404, 'Record not found');
            if (!(await view(record as unknown as Record<string, unknown>)))
              throw new RecordReadError(403, 'Access Denied');
            return record;
          };
          const send = (
            data: unknown,
            meta: Record<string, unknown> = {},
            headers: Readonly<Record<string, string>> = {}
          ) => {
            res.set({ ...apiNoCacheHeaders, ...headers }).json(apiVersion(req) === '2.0' ? { data, meta } : data);
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
                  session: req.session,
                  headers: req.headers,
                  param: name => req.params[name] ?? req.query[name],
                  get: name => req.get(name),
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
          switch (route.action) {
            case 'listWorkspaces':
              res.redirect(
                `${input.rootContext ?? ''}/${brand.name}/${portal}/dashboard/workspace?packageType=workspace&titleLabel=workspaces`
              );
              return;
            case 'listRecords':
            case 'listDeletedRecords':
            case 'getRecordList':
            case 'getDeletedRecordList': {
              const start = natural(query.start, 0);
              const rows = natural(query.rows, 10, 1);
              if (rows > input.maxRows)
                throw new RecordReadError(
                  400,
                  'You have reached the maximum of request available; Max rows per request ' + input.maxRows
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
                route.action === 'listRecords'
                  ? await lists.api(...args)
                  : route.action === 'listDeletedRecords'
                    ? await lists.apiDeleted(...args)
                    : route.action === 'getRecordList'
                      ? await lists.browser(...args, mode, scalar('secondarySort') || undefined)
                      : await lists.browserDeleted(...args, mode);
              send(result);
              return;
            }
            case 'getMetaDefault': {
              const edit = scalar('edit') === 'true';
              const type = scalar('name');
              const form = await singleHttpResult(input.forms.getFormByStartingWorkflowStep(brand, type, edit));
              if (!form?.configuration)
                throw new RecordReadError(500, 'Form configuration not found for record type: ' + type);
              send(
                await projection.buildDataModelDefaultForFormConfig(
                  form.configuration,
                  edit ? 'edit' : 'view',
                  input.reusableFormDefinitions
                ),
                { formName: form.name, recordType: type, editMode: edit }
              );
              return;
            }
            case 'search': {
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
              if (rows > input.maxRows) throw new RecordReadError(400, 'Invalid pagination parameter.');
              send(
                await input.search.searchFuzzy(
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
                  (natural(query.page, 1, 1) - 1) * rows,
                  rows
                )
              );
              return;
            }
            case 'downloadRecs': {
              const format = scalar('format');
              if (format !== 'csv' && format !== 'json') throw new RecordReadError(500, 'Unsupported export format');
              for (const key of ['before', 'after'])
                if (scalar(key) && Number.isNaN(Date.parse(scalar(key))))
                  throw new RecordReadError(400, 'Invalid ' + key + ' parameter.');
              res
                .attachment(input.translate(scalar('recType') + '-title', brand.name) + ' - Exported Records.' + format)
                .type(format === 'csv' ? 'text/csv' : 'application/json');
              await pipeline(
                input.storage.exportAllPlans(
                  user.username,
                  roles,
                  brand,
                  format,
                  scalar('before') || null,
                  scalar('after') || null,
                  scalar('recType')
                ),
                res
              );
              return;
            }
            default: {
              const oid = scalar('oid');
              const record = await load(oid, route.action === 'getDeletedRecord');
              const representation = recordRepresentationConcurrency(record);
              let data: unknown;
              let headers = { ...representation.headers };
              const meta: Record<string, unknown> = { oid, ...representation.metadata };
              if (route.action === 'getRecordAudit') {
                const dates: Record<string, Date | null> = {};
                for (const key of ['dateFrom', 'dateTo']) {
                  const text = scalar(key);
                  if (text && Number.isNaN(Date.parse(text)))
                    throw new RecordReadError(400, 'Invalid ' + key + ' parameter.');
                  dates[key] = text ? new Date(text) : null;
                }
                if (dates.dateFrom && dates.dateTo && dates.dateFrom > dates.dateTo)
                  throw new RecordReadError(400, 'dateFrom must precede dateTo.');
                const audit = await input.audit.getRecordAudit({ oid, dateFrom: dates.dateFrom, dateTo: dates.dateTo });
                const list = new ListAPIResponse();
                list.summary.numFound = audit.length;
                list.summary.page = 1;
                list.records = audit;
                send(list);
                return;
              }
              if (route.action === 'getPermissions')
                data = browser ? await input.audit.getResolvedPermissionsSummary(oid) : record.authorization;
              else if (route.action === 'getObjectMeta') data = record.metaMetadata;
              else if (route.action === 'getMeta' || route.action === 'getRelatedRecords') {
                if (route.action === 'getMeta') data = browser ? await clientMetadata(record) : record.metadata;
                const include =
                  route.action === 'getRelatedRecords' ||
                  scalar('include').split(',').includes('relationships') ||
                  scalar('includeRelationships') === 'true';
                if (include) {
                  for (const key of ['relationshipDepth', 'relationshipIds', 'recordTypes', 'fields'])
                    if (query[key] !== undefined) scalar(key);
                  if (query.relationshipDepth !== undefined) natural(query.relationshipDepth, 1);
                  const graph = await input.storage.getRelatedRecords(oid, brand, relationshipOptions(query));
                  const filtered = await filterRelationshipGraph(brand, user, graph, async (_brand, _user, record) =>
                    view(record)
                  );
                  data =
                    route.action === 'getRelatedRecords'
                      ? { ...filtered, processedRelationships: Object.keys(filtered.relatedObjects ?? {}) }
                      : { metadata: data, relationships: filtered };
                }
                if (!browser && route.action === 'getMeta') {
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
              } else if (route.action === 'getDeletedRecord') {
                data = browser ? await clientMetadata(record) : record.metadata;
                meta.lifecycleState = record.lifecycleState;
                meta.lifecycle = record.lifecycle;
              } else throw new Error('Unbound record read: ' + route.action);
              send(data, meta, headers);
            }
          }
        } catch (error) {
          if (res.headersSent || res.destroyed) {
            if (!res.destroyed) res.destroy();
            return;
          }
          const status = error instanceof RecordReadError ? error.status : 500;
          if (status === 500) input.log.error(error);
          sendApiErrors(req, res, status, [
            { detail: error instanceof RecordReadError ? error.message : 'Record read failed.' },
          ]);
        }
      })
    );
  }
}
