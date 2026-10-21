import type { PublicationObject } from '../publication/contracts';

/**
 * Stable provider-owned target identity; URI and opaque values remain strings.
 * @extensionPoint Use through PublicationVocabularyService and provider mapping adapters.
 * @remarks Stage 2 conversion and administration require separate forward-only release acceptance.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Vocabularies
 */
export interface PublicationTargetTerm {
  /** Permanent identity; converted legacy IDs remain unchanged. */
  id: string;
  /** Provider-owned namespace separating otherwise identical target values. */
  namespace: string;
  /** String value emitted to the provider; no numeric coercion is performed here. */
  value: string;
  /** Provider catalogue code, or the source catalogue identity for a crosswalk. */
  sourceId: string;
  /** Human-readable label retained in each frozen revision. */
  label: string;
  /** Namespaced parent target identity within this catalogue. */
  parentId?: string;
  /** Whether this term may be selected for a new mapping. */
  selectable: boolean;
  /** Whether the term was retired upstream; frozen approvals retain it. */
  historical: boolean;
  /** ISO timestamp when this target first entered the catalogue. */
  firstSeenAt: string;
  /** ISO timestamp of the latest import containing this target. */
  lastSeenAt: string;
  /** Non-secret provenance retained for operator audit and compatibility. */
  evidence?: PublicationObject;
}
/**
 * Brand-scoped imported catalogue with retained term and import history.
 * @extensionPoint Use through PublicationVocabularyService and provider mapping adapters.
 * @remarks Stage 2 conversion and administration require separate forward-only release acceptance.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Vocabularies
 */
export interface PublicationVocabularySource {
  /** Persisted document contract version; unknown versions require a forward upgrade. */
  schemaVersion: 1;
  /** Explicit owning brand; resolution and administration enforce this boundary. */
  brandId: string;
  /** Permanent identity; converted legacy IDs remain unchanged. */
  id: string;
  /** Registered source-provider identifier; generic imports cannot impersonate Figshare. */
  provider: string;
  /** Provider scope, such as account or public; scopes have distinct identities. */
  scope: string;
  /** Provider catalogue identifier within its scope. */
  catalogueId: string;
  /** Provider-owned namespace separating otherwise identical target values. */
  namespace: string;
  /** Administrator-facing catalogue name. */
  displayName: string;
  /** Optimistic concurrency version; stale editors cannot overwrite newer evidence. */
  version: number;
  /** Prevents new catalogue selection while retaining history and explicit pins. */
  archived: boolean;
  /** Current and historical targets with permanent namespaced identities. */
  terms: PublicationTargetTerm[];
  /** Original import identities, actors, timestamps, digests and non-secret provenance. */
  imports: Array<{ id: string; at: string; actor: string; digest: string; evidence?: PublicationObject }>;
  /** Original converted document retained as immutable compatibility evidence. */
  legacy?: PublicationObject;
}
/**
 * Local code aliases sealed into an approved mapping revision.
 * @extensionPoint Use through PublicationVocabularyService and provider mapping adapters.
 * @remarks Stage 2 conversion and administration require separate forward-only release acceptance.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Vocabularies
 */
export interface PublicationVocabularyEntry {
  /** Permanent identity; converted legacy IDs remain unchanged. */
  id: string;
  /** Local code aliases used when resolving this approved revision. */
  codes: string[];
  /** Human-readable label retained in each frozen revision. */
  label: string;
  /** String value emitted to the provider; no numeric coercion is performed here. */
  value: string;
}
/**
 * Mapping edge retaining its own identity, attribution and audit evidence.
 * @extensionPoint Use through PublicationVocabularyService and provider mapping adapters.
 * @remarks Stage 2 conversion and administration require separate forward-only release acceptance.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Vocabularies
 */
export interface PublicationCrosswalkMapping {
  /** Permanent identity; converted legacy IDs remain unchanged. */
  id: string;
  /** Identity of the local entry at this edge. */
  localEntryId: string;
  /** Namespaced target identity at this edge. */
  targetId: string;
  /** Draft or approved lifecycle state; rejected edges do not grant a mapping. */
  status: 'proposed' | 'approved' | 'rejected';
  /** Origin of the match, for example a reviewed manual mapping. */
  matchType: string;
  /** Original approval timestamp; later conversion does not replace it. */
  approvedAt?: string;
  /** Original approver identity, retained even after that person departs. */
  approvedBy?: string;
  /** Non-secret provenance retained for operator audit and compatibility. */
  evidence?: PublicationObject;
}
/**
 * Immutable approval snapshot of codes, targets, mappings and audit references.
 * @extensionPoint Use through PublicationVocabularyService and provider mapping adapters.
 * @remarks Stage 2 conversion and administration require separate forward-only release acceptance.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Vocabularies
 */
export interface PublicationCrosswalkRevision {
  /** Mapping revision number; approved content is immutable. */
  revision: number;
  /** Mapping edges belonging to this exact revision. */
  mappings: PublicationCrosswalkMapping[];
  /** Local entries and aliases sealed with this revision. */
  entries: PublicationVocabularyEntry[];
  /** Target descriptions and history sealed with this revision. */
  targets: PublicationTargetTerm[];
  /** Original approval timestamp; later conversion does not replace it. */
  approvedAt?: string;
  /** Original approver identity, retained even after that person departs. */
  approvedBy?: string;
  /** Canonical content digest of the immutable revision. */
  digest: string;
  /** Retained import or mapping evidence identifiers supporting this revision. */
  auditReferences: string[];
}
/**
 * Versioned crosswalk with separate working and approved revision pointers.
 * @extensionPoint Use through PublicationVocabularyService and provider mapping adapters.
 * @remarks Stage 2 conversion and administration require separate forward-only release acceptance.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Vocabularies
 */
export interface PublicationVocabularyCrosswalk {
  /** Persisted document contract version; unknown versions require a forward upgrade. */
  schemaVersion: 1;
  /** Explicit owning brand; resolution and administration enforce this boundary. */
  brandId: string;
  /** Permanent identity; converted legacy IDs remain unchanged. */
  id: string;
  /** Administrator-facing crosswalk name. */
  name: string;
  /** Provider catalogue code, or the source catalogue identity for a crosswalk. */
  sourceId: string;
  /** Brand-owned vocabulary supplying the local entries. */
  localVocabularyId: string;
  /** Exact case-preserving codes or the retained Figshare normalization contract. */
  normalizer: 'figshare-code-v1' | 'exact-v1';
  /** Optimistic concurrency version; stale editors cannot overwrite newer evidence. */
  version: number;
  /** Draft or approved lifecycle state; rejected edges do not grant a mapping. */
  status: 'draft' | 'approved' | 'archived';
  /** Current editable draft revision; may follow the latest approval. */
  workingRevision: number;
  /** Latest approved revision pointer, independent of the working draft. */
  approvedRevision?: number;
  /** Actor responsible for the latest working crosswalk change. */
  updatedBy: string;
  /** Retained immutable approvals and current draft content. */
  revisions: PublicationCrosswalkRevision[];
  /** Original converted document retained as immutable compatibility evidence. */
  legacy?: PublicationObject;
}
/**
 * Mapping result with explicit revision identity and historical-target evidence.
 * @extensionPoint Use through PublicationVocabularyService and provider mapping adapters.
 * @remarks Stage 2 conversion and administration require separate forward-only release acceptance.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Vocabularies
 */
export interface PublicationVocabularyResolution {
  /** Permanent brand-local crosswalk identity. */
  crosswalkId: string;
  /** Mapping revision number; approved content is immutable. */
  revision: number;
  /** Digest of the exact revision used for this result. */
  revisionDigest: string;
  /** Input codes after the crosswalk-specific normalization policy. */
  normalizedCodes: string[];
  /** Unique string results in the requested output representation. */
  values: string[];
  /** Successful code-to-target matches with the resolved target descriptions. */
  matches: Array<{ code: string; target: PublicationTargetTerm }>;
  /** Codes without an approved selectable match. */
  unresolvedCodes: string[];
  /** Matches to retired targets, distinct from current selectable matches. */
  historicalTargets: Array<{ code: string; target: PublicationTargetTerm }>;
}
/**
 * Brand-scoped resolution request; an explicit revision pins original approval content.
 * @extensionPoint Use through PublicationVocabularyService and provider mapping adapters.
 * @remarks Stage 2 conversion and administration require separate forward-only release acceptance.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Vocabularies
 */
export interface PublicationVocabularyResolveInput {
  /** Explicit owning brand; resolution and administration enforce this boundary. */
  brandId: string;
  /** Permanent brand-local crosswalk identity. */
  crosswalkId: string;
  /** Required owning local vocabulary identity; mismatched crosswalks are refused. */
  sourceVocabularyId: string;
  /** Local code aliases used when resolving this approved revision. */
  codes: string[];
  /** Requested string representation; Figshare numeric conversion occurs at its adapter. */
  outputs?: 'targetId' | 'value' | 'sourceId' | 'label';
  /** An explicit pin always reads this immutable approval, even after archival or a newer approval. */
  revision?: number;
}
/**
 * Current brand administrator identity supplied by a trusted application boundary.
 * @extensionPoint Use through PublicationVocabularyService and provider mapping adapters.
 * @remarks Stage 2 conversion and administration require separate forward-only release acceptance.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Vocabularies
 */
export interface PublicationVocabularyActor {
  /** Explicit owning brand; resolution and administration enforce this boundary. */
  brandId: string;
  /** Current administrator username; authorization is rechecked at the service boundary. */
  userId: string;
}
/**
 * Reviewed provider-neutral catalogue snapshot with idempotent import identity.
 * @extensionPoint Use through PublicationVocabularyService and provider mapping adapters.
 * @remarks Stage 2 conversion and administration require separate forward-only release acceptance.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Shared-Publication-Vocabularies
 */
export interface PublicationSourceImport {
  /** Permanent identity; converted legacy IDs remain unchanged. */
  id?: string;
  /** Registered source-provider identifier; generic imports cannot impersonate Figshare. */
  provider: string;
  /** Provider scope, such as account or public; scopes have distinct identities. */
  scope: string;
  /** Provider catalogue identifier within its scope. */
  catalogueId: string;
  /** Provider-owned namespace separating otherwise identical target values. */
  namespace: string;
  /** Administrator-facing catalogue name. */
  displayName: string;
  /** Current catalogue version required when replacing an existing snapshot. */
  expectedVersion?: number;
  /** Import identity is idempotent and must change when the reviewed snapshot changes. */
  importId: string;
  /** Current and historical targets with permanent namespaced identities. */
  terms: Array<Omit<PublicationTargetTerm, 'firstSeenAt' | 'lastSeenAt' | 'historical'>>;
}
export class PublicationVocabularyError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}
/** Sails application entry points can supply environment configuration as strings. */
export function isPublicationVocabularyAdministrationEnabled(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}
export function targetIdentity(namespace: string, value: string): string {
  if (!namespace.trim() || !value.trim())
    throw new PublicationVocabularyError('Target namespace and value are required');
  return `${encodeURIComponent(namespace)}:${encodeURIComponent(value)}`;
}
