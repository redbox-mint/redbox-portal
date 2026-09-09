import { parseRecordDefinitionKey, type RecordDefinitionActorDto } from '@researchdatabox/sails-ng-common';
import { Services as Core } from '../CoreService';
import { boundedValidationPreflight } from '../boundedValidation';
import { isRuntimeRecord, type RuntimeValue, type RuntimeValidator } from '../runtimeValues';
import {
  recordDefinitionDraftSaveRequestSchema,
  recordDefinitionPublicationRequestSchema,
  recordDefinitionRollbackRequestSchema,
  recordDefinitionRetirementRequestSchema,
} from '../record-workflow-administration';
import { RecordDefinitionDraftLifecycleError } from './RecordDefinitionDraftService';
import { RecordDefinitionPublicationLifecycleError } from './RecordDefinitionPublicationService';
import {
  RedboxActionRegistry,
  createActionSecretSlotIdentity,
  parseActionBindingId,
  ActionSecretProviderError,
} from '../action-registry';
import { coreRecordActionRegistry } from './record-actions/coordinator';
import { actionSecretAdminStorage, ActionSecretVersionConflict } from './action-secrets/storage';

export type RecordDefinitionAdminAction =
  | 'list'
  | 'clone'
  | 'get'
  | 'draft'
  | 'save'
  | 'discard'
  | 'validate'
  | 'publish'
  | 'revisions'
  | 'revision'
  | 'rollback'
  | 'retire'
  | 'unretire'
  | 'actions'
  | 'writeSecret'
  | 'clearSecret';
export interface RecordDefinitionAdminRequest {
  readonly brandId: string;
  readonly actor: RecordDefinitionActorDto;
  readonly key: string;
  readonly revision: string;
  readonly bindingId: string;
  readonly parameter: string;
  readonly body: RuntimeValue;
  readonly query: RuntimeValue;
}
export interface RecordDefinitionAdminResponse {
  readonly status: number;
  readonly data: object;
}
class RequestProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}
function invalid(): never {
  throw new RequestProblem(400, 'invalid-request');
}
function parse<T>(schema: RuntimeValidator<T>, body: RuntimeValue): T {
  const result = schema.safeParse(body);
  return result.success ? result.data : invalid();
}
function bodyFields(body: RuntimeValue, required: readonly string[], optional: readonly string[] = []) {
  if (
    !isRuntimeRecord(body) ||
    required.some(key => !Object.hasOwn(body, key)) ||
    Object.keys(body).some(key => !required.includes(key) && !optional.includes(key))
  )
    return invalid();
  return body;
}
function version(value: RuntimeValue): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER)
    return invalid();
  return value;
}
function parseBindingId(value: string) {
  try {
    return parseActionBindingId(value);
  } catch {
    return invalid();
  }
}
function activeVersion(value: RuntimeValue): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return invalid();
  return value;
}
function revisionNumber(value: string): number {
  if (!/^[1-9][0-9]{0,15}$/.test(value)) return invalid();
  return activeVersion(Number(value))!;
}
function registry(): RedboxActionRegistry {
  const configured = (sails.config as object as { actionRegistry?: RedboxActionRegistry }).actionRegistry;
  return configured instanceof RedboxActionRegistry ? configured : coreRecordActionRegistry();
}
function bounded(value: RuntimeValue): void {
  const check = boundedValidationPreflight(value, {
    maxBytes: 1_048_576,
    maxDepth: 34,
    maxStringLength: 65_536,
    maxPropertyNameLength: 128,
    maxWork: 100_000,
    arrayCardinalityLimit: () => 1000,
    objectCardinalityLimit: () => 100,
  });
  if (!check.ok)
    throw new RequestProblem(check.reason === 'bytes' || check.reason === 'string' ? 413 : 400, 'invalid-request');
}
function reply(data: object | null): RecordDefinitionAdminResponse {
  if (data === null) throw new RequestProblem(404, 'not-found');
  return { status: 'ok' in data && data.ok === false ? 409 : 200, data };
}

export namespace Services {
  /** HTTP input adapter; lifecycle authority and persistence remain in the approved services. */
  export class RecordDefinitionAdmin extends Core.Core.Service {
    protected override _exportedMethods = ['handle'];
    public async handle(
      action: RecordDefinitionAdminAction,
      request: RecordDefinitionAdminRequest
    ): Promise<RecordDefinitionAdminResponse> {
      try {
        bounded(request.body);
        bounded(request.query);
        const query = bodyFields(
          request.query,
          [],
          action === 'list' ? ['after'] : action === 'revisions' ? ['limit'] : []
        );
        if (!['list', 'actions'].includes(action)) {
          try {
            parseRecordDefinitionKey(request.key);
          } catch {
            return invalid();
          }
        }
        const { brandId, key, actor } = request;
        const body = request.body;
        if (['list', 'get', 'draft', 'revisions', 'revision', 'actions'].includes(action)) bodyFields(body, []);
        switch (action) {
          case 'list': {
            const after = query.after === undefined ? '' : typeof query.after === 'string' ? query.after : invalid();
            if (after !== '') {
              try {
                parseRecordDefinitionKey(after);
              } catch {
                return invalid();
              }
            }
            const items = await RecordDefinitionDraftService.list(brandId, after);
            return reply({ items, nextAfter: items.length === 100 ? items[items.length - 1]!.key : null });
          }
          case 'actions':
            return reply({ actions: JSON.parse(registry().serializeDescriptorMetadata()) as object });
          case 'get': {
            const identity = await RecordDefinitionDraftService.getStatus(brandId, key);
            if (identity === null) return reply(null);
            const active =
              identity.activeRevision === null
                ? null
                : await RecordDefinitionPublicationService.getRevision(
                    brandId,
                    key,
                    identity.activeRevision.revisionNumber
                  );
            return reply({ identity, active });
          }
          case 'draft': {
            const draft = await RecordDefinitionDraftService.get(brandId, key);
            if (draft === null) return reply(null);
            const secretStates: { bindingId: string; parameter: string; configured: boolean; version: number }[] = [];
            const actions = registry();
            for (const binding of draft.definition.actionBindings) {
              const lookup = actions.lookup(binding.actionId, binding.contractVersion);
              if (lookup.status !== 'available') continue;
              for (const parameter of lookup.descriptor.parameterSchema.parameters) {
                if (parameter.kind !== 'secret') continue;
                const slot = createActionSecretSlotIdentity({
                  brandId,
                  recordTypeKey: key,
                  bindingId: parseBindingId(binding.id),
                  parameterName: parameter.name,
                });
                secretStates.push({
                  bindingId: binding.id,
                  parameter: parameter.name,
                  ...(await actionSecretAdminStorage(actions).adminState(slot)),
                });
              }
            }
            return reply({ draft, secretStates });
          }
          case 'clone': {
            const fields = bodyFields(body, ['schemaVersion', 'targetRecordTypeKey', 'expectedActiveRevisionNumber']);
            if (fields.schemaVersion !== 1 || typeof fields.targetRecordTypeKey !== 'string') return invalid();
            try {
              parseRecordDefinitionKey(fields.targetRecordTypeKey);
            } catch {
              return invalid();
            }
            const expected = activeVersion(fields.expectedActiveRevisionNumber);
            const source = await RecordDefinitionDraftService.getStatus(brandId, key);
            if (source === null) return reply(null);
            if (source.activeRevision?.revisionNumber !== expected)
              throw new RequestProblem(409, 'active-revision-conflict');
            return reply(
              await RecordDefinitionDraftService.clone(brandId, key, fields.targetRecordTypeKey, actor, expected)
            );
          }
          case 'save':
            return reply(
              await RecordDefinitionDraftService.save(
                brandId,
                key,
                parse(recordDefinitionDraftSaveRequestSchema, body),
                actor
              )
            );
          case 'discard': {
            const fields = bodyFields(body, ['schemaVersion', 'expectedDraftVersion', 'expectedActiveRevisionNumber']);
            if (fields.schemaVersion !== 1) return invalid();
            return reply(
              await RecordDefinitionDraftService.discard(
                brandId,
                key,
                version(fields.expectedDraftVersion),
                activeVersion(fields.expectedActiveRevisionNumber),
                actor
              )
            );
          }
          case 'validate':
            return reply(
              await RecordDefinitionPublicationService.validateDraft(
                brandId,
                key,
                parse(recordDefinitionPublicationRequestSchema, body)
              )
            );
          case 'publish':
            return reply(
              await RecordDefinitionPublicationService.publish(
                brandId,
                key,
                parse(recordDefinitionPublicationRequestSchema, body),
                actor
              )
            );
          case 'revisions': {
            const limit =
              query.limit === undefined
                ? 50
                : typeof query.limit === 'string'
                  ? revisionNumber(query.limit)
                  : invalid();
            return reply({ items: await RecordDefinitionPublicationService.listHistory(brandId, key, limit) });
          }
          case 'revision':
            return reply(
              await RecordDefinitionPublicationService.getRevision(brandId, key, revisionNumber(request.revision))
            );
          case 'rollback': {
            const fields = bodyFields(body, [
              'schemaVersion',
              'expectedIdentityVersion',
              'expectedActiveRevisionNumber',
              'reason',
            ]);
            return reply(
              await RecordDefinitionPublicationService.rollback(
                brandId,
                key,
                parse(recordDefinitionRollbackRequestSchema, {
                  ...fields,
                  sourceRevisionNumber: revisionNumber(request.revision),
                }),
                actor
              )
            );
          }
          case 'retire':
          case 'unretire':
            return reply(
              await RecordDefinitionPublicationService[action](
                brandId,
                key,
                parse(recordDefinitionRetirementRequestSchema, body),
                actor
              )
            );
          case 'writeSecret':
          case 'clearSecret': {
            const fields = bodyFields(
              body,
              ['schemaVersion', 'expectedDraftVersion', 'expectedSecretVersion'],
              action === 'writeSecret' ? ['value'] : ['confirm']
            );
            if (
              fields.schemaVersion !== 1 ||
              (action === 'clearSecret' && fields.confirm !== true) ||
              (fields.value !== undefined && typeof fields.value !== 'string')
            )
              return invalid();
            const expectedDraftVersion = version(fields.expectedDraftVersion);
            const expectedSecretVersion = version(fields.expectedSecretVersion);
            const draft = await RecordDefinitionDraftService.get(brandId, key);
            if (draft === null) return reply(null);
            if (draft.version !== expectedDraftVersion) throw new RequestProblem(409, 'draft-version-conflict');
            const slot = createActionSecretSlotIdentity({
              brandId,
              recordTypeKey: key,
              bindingId: parseBindingId(request.bindingId),
              parameterName: request.parameter,
            });
            const state = await actionSecretAdminStorage(registry()).adminWrite(
              slot,
              expectedSecretVersion,
              action === 'clearSecret' ? null : (fields.value as string | undefined),
              expectedDraftVersion
            );
            return reply(state);
          }
        }
      } catch (error) {
        if (error instanceof RequestProblem) return { status: error.status, data: { error: error.code } };
        if (error instanceof ActionSecretVersionConflict)
          return { status: 409, data: { error: 'secret-version-conflict' } };
        if (
          error instanceof RecordDefinitionDraftLifecycleError ||
          error instanceof RecordDefinitionPublicationLifecycleError
        ) {
          const code = error.code;
          const status =
            code === 'storage-consistency-error'
              ? 503
              : code.endsWith('not-found')
                ? 404
                : code.includes('already') || code === 'active-revision-conflict' || code === 'record-type-retired'
                  ? 409
                  : 400;
          return {
            status,
            data: {
              error: code,
              validation: error.validation,
              ...(error instanceof RecordDefinitionPublicationLifecycleError ? { impact: error.impact } : {}),
            },
          };
        }
        if (error instanceof ActionSecretProviderError)
          return { status: error.code === 'secret-provider-failure' ? 503 : 400, data: { error: error.code } };
        return { status: 500, data: { error: 'server-error' } };
      }
    }
  }
}
