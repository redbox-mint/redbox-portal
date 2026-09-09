import type {
  ContractJsonObject,
  RecordContractCompleteness,
  RecordContractFormat,
  RecordContractSchemaKind,
} from '../../record-contract/types';

export interface RecordSchemaArtifactInput {
  readonly digest: string;
  readonly document: ContractJsonObject;
  readonly contractFormat: RecordContractFormat;
  readonly completeness: RecordContractCompleteness;
  readonly byteLength: number;
}

export interface RecordSchemaArtifactModel extends RecordSchemaArtifactInput {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastAccessedAt?: Date;
}

/** Redacted artifact metadata used by bounded internal retention scans. */
export interface RecordSchemaArtifactSummary {
  readonly digest: string;
  readonly createdAt: Date;
}

export interface RecordSchemaArtifactQuery {
  readonly afterDigest?: string;
  readonly limit: number;
}

interface RecordSchemaReferenceCommon {
  readonly referenceKey: string;
  readonly digest: string;
  readonly brand: string;
  readonly portal: string;
  readonly recordType: string;
  readonly operation: string;
}

export interface RecordSchemaCreateGrantReferenceInput extends RecordSchemaReferenceCommon {
  readonly kind: 'grant';
  readonly schemaKind: 'create';
  readonly oid?: never;
  readonly owner?: never;
  readonly purpose?: never;
  readonly expiresAt?: never;
}

export interface RecordSchemaUpdateGrantReferenceInput extends RecordSchemaReferenceCommon {
  readonly kind: 'grant';
  readonly schemaKind: 'update';
  readonly oid: string;
  readonly owner?: never;
  readonly purpose?: never;
  readonly expiresAt?: never;
}

export type RecordSchemaGrantReferenceInput =
  | RecordSchemaCreateGrantReferenceInput
  | RecordSchemaUpdateGrantReferenceInput;

export interface RecordSchemaSaveReferenceInput extends RecordSchemaReferenceCommon {
  readonly kind: 'save';
  readonly schemaKind: RecordContractSchemaKind;
  readonly oid: string;
  readonly owner?: never;
  readonly purpose?: never;
  readonly expiresAt?: never;
}

export interface RecordSchemaPinReferenceInput extends RecordSchemaReferenceCommon {
  readonly kind: 'pin';
  readonly schemaKind: RecordContractSchemaKind;
  readonly oid?: never;
  readonly owner: string;
  readonly purpose: string;
  readonly expiresAt?: Date;
}

export type RecordSchemaReferenceInput =
  | RecordSchemaGrantReferenceInput
  | RecordSchemaSaveReferenceInput
  | RecordSchemaPinReferenceInput;

export type RecordSchemaReferenceModel = RecordSchemaReferenceInput & {
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/**
 * Indexed immutable-authorization cursor lookup. Storage returns the next
 * grant after the exclusive cursor, or null at conclusive exhaustion. Create
 * grants are selected by exact public context, while update grants are joined
 * to a currently editable active record for the supplied principals.
 */
export interface RecordSchemaAuthorizationGrantQuery {
  readonly digest: string;
  readonly brand: string;
  readonly portal: string;
  readonly schemaKind: RecordContractSchemaKind;
  readonly recordType: string;
  readonly operation: string;
  readonly recordBrandId: string;
  readonly username: string;
  readonly roleNames: readonly string[];
  /** Exclusive stable cursor ordered by the globally unique reference key. */
  readonly afterReferenceKey?: string;
}

export interface RecordSchemaReferenceQuery {
  readonly digest?: string;
  readonly kind?: RecordSchemaReferenceInput['kind'];
  readonly brand?: string;
  readonly portal?: string;
  readonly schemaKind?: RecordContractSchemaKind;
  readonly recordType?: string;
  readonly oid?: string;
  readonly operation?: string;
  readonly owner?: string;
  readonly includeExpiredPins?: boolean;
  readonly limit: number;
  /** Exclusive stable cursor for bounded scans ordered by the globally unique reference key. */
  readonly afterReferenceKey?: string;
}

export type RecordSchemaRetentionReason = 'minimum-age' | 'grant-reference' | 'save-reference' | 'active-pin';

export interface RecordSchemaRetentionReportEntry {
  readonly digest: string;
  readonly createdAt: Date;
  readonly ageDays: number;
  readonly grantCount: number;
  readonly saveCount: number;
  readonly activePinCount: number;
  readonly reasons: readonly RecordSchemaRetentionReason[];
  readonly eligibleForDeletion: boolean;
}
