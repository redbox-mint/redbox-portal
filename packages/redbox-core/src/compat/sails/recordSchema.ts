import { registerPersistenceResource } from '../../persistence/runtime';
import { RecordContractContributorRegistry } from '../../record-contract';
import type { RecordContractContributorDiscoveryState } from '../../record-contract';
import { Services as CoreServices } from '../../CoreService';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import {
  Services as Domain,
  normalizeRecordSchemaConfiguration,
  type RecordSchemaServiceDependencies,
} from '../../recordSchema/RecordSchema';
import type { FormRecordAccessContext } from '../../forms/Forms';
import type { RecordContractCreateContext, RecordContractUpdateContext } from '../../record-contract';
declare const RedboxJavaStorageService: unknown;
function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function configuredStorageProvider(): unknown {
  const storageConfig = sails.config.storage;
  if (isObjectRecord(storageConfig)) {
    const serviceName = storageConfig.serviceName;
    if (typeof serviceName === 'string' && serviceName.trim() !== '') {
      return sails.services?.[serviceName];
    }
  }
  return typeof RedboxJavaStorageService === 'undefined' ? undefined : RedboxJavaStorageService;
}

interface RecordEditAuthorizationCapability {
  readonly hasEditAccess: (
    brand: FormRecordAccessContext['brand'],
    user: FormRecordAccessContext['user'],
    roles: FormRecordAccessContext['user']['roles'],
    record: Readonly<Record<string, unknown>>
  ) => boolean;
}

interface RecordCreateAuthorizationCapability {
  readonly hasCreateAccess: (
    brand: FormRecordAccessContext['brand'],
    user: FormRecordAccessContext['user'],
    roles: FormRecordAccessContext['user']['roles'],
    recordType: string,
    workflowStep: string
  ) => Promise<boolean>;
}

function hasRecordEditAuthorizationCapability(value: unknown): value is RecordEditAuthorizationCapability {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  try {
    return typeof Reflect.get(value, 'hasEditAccess') === 'function';
  } catch {
    return false;
  }
}

function hasRecordCreateAuthorizationCapability(value: unknown): value is RecordCreateAuthorizationCapability {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  try {
    return typeof Reflect.get(value, 'hasCreateAccess') === 'function';
  } catch {
    return false;
  }
}

function recordsAuthorizationService(): unknown {
  const configured = sails.services?.recordsservice;
  return configured === undefined && typeof RecordsService !== 'undefined' ? RecordsService : configured;
}

function recordEditAuthorizationService(): RecordEditAuthorizationCapability | undefined {
  const candidate = recordsAuthorizationService();
  return hasRecordEditAuthorizationCapability(candidate) ? candidate : undefined;
}

async function authorizeCreateWithRecordsService(
  context: RecordContractCreateContext,
  caller: FormRecordAccessContext
): Promise<boolean> {
  const recordsService = recordsAuthorizationService();
  if (!hasRecordCreateAuthorizationCapability(recordsService)) {
    throw new Error('Record create authorization is unavailable.');
  }
  const username = typeof caller.user?.username === 'string' ? caller.user.username.trim() : '';
  const brandId = typeof caller.brand?.id === 'string' ? caller.brand.id.trim() : '';
  if (!username || brandId !== context.publicContext.brand || !context.resolution.actor.authenticated) {
    return false;
  }
  const roles = Array.isArray(caller.user.roles) ? caller.user.roles : [];
  return await recordsService.hasCreateAccess(
    caller.brand,
    caller.user,
    roles,
    context.publicContext.recordType,
    context.publicContext.workflowStep
  );
}

async function authorizeUpdateWithRecordsService(
  context: RecordContractUpdateContext,
  caller: FormRecordAccessContext
): Promise<boolean> {
  const recordsService = recordEditAuthorizationService();
  if (!recordsService) {
    throw new Error('Record edit authorization is unavailable.');
  }
  const username = typeof caller.user?.username === 'string' ? caller.user.username.trim() : '';
  const brandId = typeof caller.brand?.id === 'string' ? caller.brand.id.trim() : '';
  if (!username || brandId !== context.publicContext.brand || !context.resolution.actor.authenticated) {
    return false;
  }
  const roles = Array.isArray(caller.user.roles) ? caller.user.roles : [];
  return recordsService.hasEditAccess(caller.brand, caller.user, roles, context.resolution.existingRecord);
}

const DEFAULT_DEPENDENCIES: RecordSchemaServiceDependencies = {
  getConfig: () => normalizeRecordSchemaConfiguration(sails.config.recordSchema),
  getStorageProvider: configuredStorageProvider,
  getContributorRegistry: () => undefined,
  getContributorRegistrationIssues: () => [],
  getContributorComponentTypes: () => [],
  getConfiguredFormCandidates: () => FormsService.listConfiguredRecordContractForms(),
  resolveContractContext: request => RecordValidationService.resolveContractContext(request),
  buildContractFormConfig: (context, recordAccessContext) =>
    FormsService.buildContractFormConfig(context, recordAccessContext),
  authorizeCreate: authorizeCreateWithRecordsService,
  authorizeUpdate: authorizeUpdateWithRecordsService,
  clock: () => Date.now(),
};

const methods = [
  'init',
  'bootstrap',
  'resolveCreate',
  'resolveUpdate',
  'resolveImmutable',
  'describeStage',
  'validateResolvedArtifact',
  'persistSaveUsageReference',
  'materializeIntegrationPins',
  'bootstrapIntegrationPins',
  'reportRetention',
] as const;
/** Only the comparison host retains the legacy logger configuration contract. */
class RecordSchemaLog extends CoreServices.Core.Service {
  public current(): ILogger {
    return this.logger;
  }
}
export class LegacyRecordSchema extends Domain.RecordSchema {
  public constructor(overrides: Partial<RecordSchemaServiceDependencies> = {}) {
    const logger = new RecordSchemaLog();
    super({
      ...DEFAULT_DEPENDENCIES,
      ...overrides,
      get telemetryLogger() {
        return overrides.telemetryLogger ?? logger.current();
      },
    });
  }
  public exports(): Record<string, unknown> {
    return Object.fromEntries(methods.map(name => [name, this[name].bind(this)]));
  }
}
const key = Symbol.for('@researchdatabox/redbox-core/comparison/RecordSchema');
function contributorDependencies(app: Sails.Application) {
  const UNBOUND_RECORD_SCHEMA_CONTRIBUTOR_STATE: RecordContractContributorDiscoveryState = Object.freeze({
    registrations: Object.freeze([]),
    registrationIssues: Object.freeze([]),
    componentTypes: Object.freeze([]),
  });
  let resolvedRecordSchemaContributorState: RecordContractContributorDiscoveryState | undefined;
  let resolvedRecordSchemaContributorRegistry: RecordContractContributorRegistry | undefined;

  function configuredRecordSchemaContributorState(): RecordContractContributorDiscoveryState {
    return app.config.recordContractContributorState ?? UNBOUND_RECORD_SCHEMA_CONTRIBUTOR_STATE;
  }

  function configuredRecordSchemaContributorRegistry(): RecordContractContributorRegistry | undefined {
    const state = configuredRecordSchemaContributorState();
    if (state !== resolvedRecordSchemaContributorState) {
      resolvedRecordSchemaContributorState = state;
      resolvedRecordSchemaContributorRegistry =
        state.registrationIssues.length === 0 && state.registrations.length > 0
          ? new RecordContractContributorRegistry(state.registrations)
          : undefined;
    }
    return resolvedRecordSchemaContributorRegistry;
  }

  const dependencies: Pick<
    RecordSchemaServiceDependencies,
    'getContributorRegistry' | 'getContributorRegistrationIssues' | 'getContributorComponentTypes'
  > = {
    getContributorRegistry: configuredRecordSchemaContributorRegistry,
    getContributorRegistrationIssues: () => configuredRecordSchemaContributorState().registrationIssues,
    getContributorComponentTypes: () => configuredRecordSchemaContributorState().componentTypes,
  };

  return dependencies;
}

export function sailsRecordSchemaExports(): Record<string, unknown> {
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as LegacyRecordSchema | undefined;
        if (!instance) {
          instance = new LegacyRecordSchema(contributorDependencies(sails));
          Object.defineProperty(sails, key, { value: instance });
          registerPersistenceResource(sails, 'RecordSchema', { close: () => instance!.close() });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing schema operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
