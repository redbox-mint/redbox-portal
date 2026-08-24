import type {
  AvailableFormComponentDefinitionFrames,
  FormConfigFrame,
  FormConfigOutline,
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
  readonly oid?: never;
}

/** Inputs needed to authorize and resolve an authoritative update context. */
export interface RecordContractUpdateContextRequest extends RecordContractContextRequestBase {
  readonly kind: 'update';
  readonly oid: string;
  readonly recordType?: never;
}

export type RecordContractContextRequest = RecordContractCreateContextRequest | RecordContractUpdateContextRequest;

/** Source form retained before caller- and candidate-dependent contract construction. */
export type RecordContractSourceForm = Readonly<Omit<FormConfigFrame, 'componentDefinitions'>> & {
  readonly componentDefinitions: readonly AvailableFormComponentDefinitionFrames[];
};

export type RecordContractReusableFormDefinitions = Readonly<
  Record<string, readonly AvailableFormComponentDefinitionFrames[]>
>;

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
  readonly effectiveForm: FormConfigOutline;
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
