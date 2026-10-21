/** Finite JSON values allowed in publication configuration, sealed inputs and evidence. @public */
export type PublicationJson = null | boolean | number | string | PublicationJson[] | PublicationObject;
/** String-keyed finite JSON object used at validated adapter boundaries.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationObject {
  [key: string]: PublicationJson;
}
/** Brand, record and destination coordinates supplied by the host.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationWorkKey {
  /** Brand whose protected source authority and configuration own this work. */
  brandId: string;
  /** Source record identity within the explicit brand. */
  oid: string;
  /** Stable named destination within the brand. */
  destinationId: string;
}
/** Historical requester/approver/creator or current persistence actor, kept as distinct roles.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationAttribution {
  username: string;
  userType: string;
  displayName?: string;
}
/** Immutable staged-source address and digest; retain it for reconciliation.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationSourceReference {
  encodingVersion: number;
  disk: string;
  key: string;
  digest: string;
}
/** Selected attachment logical identity; staging references are host-owned.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationAttachmentIdentity {
  id: string;
  logicalPath: string;
  size: number;
  staged?: PublicationSourceReference;
  /** Original local bytes may be reclaimed only after a verified staged recovery copy exists. */
  original?: { oid: string; fileId: string; digest: string };
}
/** Approved attachment byte identity backed by a digest or immutable storage version.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export type PublicationAttachment = PublicationAttachmentIdentity &
  ({ digest: string; immutableVersion?: string } | { digest?: string; immutableVersion: string });
/** Sealed source content, dependencies, fixed targets and deterministic generated values.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationSourceDescriptor {
  brandId: string;
  oid: string;
  requestId: string;
  encodingVersion: number;
  sourceRevision: number;
  metadata: PublicationObject;
  relatedInputs: PublicationObject;
  destinationIds: string[];
  targets: Record<string, string>;
  materialConfiguration: PublicationObject;
  crosswalkRevisions: Array<{ brandId: string; crosswalkId: string; revisionId: string }>;
  attachments: PublicationAttachment[];
  generatedValues: PublicationObject;
  adapterContracts: Record<string, { providerId: string; contractVersion: number; mappingContextVersion: number }>;
  managedFields: Record<string, string[]>;
}
/** Configured event authority with explicit revision approval or per-save auto-sync.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationSourcePolicy {
  id: string;
  version: number;
  mode: 'approval' | 'auto-sync';
  recordType: string;
  event: string;
  destinations: string[];
  grantCondition?: string;
  continuationCondition?: string;
}
/** Host-owned immutable grant scope and attribution; never construct it from posted hook options.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationApproval {
  id: string;
  epoch: number;
  sourceRevision: number;
  policy: PublicationSourcePolicy;
  destinationIds: string[];
  targetFingerprints: Record<string, string>;
  configurationDigests: Record<string, string>;
  source: PublicationSourceReference;
  requester: PublicationAttribution;
  approver: PublicationAttribution;
  creator?: PublicationAttribution;
  grantedAt: string;
  revokedAt?: string;
  /** Frozen at grant time. A later configuration rule cannot reinterpret an older request. */
  workflowRules?: import('../../configmodels/PublicationPublishing').PublicationWorkflowRule[];
}
/** Host-owned durable source/save/coordinator bookkeeping; not a hook grant interface. @internal */
export interface PublicationWorkflowDecision {
  id: string;
  sourceRevision: number;
  rule: import('../../configmodels/PublicationPublishing').PublicationWorkflowRule;
  approvals: Array<{ destinationId: string; approvalId: string; epoch: number; generation: number }>;
  status: 'started' | 'stage_applied' | 'completed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  reason?: string;
  /** Exact host-computed workflow fields, before hooks. Never arbitrary maintenance exemptions. */
  before: PublicationObject;
  after: PublicationObject;
}
/** Host-owned durable source/save/coordinator bookkeeping; not a hook grant interface. @internal */
export interface PublicationIntent {
  destinationId: string;
  generation: number;
  approvalId: string;
  approvalEpoch: number;
  sourceRevision: number;
  pending: boolean;
  requestedAt: string;
}
/** Host-owned durable source/save/coordinator bookkeeping; not a hook grant interface. @internal */
export interface PublicationSourceSave {
  token: string;
  outcome: 'initialising' | 'ready' | 'abandoned' | 'quarantined';
  intents: PublicationIntent[];
  requestedAt: string;
  sourceRevision: number;
  /** Conservative committed-record identity, independently verified by storage. */
  recordDigest: string;
  successfulSaveEvidence?: {
    id: string;
    recordedAt: string;
    sourceRevision: number;
    recordDigest: string;
  };
}
/** Host-owned durable source/save/coordinator bookkeeping; not a hook grant interface. @internal */
export interface PublicationSourceState {
  schemaVersion: 1;
  revision: number;
  /** Scan summaries maintained atomically with the protected state. */
  pending: boolean;
  initialising: boolean;
  approvals: PublicationApproval[];
  intents: Record<string, PublicationIntent>;
  saves: PublicationSourceSave[];
  preparationFailures?: PublicationPreparationFailure[];
  workflowDecisionId?: string;
  workflowDecision?: PublicationWorkflowDecision;
  contentReplacements?: PublicationContentReplacement[];
}
/** Exact host-validated attachment substitution, committed atomically with the record. @internal */
export interface PublicationContentReplacement {
  id: string;
  capability: 'attachment-to-url';
  receiptField: string;
  providerId: string;
  destinationId: string;
  sourceRevision: number;
  generation: number;
  approvalId: string;
  approvalEpoch: number;
  source: PublicationSourceReference;
  path: string;
  before: PublicationJson[];
  after: PublicationJson[];
  appliedAt: string;
}
/** Host-owned durable source/save/coordinator bookkeeping; not a hook grant interface. @internal */
export interface PublicationPreparationFailure {
  destinationId: string;
  policyId: string;
  sourceRevision: number;
  code: string;
  recordedAt: string;
}
/** Canonical provider resource identity, independent of destination labels.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationRemoteIdentity {
  /** Canonical actual resource namespace; never a destination or brand label. */
  namespace: string;
  objectId: string;
}
/** Exclusive managing ownership of a canonical remote object for a fixed target.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationBinding extends PublicationRemoteIdentity {
  targetFingerprint: string;
  evidence: PublicationObject;
}
/** Append-only mutation evidence; submitted, uncertain and uncheckpointed confirmations need reconciliation.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationOperation {
  id: string;
  kind: string;
  approvalId: string;
  approvalEpoch: number;
  sourceGeneration: number;
  intendedDigest: string;
  submittedAt: string;
  outcome: 'submitted' | 'uncertain' | 'not_applied' | 'confirmed' | 'rejected';
  evidence: PublicationObject;
  /** Host-owned transport key, persisted before send and immutable across resource owners; absent on legacy operations. */
  readonly idempotencyKey?: string;
  /** Host-frozen submission identity, also retained by shared-resource journals. Absent on legacy operations. */
  readonly identity?: PublicationOperationEvidence;
  /** Adapter-supplied proof for settlement; the host checks every identity field before accepting it. */
  confirmation?: PublicationOperationEvidence;
  /** Host-owned acknowledgement: confirmed evidence was incorporated by an explicit state checkpoint. */
  checkpointed?: boolean;
}
/** Structured provenance of a provider receipt/read-back for one exact journalled mutation.
 * Legacy operations use a deterministic correlation key; this does not assert that a key was sent remotely.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationOperationEvidence extends PublicationWorkKey {
  operationId: string;
  idempotencyKey: string;
  providerId: string;
  targetFingerprint: string;
  approvalId: string;
  approvalEpoch: number;
  sourceGeneration: number;
  intendedDigest: string;
  remote?: PublicationRemoteIdentity;
}
/** Provider-confirmed result for the exact approval epoch, source and remote binding.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationCompletionEvidence {
  /** Fresh structured proof for every confirmed journal operation used by this result. Required when any exist. */
  operations?: PublicationOperationEvidence[];
  approvalId: string;
  approvalEpoch: number;
  sourceGeneration: number;
  sourceDigest: string;
  confirmedAt: string;
  remote: PublicationRemoteIdentity;
  deposit: PublicationObject;
  ingestion: { state: 'not_required' | 'confirmed'; evidence: PublicationObject };
  visibility: 'verified' | 'unverified';
  accessible?: boolean;
  embargoed?: boolean;
}
/** Destination work lifecycle; historical completion does not complete newer content.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export type PublicationWorkStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'repair_required'
  | 'superseded'
  | 'revoked'
  | 'paused';
/** Typed adapter result; waiting does not consume a transport-failure attempt.
 * @public
 * @extensionPoint Implement or consume this adapter contract through PublicationService registration and host-supplied contexts.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export type PublicationProviderOutcome<State> =
  | {
      /** Provider-confirmed completion for this exact approved source. */
      kind: 'completed';
      /** Validated adapter checkpoint retained with the outcome. */
      state: State;
      /** Exact approval/source/binding and remote completion evidence. */
      evidence: PublicationCompletionEvidence;
      /** Safe destination links for current versus historical status. */
      links: Record<string, string>;
    }
  /** Omit nextCheckAt to use the host's configured observation interval. */
  | { kind: 'waiting'; state: State; reason: string; nextCheckAt?: number }
  | { kind: 'retryable_failure'; state: State; category: string; message: string; retryAfterMs?: number }
  | { kind: 'repair_required'; state: State; reason: string; evidence: PublicationObject };
/** Safe checkpoint-only status evidence; rendering must never contact a provider.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationObservation {
  deposit: 'confirmed' | 'unverified';
  publication: 'private' | 'pending' | 'published' | 'unverified';
  ingestion: 'confirmed' | 'pending' | 'not_required' | 'unverified';
  visibility: 'verified' | 'unverified';
  accessible?: boolean;
  embargoed?: boolean;
}
/** Destination-specific work summary with source identity and current or historical evidence.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationStatus extends PublicationWorkKey {
  providerId: string;
  displayName: string;
  status: PublicationWorkStatus;
  sourceRevision: number;
  sourceGeneration: number;
  approvalId?: string;
  waitingReason?: string;
  retryAt?: number;
  links: Record<string, string>;
  completion?: PublicationCompletionEvidence;
}
/** Safe local validation issue without credentials or private source values.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationValidationIssue {
  path: string;
  code: string;
  message: string;
}
/** Runtime narrowing result; rejected evidence remains available for investigation.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export type PublicationValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; issues: PublicationValidationIssue[] };
/** Provider-supported lifecycle and shared-resource capabilities.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationProviderCapabilities {
  synchronise: boolean;
  observe: boolean;
  reconcile: boolean;
  resourceLeases: boolean;
}
/** Local deterministic preparation input; credentials and remote mutations are unavailable.
 * @public
 * @extensionPoint Implement or consume this adapter contract through PublicationService registration and host-supplied contexts.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationSourcePreparation<Config> extends PublicationWorkKey {
  /** Validated destination configuration without resolved runtime credentials. */
  configuration: Config;
  /** Source record supplied by trusted save preparation. */
  record: PublicationObject;
  /** Verified save actor recorded separately from institutional approver. */
  requester: PublicationAttribution;
  /** Historical institutional approval attribution. */
  approver: PublicationAttribution;
  /** Values allocated once and reused to reproduce retries. Preparation may add non-secret
   * values under `<providerId>:<destinationId>:`; the host copies successful new allocations.
   * Existing allocations and host values cannot be replaced through this input.
   */
  generatedValues: PublicationObject;
}
/** Host-guarded execution context with sealed inputs and runtime-only credentials.
 * @public
 * @extensionPoint Implement or consume this adapter contract through PublicationService registration and host-supplied contexts.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationProviderExecution<Config, State, Prepared> extends PublicationWorkKey {
  /** Current validated destination, checked against approved material configuration. */
  configuration: Config;
  /** Resolved runtime-only secrets; never persist them in source or operation evidence. */
  credentials: PublicationObject;
  /** Validated adapter-owned provider checkpoint. */
  state: State;
  /** Validated sealed provider input; do not rebuild from mutable current metadata. */
  prepared: Prepared;
  /** Host-owned approval scope, epoch and historical attribution. */
  approval: PublicationApproval;
  /** Current destination generation guarded before every mutation. */
  sourceGeneration: number;
  /** Host-selected synchronization, observation or authorized maintenance obligation. */
  workKind: 'synchronise' | 'observe' | 'maintenance';
  /** Frozen descriptor associated with the current work. */
  source: PublicationSourceDescriptor;
  /** Retained historical sealed inputs for read-only reconciliation. */
  recoverySources: readonly PublicationSourceDescriptor[];
  /** Durable submitted/uncertain/confirmed operation evidence. */
  operations: readonly PublicationOperation[];
  /** Exclusive provider-defined remote object ownership, when established. */
  binding?: PublicationBinding;
  /** True in a read-only reconciliation context. */
  recovery: boolean;
  /** Current local persistence actor, distinct from historical attribution. */
  persistenceIdentity?: PublicationAttribution;
  /** Cancellation signal to pass into remote transports. */
  signal: AbortSignal;
  /** Recheck source, approval, configuration, access and ownership. */
  assertAuthority(): Promise<void>;
  /** Conditionally persist only frozen registered destination outputs. */
  project(fields: Record<string, PublicationJson>): Promise<void>;
  /** Atomically persist state and acknowledge the confirmed operation IDs incorporated into it. */
  checkpoint(state: State, operationIds?: readonly string[]): Promise<void>;
  /** Claim exclusive canonical remote identity under host checks. */
  bind(binding: PublicationBinding): Promise<void>;
  /** Retain an operation outcome only from provider-confirmed evidence. */
  journal(operation: PublicationOperation): Promise<void>;
  /** Open selected approved bytes through immutable-version or verified staging access. */
  openAttachment(id: string, logicalPath: string): Promise<import('node:stream').Readable>;
  /** Stable host key for the exact durable operation, also available during read-only recovery. */
  idempotencyKey(operation: PublicationOperation): string;
  /** Journal submission and assert current authority, then supply the same key to transport on every attempt. */
  mutate<Result>(operation: PublicationOperation, send: (idempotencyKey: string) => Promise<Result>): Promise<Result>;
  /** Own a canonical shared provider resource and reconcile its prior journal. */
  withResourceLease<Result>(
    namespace: string,
    resource: string,
    run: (context: PublicationResourceExecution) => Promise<Result>
  ): Promise<Result>;
  /** Record bounded safe summaries without payloads or credentials. */
  audit(summary: { category: string; message: string; evidence?: PublicationObject }): Promise<void>;
}
/** Read/reconcile journal for a shared provider resource under host ownership.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationResourceExecution {
  operations: readonly { work: PublicationWorkKey; operation: PublicationOperation }[];
  journal(operation: PublicationOperation): Promise<void>;
}
/** Authorized read-only provider repair context; cannot send provider mutations or project outputs.
 * @public
 * @extensionPoint Implement or consume this adapter contract through PublicationService registration and host-supplied contexts.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationRepairContext<
  Config = PublicationObject,
  State = PublicationObject,
> extends PublicationWorkKey {
  /** Validated fixed destination configuration for read-back. */
  configuration: Config;
  /** Copied validated provider state, retaining historical evidence. */
  state: State;
  /** Current exclusive remote binding, if one exists. */
  binding?: PublicationBinding;
  /** Retained operations requiring verified settlement or read-back. */
  operations: readonly PublicationOperation[];
  /** Historical migrations can retain operations without granting a sealed source approval. */
  source?: PublicationSourceReference | null;
  /** Explicit administrator-provided repair parameters and investigation references. */
  parameters: PublicationObject;
  /** Verified fixed target; a repair cannot redirect it. */
  targetFingerprint: string;
  /** Run adapter reconciliation with remote mutations and projections forbidden. */
  reconcile(): Promise<PublicationRepairResult<State>>;
  /** Own shared resources required for safe administrative read-back. */
  withResourceLease<Result>(
    namespace: string,
    resource: string,
    run: (context: PublicationResourceExecution) => Promise<Result>
  ): Promise<Result>;
}
/** Verified state/binding/journal corrections, retaining prior operation evidence.
 * @public
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationRepairResult<State = PublicationObject> {
  state: State;
  binding?: PublicationBinding;
  operations?: PublicationOperation[];
  /** Confirmed operations incorporated into the repaired state by verified read-back. */
  checkpointedOperationIds?: string[];
}
/** Advertised repair capability; supply run for an executable administrative repair.
 * @public
 * @extensionPoint Implement or consume this adapter contract through PublicationService registration and host-supplied contexts.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationRepair<Config = PublicationObject, State = PublicationObject> {
  /** Stable repair ID displayed by inspection and passed to the shared CLI. */
  id: string;
  /** Safe explanation of required operator evidence and supported correction. */
  description: string;
  /** Optional executable read-only verification; a description alone does not install a handler. */
  run?(context: PublicationRepairContext<Config, State>): Promise<PublicationRepairResult<State>>;
}
/** Provider identity, configuration/secrets and canonical target validation.
 * @public
 * @extensionPoint Implement or consume this adapter contract through PublicationService registration and host-supplied contexts.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationProviderDefinition<Config extends PublicationObject = PublicationObject> {
  /** Stable registered provider ID; bootstrap rejects duplicate registration. */
  readonly id: string;
  /** Source/adapter contract version included in approved content. Version 2 requires structured operation evidence; older versions are rejected at registration. */
  readonly contractVersion: number;
  /** Current version of adapter-owned durable provider state. */
  readonly stateVersion: number;
  /** Destination JSON Schema supplied to the existing AppConfig editor. */
  readonly configurationSchema: PublicationObject;
  /** Credential paths relative to one destination; supports single-key wildcards. */
  readonly secretPaths: readonly string[];
  /** Supported synchronisation, observation, reconciliation and resource ownership. */
  readonly capabilities: PublicationProviderCapabilities;
  /**
   * Declare how unknown remote submissions are resolved. Registration rejects a missing declaration.
   * `idempotency-key` adapters send the host key and reconcile by authoritative key lookup,
   * validating the exact target and intended mutation. Missing/conflicting lookup evidence cannot authorize a retry.
   * `no-remote-lookup` adapters retain unobservable submissions as repair_required and implement attestOperation
   * for externally receipted confirmation or certified non-application through the audited recovery CLI.
   * Exact provider-specific read-back recovery remains available in either mode.
   */
  readonly mutationRecovery: { readonly mode: 'idempotency-key' | 'no-remote-lookup' };
  /** Narrow unknown destination JSON locally without granting source authority. */
  validateConfiguration(value: unknown): PublicationValidationResult<Config>;
  /** Canonical non-secret identity of the actual fixed remote target. */
  targetFingerprint(configuration: Config): string;
}
/** Hook adapter registered before bootstrap; host owns authority, persistence, retries and workflow.
 * @public
 * @extensionPoint Implement or consume this adapter contract through PublicationService registration and host-supplied contexts.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationProvider<
  Config extends PublicationObject,
  State extends PublicationObject,
  Prepared extends PublicationObject,
> extends PublicationProviderDefinition<Config> {
  /** Validate unknown persisted state without discarding unsupported evidence. */
  decodeState(value: unknown, version: number): PublicationValidationResult<State>;
  /** Explicitly upgrade older state while retaining pending operation evidence. */
  upgradeState(value: unknown, fromVersion: number): PublicationValidationResult<State>;
  /** Pure safe projection of checkpointed evidence; never poll the remote provider. */
  summariseStatus?(state: State): PublicationObservation;
  /** Exact registered output paths eligible for guarded maintenance projections. */
  sourceMaintenancePaths?(configuration: Config): readonly string[];
  /** Narrow content mutation, available only to the host after confirmed completion. */
  postCompletionReplacement?: {
    readonly capability: 'attachment-to-url';
    readonly receiptField: string;
    path(configuration: Config): string | undefined;
    entries(state: State, approvalId: string, generation: number): PublicationJson[] | undefined;
  };
  /** Validate the reopened sealed provider input before execution. */
  decodePreparedSource(value: unknown): PublicationValidationResult<Prepared>;
  /** Prepare deterministic non-secret input locally, without provider mutation. */
  prepareSource(input: PublicationSourcePreparation<Config>): Promise<PublicationValidationResult<Prepared>>;
  /** Declare consumed dependencies, attachment identities and mapping versions. */
  describeSource?(
    input: PublicationSourcePreparation<Config>,
    prepared: Prepared
  ): Promise<PublicationProviderSourceInputs>;
  /** Read-only resolution of submitted/uncertain operations and uncheckpointed confirmed results. */
  reconcile(context: PublicationProviderExecution<Config, State, Prepared>): Promise<PublicationProviderOutcome<State>>;
  /** Execute the approved request through host guards and retained journals. */
  synchronise(
    context: PublicationProviderExecution<Config, State, Prepared>
  ): Promise<PublicationProviderOutcome<State>>;
  /** Read remote readiness without submitting a provider mutation. */
  observe(context: PublicationProviderExecution<Config, State, Prepared>): Promise<PublicationProviderOutcome<State>>;
  /** Declare shared resources that administrative verification must own. */
  administrativeResources?(configuration: Config): readonly { namespace: string; resourceKey: string }[];
  /** Validate operator receipts using the provider's exact evidence rules. Required without remote key lookup.
   * Called only by the host's audited, CAS-protected attest-operation CLI repair; it must not send mutations.
   */
  attestOperation?(context: PublicationRepairContext<Config, State>): Promise<PublicationRepairResult<State>>;
  /** Supported repair descriptions and optional executable read-only handlers. */
  readonly repairs: readonly PublicationRepair<Config, State>[];
}
/** Trusted local dependency/attachment declarations used to seal and revalidate source inputs.
 * @public
 * @extensionPoint Implement or consume this adapter contract through PublicationService registration and host-supplied contexts.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
 */
export interface PublicationProviderSourceInputs {
  /** Version of the provider mapping context included in source identity. */
  mappingContextVersion: number;
  /** Fields the approved plan manages remotely. */
  managedFields: string[];
  /** Version-labelled related record/person snapshots consumed by mapping. */
  relatedInputs: Record<string, import('./source').PublicationSnapshot>;
  /** Trusted readers and byte identities of selected source attachments. */
  attachments: import('./staging').PublicationAttachmentSource[];
  /** Resolve and seal approved crosswalk revision/content references. */
  resolveCrosswalk: import('./source').PublicationPreparationInput['resolveCrosswalk'];
}
