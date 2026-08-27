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
  RecordSchemaCreateGrantReferenceInput | RecordSchemaUpdateGrantReferenceInput;

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
  RecordSchemaGrantReferenceInput | RecordSchemaSaveReferenceInput | RecordSchemaPinReferenceInput;

export type RecordSchemaReferenceModel = RecordSchemaReferenceInput & {
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export interface RecordSchemaGrantQuery {
  readonly digest: string;
  readonly brand: string;
  readonly portal: string;
  readonly limit: number;
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
  readonly offset?: number;
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

export interface RecordSchemaDeleteRequest {
  readonly digest: string;
  readonly now: Date;
  readonly minimumAgeDays: number;
}

export type RecordSchemaDeleteResult =
  | { readonly kind: 'deleted'; readonly digest: string }
  | { readonly kind: 'not-found'; readonly digest: string }
  | {
      readonly kind: 'retained';
      readonly digest: string;
      readonly reasons: readonly RecordSchemaRetentionReason[];
    };
