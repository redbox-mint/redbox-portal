/** Browser-safe runtime resolution results, keyed by existing relatedTo relation IDs. */
export type RelatedResolutionStatus = 'resolved' | 'empty' | 'partial' | 'unavailable' | 'invalid' | 'failed';

/** Minimal projected source envelope; revision is descriptive, not a snapshot guarantee. */
export interface RelatedMetadataRecord {
  redboxOid: string;
  metaMetadata: { type: string; brandId: string };
  metadata: Record<string, unknown>;
  revision?: number;
}

/** Safe issues must not disclose hidden source identities or distinguish missing from denied. */
export interface RelatedResolutionIssue {
  code: 'unavailable' | 'invalid-reference' | 'cardinality'
    | 'limit-exceeded' | 'unsupported-relation' | 'field-absent'
    | 'configuration-error' | 'source-read-failed';
  /** Zero-based position in the original relation reference array; scalars use 0. */
  referenceIndex?: number;
  /** Zero-based position in this entry's returned records array. */
  recordIndex?: number;
  /** RFC 6901 pointer relative to the source metadata. */
  fieldPointer?: string;
}

export interface RelatedMetadataEntry {
  status: RelatedResolutionStatus;
  records: RelatedMetadataRecord[];
  issues: RelatedResolutionIssue[];
}

export type RelatedMetadata = Record<string, RelatedMetadataEntry>;

export interface RelatedMetadataSelection {
  relationId: string;
  /** Default false. Required relations must be nonempty and complete. */
  required?: boolean;
}

/** Requests select trusted relations, never arbitrary projections or queries. */
export interface RelatedMetadataRequest {
  relations: RelatedMetadataSelection[];
}

/** Server-derived persistence target; never accept this declaration from a write request. */
export interface RelatedDisplayDescriptor {
  /** RFC 6901 pointer relative to metadata. */
  metadataPointer: string;
  relationId: string;
}

/** Server-derived browser source configuration, never trusted request input. */
export interface RelatedReferenceDescriptor {
  relationId: string;
  /** Tokens relative to root metadata. */
  referenceTokens: string[];
  /** Object identifier extraction; absent means scalar OIDs. */
  oidTokens?: string[];
}

/** Server-derived browser source configuration, never trusted request input. */
export interface RelatedSourceDescriptor extends RelatedReferenceDescriptor {
  /** Component lineage pointer used by the existing event bus. */
  componentPointer: string;
  required?: boolean;
  initialResult?: RelatedMetadataEntry;
  referenceFingerprint?: string;
}

/** Derived server bootstrap data. Absent on forms without related-record opt-ins. */
export interface RelatedFormDescriptors {
  displayTargets: RelatedDisplayDescriptor[];
  /** Activation references also cover targets without a rendered source component. */
  relations: RelatedReferenceDescriptor[];
  sources: RelatedSourceDescriptor[];
}
