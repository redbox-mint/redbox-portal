import type {
  OniPublishingConfigData,
  OniPublishingSiteConfig,
  OniSiteStorageConfig,
} from '../../configmodels/OniPublishing';
import type { ReadableStream } from 'node:stream/web';

export type AnyRecord = Record<string, unknown>;

export interface OniRecordModel extends AnyRecord {
  redboxOid?: string;
  id?: string;
  branding?: string;
  metaMetadata?: {
    brandId?: string;
    createdBy?: string;
    createdOn?: string;
  };
  metadata: AnyRecord;
}

export interface OniUserModel extends AnyRecord {
  email?: string;
  username?: string;
  name?: string;
}

export interface OniRunContext {
  recordOid: string;
  brandId: string;
  brandName: string;
  siteName: string;
  correlationId: string;
  triggerSource: string;
}

export interface ResolvedOniPublishingConfigData extends OniPublishingConfigData {
  sites: Record<string, OniPublishingSiteConfig>;
}

export interface OniAttachment {
  fileId: string;
  name: string;
  logicalPath: string;
  source: AnyRecord;
  encodingFormat?: string | false;
}

export interface OniCrateBuildInput {
  /** A previously issued citation remains stable on the shared publication path. */
  datasetUrl?: string;
  /** Sealed requests allocate this once; legacy callers retain the current clock. */
  publicationTimestamp?: string;
  config: ResolvedOniPublishingConfigData;
  site: OniPublishingSiteConfig;
  siteName: string;
  oid: string;
  record: OniRecordModel;
  creator: OniUserModel;
  approver: OniUserModel;
}

export interface OniCrateBuildResult {
  datasetUrl: string;
  rootId: string;
  rootCollectionId: string;
  dataRecordOid: string;
  attachments: OniAttachment[];
  crateJson: AnyRecord;
}

export interface OniPublishInput {
  oid: string;
  record: OniRecordModel;
  options: AnyRecord;
  user: OniUserModel;
  creator: OniUserModel;
}

export interface OniPublishResult extends OniCrateBuildResult {
  siteName: string;
  storageDriver: OniSiteStorageConfig['driver'];
}

export interface OniOcflRepository {
  ensureStorageRoot(): Promise<void>;
  ensureRootCollection(config: ResolvedOniPublishingConfigData, site?: OniPublishingSiteConfig): Promise<void>;
  writeDatasetObject(crate: OniCrateBuildResult, input: OniPublishInput): Promise<void>;
}

/** Read-only recovery is separate so existing repository overrides keep their write contract. */
export interface OniOcflRecoveryRepository extends OniOcflRepository {
  /** Verify a valid root or positively empty root/workspace; unreadable or partial roots throw. */
  inspectStorageRoot?(): Promise<'present' | 'absent'>;
  readObject(objectId: string): Promise<OniOcflObjectEvidence>;
  reconcileCommit(input: OniOcflCommitExpectation): Promise<OniOcflCommitResolution>;
  /** Positive same-process receipt only; absent after a process interruption. */
  writerQuiesced?(): Promise<boolean>;
}

export interface OniOcflContentFile {
  logicalPath: string;
  size: number;
  sha256: string;
}

/** Exact serialized crate bytes and every selected attachment, including paths and sizes. */
export interface OniOcflDesiredContent {
  schemaVersion: 1;
  metadataLogicalPath: string;
  files: OniOcflContentFile[];
  digest: string;
}

export type OniOcflObjectEvidence = {
  schemaVersion: 1;
  objectId: string;
  /** Configuration scope; PUB-11 must also verify the actual canonical repository target. */
  storageIdentity: string;
} & (
  | {
      kind: 'absent';
    }
  | {
      kind: 'present';
      head: string;
      inventoryDigest: string;
      /** SHA-256 of the exact, sidecar-verified inventory bytes for each version. */
      versionInventoryDigests: Record<string, string>;
      content: OniOcflDesiredContent;
    }
);

export interface OniOcflCommitExpectation {
  prior: OniOcflObjectEvidence;
  desired: OniOcflDesiredContent;
  /**
   * Positive external evidence that ALL prior writer I/O has stopped. A timeout,
   * lease expiry or rejected Promise alone does not establish this precondition.
   * Required for non-application, never inferred by the OCFL reader.
   */
  priorWriterQuiesced: boolean;
}

export type OniOcflCommitResolution =
  | { kind: 'confirmed'; evidence: OniOcflObjectEvidence & { kind: 'present' } }
  | { kind: 'not_applied'; evidence: OniOcflObjectEvidence }
  | {
      kind: 'repair_required';
      reason: 'unreadable_evidence' | 'unexpected_head' | 'writer_not_quiesced' | 'invalid_expectation';
      evidence?: OniOcflObjectEvidence;
    };

export interface OcflStorageConfig {
  root: string;
  workspace: string;
  ocflVersion: string;
  layout: {
    extensionName: string;
  };
}

export interface OcflModuleAdapter {
  Ocfl?: new (
    storeClass: unknown,
    storeOptions: Record<string, unknown>
  ) => {
    storage(config: OcflStorageConfig, storeOptions: Record<string, unknown>): OcflStorageAdapter;
  };
  implementOcfl?: (
    storeClass: unknown,
    storeOptions: Record<string, unknown>
  ) => {
    storage(config: OcflStorageConfig, storeOptions: Record<string, unknown>): OcflStorageAdapter;
  };
  OcflStore: new (options: Record<string, unknown>) => object;
}

export interface OcflStorageAdapter {
  load(): Promise<void>;
  create(options?: Record<string, unknown>): Promise<void>;
  object(id: string): OcflObjectAdapter;
}

export interface OcflObjectAdapter {
  load(): Promise<void>;
  update(updater: (transaction: OcflTransactionAdapter) => Promise<void>, mode?: 'MERGE' | 'REPLACE'): Promise<void>;
}

/** Public @ocfl/ocfl 0.4.0 reads only; no underscored members or cached internals. */
export interface OcflObjectReader extends OcflObjectAdapter {
  readonly root: string;
  readonly workspace?: string;
  getInventory(version?: string): Promise<{ toJSON(): unknown } | undefined>;
  readFile(relativePath: string, options?: string): Promise<string | Uint8Array>;
  getFile(logicalPath: string, version?: string): { stream(): Promise<ReadableStream<Uint8Array>> } | undefined;
}

export interface OcflTransactionAdapter {
  write(
    logicalPath: string,
    data: string | Uint8Array | ReadableStream<Uint8Array>,
    options?: Record<string, unknown> | string
  ): Promise<void>;
}
