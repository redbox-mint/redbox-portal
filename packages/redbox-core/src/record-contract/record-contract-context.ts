import type {
  AvailableFormComponentDefinitionFrames,
  FormComponentDefinitionFrame,
  FormConfigFrame,
} from '@researchdatabox/sails-ng-common';

import type { ContractJsonObject, RecordContractPublicContext, RecordContractSchemaKind } from './types';

/** The authorization facts required by authoritative context resolution. */
export interface RecordContractContextActor {
  readonly authenticated: boolean;
  readonly roles: readonly string[];
}

interface RecordContractContextRequestBase {
  readonly brand: string;
  readonly portal: string;
  readonly operation?: string;
  readonly actor: RecordContractContextActor;
}

/** Inputs needed to select an authoritative create form and operation. */
export interface RecordContractCreateContextRequest extends RecordContractContextRequestBase {
  readonly kind: 'create';
  readonly recordType: string;
  /** Optional actor-authorized workflow target whose configured form becomes authoritative. */
  readonly targetStep?: string;
  readonly oid?: never;
}

/** Inputs needed to authorize and resolve an authoritative update context. */
export interface RecordContractUpdateContextRequest extends RecordContractContextRequestBase {
  readonly kind: 'update';
  readonly oid: string;
  readonly recordType?: never;
}

export type RecordContractContextRequest = RecordContractCreateContextRequest | RecordContractUpdateContextRequest;

export type RecordContractContextFailureKind =
  'invalid-request' | 'not-found' | 'forbidden' | 'not-resolvable' | 'unavailable';

/** Typed authoritative-context failure that never exposes record or caller values. */
export class RecordContractContextResolutionError extends Error {
  public readonly diagnosticCodes: readonly string[];

  public constructor(
    public readonly failureKind: RecordContractContextFailureKind,
    diagnosticCodes: readonly string[] = []
  ) {
    super(`Record contract context resolution failed (${failureKind}).`);
    this.name = 'RecordContractContextResolutionError';
    this.diagnosticCodes = Object.freeze([...new Set(diagnosticCodes)].sort());
  }
}

/** Source form retained before caller- and candidate-dependent contract construction. */
export type RecordContractSourceForm = Readonly<Omit<FormConfigFrame, 'componentDefinitions'>> & {
  readonly componentDefinitions: readonly AvailableFormComponentDefinitionFrames[];
};

export type RecordContractReusableFormDefinitions = Readonly<
  Record<string, readonly AvailableFormComponentDefinitionFrames[]>
>;

/** Class-backed, hook-extensible form data accepted at the compiler boundary. */
export type RecordContractEffectiveForm = Readonly<Omit<FormConfigFrame, 'componentDefinitions'>> & {
  readonly componentDefinitions: readonly FormComponentDefinitionFrame[];
};

interface RecordContractResolutionDataBase {
  readonly sourceFormFingerprint: string;
  readonly sourceForm: RecordContractSourceForm;
  readonly reusableFormDefinitions: RecordContractReusableFormDefinitions;
  readonly actor: RecordContractContextActor;
  readonly formMode: 'edit' | 'view';
  readonly contextVariables: ContractJsonObject;
}

export interface RecordContractCreateResolutionData extends RecordContractResolutionDataBase {
  readonly oid?: never;
  readonly existingRecord?: never;
}

export interface RecordContractUpdateResolutionData extends RecordContractResolutionDataBase {
  readonly oid: string;
  readonly existingRecord: Readonly<Record<string, unknown>>;
}

type RecordContractPublicContextFor<Kind extends RecordContractSchemaKind> = Omit<
  RecordContractPublicContext,
  'kind'
> & {
  readonly kind: Kind;
};

export interface RecordContractCreateContext {
  readonly publicContext: RecordContractPublicContextFor<'create'>;
  readonly resolution: RecordContractCreateResolutionData;
}

export interface RecordContractUpdateContext {
  readonly publicContext: RecordContractPublicContextFor<'update'>;
  readonly resolution: RecordContractUpdateResolutionData;
}

/**
 * Authoritative context resolution result. Only `publicContext` may cross the
 * compiler/renderer boundary; `resolution` remains private service data.
 */
export type RecordContractContext = RecordContractCreateContext | RecordContractUpdateContext;

/** A role- and mode-effective form that is safe to pass to contract compilation. */
export interface RecordContractFormBuildSuccess {
  readonly ok: true;
  readonly effectiveForm: RecordContractEffectiveForm;
}

/** Contract construction cannot continue when no effective form components remain. */
export interface RecordContractFormBuildFailure {
  readonly ok: false;
  readonly reason: 'empty-effective-form';
}

export type RecordContractFormBuildResult = RecordContractFormBuildSuccess | RecordContractFormBuildFailure;

const PUBLIC_CONTEXT_STRING_FIELDS = ['brand', 'portal', 'recordType', 'workflowStep', 'form', 'operation'] as const;

/** Build a detached, immutable allowlisted snapshot for schema serialization. */
export function snapshotRecordContractPublicContext(context: RecordContractPublicContext): RecordContractPublicContext {
  const snapshot: RecordContractPublicContext = {
    brand: context.brand,
    portal: context.portal,
    kind: context.kind,
    recordType: context.recordType,
    workflowStep: context.workflowStep,
    form: context.form,
    operation: context.operation,
    unknownProperties: context.unknownProperties,
    enforcement: context.enforcement,
  };
  if (
    !PUBLIC_CONTEXT_STRING_FIELDS.every(field => typeof snapshot[field] === 'string') ||
    !['create', 'update'].includes(snapshot.kind) ||
    !['allow', 'declared'].includes(snapshot.unknownProperties) ||
    !['shadow', 'enforce'].includes(snapshot.enforcement)
  ) {
    throw new Error('Record-contract public context is invalid.');
  }
  return Object.freeze(snapshot);
}
