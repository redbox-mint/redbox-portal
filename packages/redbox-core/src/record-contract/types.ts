import type { RecordSchemaProblemCode } from './codes';

/** The first stable record-contract compiler and annotation format. */
export const RECORD_CONTRACT_FORMAT_V1 = 'redbox-record-contract/1' as const;
export type RecordContractFormat = typeof RECORD_CONTRACT_FORMAT_V1;

export type RecordContractCompleteness = 'complete' | 'partial';
export type RecordContractSchemaKind = 'create' | 'update';
export type RecordContractEnforcement = 'shadow' | 'enforce';

export type ContractJsonPrimitive = string | number | boolean | null;
export type ContractJsonValue = ContractJsonPrimitive | ContractJsonObject | readonly ContractJsonValue[];

export interface ContractJsonObject {
  readonly [key: string]: ContractJsonValue;
}

declare const recordContractPointerBrand: unique symbol;

/** An RFC 6901 JSON Pointer. Construction and validation are centralized later. */
export type RecordContractPointer = string & {
  readonly [recordContractPointerBrand]: 'RecordContractPointer';
};

export interface ContractNodeAnnotations {
  readonly description?: string;
  readonly default?: ContractJsonValue;
  readonly examples?: readonly ContractJsonValue[];
  readonly extensions?: Readonly<Record<string, ContractJsonValue>>;
}

interface ContractNodeBase {
  readonly nullable: boolean;
  readonly annotations?: ContractNodeAnnotations;
  /** Stable reusable-definition identity retained for the later dialect renderer. */
  readonly definitionKey?: string;
}

export type ContractScalarType = 'string' | 'number' | 'integer' | 'boolean';
export type ContractScalarValue = string | number | boolean;

export interface ContractScalarNode extends ContractNodeBase {
  readonly kind: 'scalar';
  readonly scalarType: ContractScalarType;
  readonly enum?: readonly ContractScalarValue[];
}

export interface ContractObjectNode extends ContractNodeBase {
  readonly kind: 'object';
  readonly properties: Readonly<Record<string, ContractNode>>;
  readonly unknownProperties: 'allow' | 'declared';
}

export interface ContractArrayNode extends ContractNodeBase {
  readonly kind: 'array';
  readonly items: ContractNode;
}

export interface ContractAnyNode extends ContractNodeBase {
  readonly kind: 'any';
  readonly reason?: 'unsupported-component' | 'unrepresentable-condition' | 'legacy-nullability';
}

export type ContractCondition =
  | {
      readonly kind: 'exists';
      readonly pointer: RecordContractPointer;
    }
  | {
      readonly kind: 'equals';
      readonly pointer: RecordContractPointer;
      readonly value: ContractJsonPrimitive;
    }
  | {
      readonly kind: 'in';
      readonly pointer: RecordContractPointer;
      readonly values: readonly ContractJsonPrimitive[];
    }
  | {
      readonly kind: 'all' | 'any';
      readonly conditions: readonly ContractCondition[];
    }
  | {
      readonly kind: 'not';
      readonly condition: ContractCondition;
    };

export interface ContractConditionalNode extends ContractNodeBase {
  readonly kind: 'conditional';
  readonly condition: ContractCondition;
  readonly thenNode: ContractNode;
  readonly elseNode?: ContractNode;
}

export type ContractNode =
  ContractScalarNode | ContractObjectNode | ContractArrayNode | ContractAnyNode | ContractConditionalNode;

interface RecordContractPrivateContextBoundary {
  /** Private resolver data must never become schema annotation content. */
  readonly oid?: never;
  readonly actor?: never;
  readonly actorRoles?: never;
  readonly roles?: never;
  readonly user?: never;
  readonly record?: never;
  readonly existingRecord?: never;
  readonly request?: never;
  readonly requestId?: never;
  readonly timestamp?: never;
  readonly sourceForm?: never;
  readonly sourceFormFingerprint?: never;
  readonly reusableFormDefinitions?: never;
  readonly formMode?: never;
  readonly contextVariables?: never;
}

/** Stable, non-sensitive context that is safe to include in a schema document. */
export interface RecordContractPublicContext extends RecordContractPrivateContextBoundary {
  readonly brand: string;
  readonly portal: string;
  readonly kind: RecordContractSchemaKind;
  readonly recordType: string;
  readonly workflowStep: string;
  readonly form: string;
  readonly operation: string;
  readonly unknownProperties: 'allow' | 'declared';
  readonly enforcement: RecordContractEnforcement;
}

export type RecordContractDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface RecordContractContributorIdentity {
  readonly key: string;
  readonly version: string;
  readonly source: 'core' | 'hook';
  readonly namespace?: string;
}

export interface RecordContractDiagnostic {
  readonly code: string;
  readonly severity: RecordContractDiagnosticSeverity;
  readonly message: string;
  readonly pointer?: RecordContractPointer;
  readonly componentType?: string;
  readonly contributor?: RecordContractContributorIdentity;
}

export interface RecordContractValidationSummary {
  readonly code: string;
  readonly pointers: readonly RecordContractPointer[];
  readonly groups: readonly string[];
  readonly operations: readonly string[];
  readonly blocking: boolean;
}

export interface ContractOwner {
  readonly kind: 'form' | 'component' | 'extension';
  readonly key: string;
  readonly contributor?: RecordContractContributorIdentity;
}

export interface RecordContract {
  readonly root: ContractObjectNode;
  readonly definitions: Readonly<Record<string, ContractNode>>;
  readonly fieldOwners: Readonly<Record<string, ContractOwner>>;
  readonly validatorSummaries: readonly RecordContractValidationSummary[];
  readonly diagnostics: readonly RecordContractDiagnostic[];
  readonly completeness: RecordContractCompleteness;
  readonly context: RecordContractPublicContext;
}

export type RecordContractCompileFailureKind = 'invalid-contract' | 'limit-exceeded' | 'contributor-failed';

export type RecordContractCompileResult =
  | {
      readonly kind: 'compiled';
      readonly contract: RecordContract;
    }
  | {
      readonly kind: 'failed';
      readonly failureKind: RecordContractCompileFailureKind;
      readonly code: RecordSchemaProblemCode;
      readonly diagnostics: readonly RecordContractDiagnostic[];
    };
