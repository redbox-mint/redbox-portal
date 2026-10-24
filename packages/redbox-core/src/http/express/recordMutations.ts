import type { Router, RequestHandler } from 'express';
import _ from 'lodash';
import type { ILogger, ReusableFormDefinitions } from '@researchdatabox/sails-ng-common';
import type { RecordsService, RecordMetadataSubmission } from '../../RecordsService';
import type { RecordTypes } from '../../recordTypes/RecordTypes';
import type { Services as Workflow } from '../../workflows/WorkflowSteps';
import type { Forms } from '../../forms/Forms';
import type { ContextVariables } from '../../forms/ContextVariables';
import { FormProjection } from '../../forms/FormProjection';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { UserModel } from '../../model/storage/UserModel';
import type { RecordModel } from '../../model/storage/RecordModel';
import type { PoliciesConfig } from '../../config/policies.config';
import { recordApiRoutes } from '../../api-routes/groups/records';
import { RECORD_SCHEMA_WRITE_PRECONDITION_HEADER } from '../../api-routes/schemas/common';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { recordSchemaImmutableUrl, recordSchemaDescribedByLink } from '../../api-routes/record-schema-response';
import {
  parsePublicRecordConcurrencyRequest,
  recordSaveResultHeaders,
  recordRepresentationConcurrency,
} from '../../RecordHttpConcurrency';
import {
  createRecordSaveContext,
  readSaveRequestId,
  normalizeRecordValidationRequestFacts,
  parsePublicValidationOperation,
  recordSaveFailureStatus,
  isRecordConflictStatus,
  recordSaveDisplayErrors,
  recordSaveProblem,
  type RecordSaveResponse,
  type RecordSaveOperation,
} from '../../RecordSaveResponse';
import { httpAction, singleHttpResult } from './middleware';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import type { createHttpCsrf } from './csrf';
import { sendApiErrors, apiVersion, apiNoCacheHeaders, validationApiVersion } from './responses';

const actions = new Set([
  'create',
  'updateMeta',
  'updateObjectMeta',
  'deleteRecord',
  'restoreRecord',
  'destroyDeletedRecord',
  'transitionWorkflow',
  'addUserEdit',
  'removeUserEdit',
  'addUserView',
  'removeUserView',
  'addRoleEdit',
  'removeRoleEdit',
  'addRoleView',
  'removeRoleView',
]);
const browserRoutes = [
  ['post', '/recordmeta/:recordType', 'create'],
  ['put', '/recordmeta/:oid', 'update'],
  ['delete', '/record/delete/:oid', 'delete'],
  ['put', '/record/delete/:oid', 'restoreRecord'],
  ['delete', '/record/destroy/:oid', 'destroyDeletedRecord'],
  ['post', '/record/workflow/step/:targetStep/:oid', 'stepTo'],
] as const;
export const recordMutationRoutes = [
  ...recordApiRoutes.filter(route => actions.has(route.action)),
  ...browserRoutes.map(([method, path, action]) => ({
    method,
    path: '/:branding/:portal' + path,
    controller: 'RecordController',
    action,
  })),
];
export interface RecordMutationHttpInput {
  readonly records: Pick<
    RecordsService,
    | 'create'
    | 'updateMeta'
    | 'delete'
    | 'restoreRecord'
    | 'destroyDeletedRecord'
    | 'getMeta'
    | 'getDeletedRecordMeta'
    | 'hasEditAccess'
    | 'hasViewAccess'
  >;
  readonly recordTypes: Pick<RecordTypes, 'get'>;
  readonly workflows: Pick<Workflow.WorkflowSteps, 'get'>;
  readonly forms: Pick<Forms, 'getFormByName' | 'buildClientFormConfig'>;
  readonly contextVariables: Pick<ContextVariables, 'evaluateContextVariables'>;
  readonly reusableFormDefinitions?: ReusableFormDefinitions;
  readonly returnMetadataOnSave?: boolean;
  readonly schemaEnabled: boolean;
  readonly rootContext?: string;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'protect' | 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
  readonly log: ILogger;
}
class RecordMutationError extends Error {
  public constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RecordMutationError(400, 'Invalid record body');
  return value as Record<string, unknown>;
}
function scalar(value: unknown, fallback = ''): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > 4096 || [...value].some(c => c.charCodeAt(0) < 32))
    throw new RecordMutationError(400, 'Invalid record parameter');
  return value;
}
function legacySaveBody(result: RecordSaveResponse): Record<string, unknown> {
  return {
    success: result.success,
    oid: result.oid,
    message: result.message,
    data: result.data,
    metadata: result.metadata,
    details: result.details,
    totalItems: result.totalItems,
    items: result.items,
    ...(result.workspaceOid ? { workspaceOid: result.workspaceOid } : {}),
    ...(result.workspaceData !== undefined ? { workspaceData: result.workspaceData } : {}),
  };
}
/** Protected transport for the shared save pipeline; no storage write or hook dispatch lives here. */
export function mountRecordMutationRoutes(router: Router, input: RecordMutationHttpInput): void {
  const projection = new FormProjection(input.log);
  const bindings = recordMutationRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings) {
    const browser = route.controller === 'RecordController';
    const action =
      ({ update: 'updateMeta', delete: 'deleteRecord', stepTo: 'transitionWorkflow' } as Record<string, string>)[
        route.action
      ] ?? route.action;
    router[route.method](
      route.path,
      ...policies,
      browser ? input.csrf.protect : input.csrf.apiProtect,
      httpAction(async (req, res) => {
        try {
          const { brand: snapshot, actor, portal } = requestContext(req);
          if (!actor) throw new RecordMutationError(401, 'Authentication required');
          if (!actor.roles.some(role => role.brandId === snapshot.id))
            throw new RecordMutationError(403, 'Access Denied');
          const brand = Object.assign(new BrandingModel(), snapshot);
          const user = Object.assign(new UserModel(), {
            id: actor.id,
            username: actor.username,
            type: actor.type ?? '',
            name: actor.name ?? '',
            email: actor.email ?? '',
            roles: actor.roles.map(role => ({
              id: role.id,
              name: role.name ?? '',
              users: [],
              branding: Object.assign(new BrandingModel(), { id: role.brandId }),
            })),
          });
          let body = object(req.body ?? {});
          let query: Record<string, unknown> = req.query;
          if ('request' in route) {
            const valid = validateApiRouteRequest(req, route as ApiRouteDefinition);
            if (!valid.valid) {
              sendApiErrors(
                req,
                res,
                400,
                valid.issues.map(i => ({ title: i.path, detail: i.message })),
                validationApiVersion(req)
              );
              return;
            }
            if (valid.body !== undefined) body = object(valid.body);
            query = valid.query;
          }
          // Browser token is a transport field, never persisted as metadata.
          if (browser) body = Object.fromEntries(Object.entries(body).filter(([key]) => key !== '_csrf'));
          const oid = scalar(req.params.oid);
          const targetStep = scalar(
            req.params.targetStep ??
              query.targetStep ??
              (action === 'create' && !browser ? body.workflowStage : undefined)
          );
          const operation = parsePublicValidationOperation(query.operation);
          if (!operation.valid) throw new RecordMutationError(400, 'record-validation-operation-invalid');
          const permanent = query.permanent === 'true';
          const saveOperation: RecordSaveOperation =
            action === 'create'
              ? targetStep
                ? 'transition'
                : 'create'
              : action === 'transitionWorkflow' || targetStep
                ? 'transition'
                : action === 'deleteRecord'
                  ? permanent
                    ? 'purge'
                    : 'delete'
                  : action === 'restoreRecord'
                    ? 'restore'
                    : action === 'destroyDeletedRecord'
                      ? 'purge'
                      : 'update';
          const concurrency = parsePublicRecordConcurrencyRequest(req.headers, action === 'create' ? undefined : oid, {
            formBacked: browser && ['create', 'updateMeta', 'transitionWorkflow'].includes(action),
          });
          if (!concurrency.valid) {
            res
              .set(apiNoCacheHeaders)
              .status(400)
              .json(
                apiVersion(req) === '1.0'
                  ? { message: 'Invalid record concurrency request.' }
                  : { errors: [{ code: concurrency.code, source: { header: concurrency.header } }], meta: {} }
              );
            return;
          }
          const schemaIfMatch = req.headers[RECORD_SCHEMA_WRITE_PRECONDITION_HEADER.toLowerCase()];
          if (schemaIfMatch !== undefined && typeof schemaIfMatch !== 'string')
            throw new RecordMutationError(400, 'record-schema.invalid-request');
          const context = createRecordSaveContext({
            requestId: readSaveRequestId(req.headers),
            routeFamily: browser ? 'browser' : 'api',
            operation: saveOperation,
            portal,
            targetStep: targetStep || undefined,
            validationOperation: operation.value,
            recordSchemaIfMatch: schemaIfMatch,
            concurrency: concurrency.context,
            validationRequestParameters: normalizeRecordValidationRequestFacts(req.params, query),
          });
          const load = async (id: string, deleted = false): Promise<RecordModel | null> => {
            const record = deleted
              ? await input.records.getDeletedRecordMeta(id, brand)
              : await input.records.getMeta(id);
            return record && String(record.metaMetadata?.brandId ?? '') === brand.id ? record : null;
          };
          let current: RecordModel | null = null;
          const lifecycle = ['deleteRecord', 'restoreRecord', 'destroyDeletedRecord'].includes(action);
          const permission = /^(add|remove)(User|Role)(View|Edit)$/.test(action);
          let result: RecordSaveResponse;
          if (action === 'create') {
            const type = await singleHttpResult(input.recordTypes.get(brand, scalar(req.params.recordType)));
            if (!type) throw new RecordMutationError(400, 'Record Type provided is not valid');
            const raw = _.cloneDeep(browser ? body : body.metadata == null ? body : object(body.metadata));
            if (!browser && body.metadata == null && !input.schemaEnabled) raw.authorization = [];
            // Raw v5 metadata may contain an empty authorization field; only
            // an object ACL (or an explicit metadata envelope) supplies permissions.
            const legacyAuthorization =
              body.metadata == null && Array.isArray(body.authorization) && body.authorization.length === 0;
            const authorization =
              !browser && body.authorization != null && !legacyAuthorization
                ? object(body.authorization)
                : { edit: [user.username], view: [user.username] };
            result = await input.records.create(
              brand,
              { metadata: raw, authorization },
              type,
              { ...user },
              true,
              true,
              targetStep || undefined,
              context
            );
          } else {
            current = await load(oid, action === 'restoreRecord' || action === 'destroyDeletedRecord');
            if (!current)
              throw new RecordMutationError(
                !browser && action === 'updateMeta' ? 400 : 404,
                !browser && action === 'updateMeta'
                  ? `Failed to update meta, cannot find existing record with oid: ${oid}.`
                  : 'Record not found'
              );
            if (
              !input.records.hasEditAccess(
                brand,
                user,
                user.roles.map(role => ({ ...role })),
                current
              )
            )
              throw new RecordMutationError(403, 'Access Denied');
            const type = await singleHttpResult(input.recordTypes.get(brand, current.metaMetadata.type));
            if (!type) throw new RecordMutationError(400, 'Record Type provided is not valid');
            if (action === 'deleteRecord')
              result = await input.records.delete(oid, permanent, current, type, { ...user }, context);
            else if (action === 'restoreRecord')
              result = await input.records.restoreRecord(oid, { ...user }, brand, context);
            else if (action === 'destroyDeletedRecord')
              result = await input.records.destroyDeletedRecord(oid, { ...user }, brand, context);
            else {
              let submission: RecordMetadataSubmission | undefined;
              if (permission) {
                const field = /Edit$/.test(action) ? 'edit' : 'view';
                const roles = action.includes('Role');
                const change = (key: string, value: unknown) => {
                  if (value === undefined) return;
                  if (
                    !Array.isArray(value) ||
                    value.length > 1000 ||
                    value.some(v => typeof v !== 'string' || !v.trim())
                  )
                    throw new RecordMutationError(400, 'Invalid permission subjects');
                  const authorization = current!.authorization as unknown as Record<string, unknown>;
                  const existing = authorization[key];
                  authorization[key] = action.startsWith('add')
                    ? _.union(Array.isArray(existing) ? existing : [], value)
                    : _.difference(Array.isArray(existing) ? existing : [], value);
                };
                change(roles ? field + 'Roles' : field, body[roles ? 'roles' : 'users']);
                if (!roles) change(field + 'Pending', body.pendingUsers);
              } else if (action === 'updateObjectMeta')
                current.metaMetadata = body as unknown as RecordModel['metaMetadata'];
              else if (action !== 'transitionWorkflow' || browser)
                submission = {
                  metadata: body,
                  mode: query.merge === true || query.merge === 'true' ? 'merge' : 'replace',
                  ...(browser ? { arrayMergeMode: 'replace' as const } : {}),
                };
              const nextStep = targetStep ? await singleHttpResult(input.workflows.get(type, targetStep)) : undefined;
              result = await input.records.updateMeta(
                brand,
                oid,
                current,
                { ...user },
                true,
                true,
                nextStep,
                submission,
                context
              );
            }
          }
          // Re-project certified refusals from current authority before returning state to a racing caller.
          if (
            result.outcome === 'not-saved' &&
            result.problems.some(p => p.kind === 'conflict' || p.kind === 'authorization')
          ) {
            result.setProjectedMetadata(null);
            const latest = (await load(oid)) ?? (await load(oid, true));
            if (
              !latest ||
              !input.records.hasViewAccess(
                brand,
                user,
                user.roles.map(role => ({ ...role })),
                latest
              )
            ) {
              result.concurrency = undefined;
              res
                .set(apiNoCacheHeaders)
                .status(403)
                .json(
                  apiVersion(req) === '1.0'
                    ? { message: 'Not authorised.' }
                    : { errors: [{ code: 'not-authorised' }], meta: {} }
                );
              return;
            }
            if (
              !input.records.hasEditAccess(
                brand,
                user,
                user.roles.map(role => ({ ...role })),
                latest
              )
            )
              result.problems = [
                recordSaveProblem(
                  'authorization',
                  'response',
                  '@record-save-record-validation-edit-unauthorized',
                  'record-validation-edit-unauthorized'
                ),
              ];
            result.setProjectedMetadata(latest.metadata);
            result.setConcurrencyMetadata({
              ...result.concurrency,
              ...recordRepresentationConcurrency(latest).metadata,
            });
          }
          const headers = { ...recordSaveResultHeaders(result) } as Record<string, string>;
          if (result.schemaOutcome)
            headers.Link = recordSchemaDescribedByLink(
              recordSchemaImmutableUrl(brand.name, portal, result.schemaOutcome.digest, input.rootContext)
            );
          const v1 = apiVersion(req) === '1.0';
          if (!result.wasPersisted()) {
            const status = recordSaveFailureStatus(result);
            const schemaStatus =
              status === 412 ||
              result.problems.some(
                p => p.kind === 'validation' && p.issues.some(i => i.code === 'record-schema.invalid-request')
              );
            // Legacy transition refusal keeps its historical 200, except explicit concurrency/schema failures.
            if (!browser && action === 'transitionWorkflow' && v1 && !isRecordConflictStatus(status) && !schemaStatus) {
              res.set(apiNoCacheHeaders).set(headers).json(legacySaveBody(result));
              return;
            }
            res
              .set(apiNoCacheHeaders)
              .set(headers)
              .status(v1 && !isRecordConflictStatus(status) && !schemaStatus ? 500 : status)
              .json(
                v1
                  ? action === 'transitionWorkflow'
                    ? legacySaveBody(result)
                    : {
                        message: permission
                          ? `Failed to update record with oid ${oid}.`
                          : action === 'updateMeta'
                            ? 'Update Metadata failed'
                            : action === 'updateObjectMeta'
                              ? 'Update Object Metadata failed'
                              : 'Record save failed',
                      }
                  : { errors: recordSaveDisplayErrors(result, 'Record save failed'), meta: { ...result } }
              );
            return;
          }
          let data: unknown = lifecycle ? (result.data ?? result) : result;
          let legacy: unknown = legacySaveBody(result);
          if (permission) {
            const saved = await load(result.oid);
            data =
              saved &&
              input.records.hasViewAccess(
                brand,
                user,
                user.roles.map(role => ({ ...role })),
                saved
              )
                ? saved.authorization
                : null;
            legacy = data;
          } else if (browser && action !== 'transitionWorkflow' && !lifecycle) {
            const saved = await load(result.oid);
            data = saved;
            if (saved && !targetStep && input.returnMetadataOnSave !== false && saved.metaMetadata.form) {
              try {
                const form = await singleHttpResult(
                  input.forms.getFormByName(saved.metaMetadata.form, false, brand.id)
                );
                if (form?.configuration) {
                  const client = await input.forms.buildClientFormConfig(
                    form.configuration,
                    'edit',
                    user.roles.map(r => r.name),
                    saved.metadata,
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
                      saved
                    ),
                    { user, brand }
                  );
                  result.metadata = await projection.projectMetadataClientFormConfig(
                    saved.metadata,
                    client,
                    'edit',
                    input.reusableFormDefinitions
                  );
                }
              } catch {
                input.log.error('Failed to project post-save record metadata');
              }
            }
            legacy = legacySaveBody(result);
          }
          const status = action === 'create' && !browser ? 201 : 200;
          if (status === 201)
            headers.Location =
              req.protocol +
              '://' +
              req.get('host') +
              (input.rootContext ?? '') +
              '/' +
              brand.name +
              '/' +
              portal +
              '/api/records/metadata/' +
              encodeURIComponent(result.oid);
          res
            .set(apiNoCacheHeaders)
            .set(headers)
            .status(status)
            .json(v1 ? legacy : { data, meta: { ...result } });
        } catch (error) {
          if (!(error instanceof RecordMutationError)) input.log.error('Record mutation failed');
          sendApiErrors(req, res, error instanceof RecordMutationError ? error.status : 500, [
            { detail: error instanceof RecordMutationError ? error.message : 'Record mutation failed' },
          ]);
        }
      })
    );
  }
}
