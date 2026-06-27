import type {
  OniPublishingConfigData,
  OniPublishingSiteConfig,
  OniSiteStorageConfig,
} from '../../configmodels/OniPublishing';

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
  ensureRootCollection(config: ResolvedOniPublishingConfigData, site: OniPublishingSiteConfig): Promise<void>;
  writeDatasetObject(crate: OniCrateBuildResult, input: OniPublishInput): Promise<void>;
}

export interface StorageManagerLike {
  bootstrap?: () => Promise<void>;
  isBootstrapped?: () => boolean;
  disk: (name: string) => StorageDiskLike;
}

export interface StorageDiskLike {
  exists(key: string): Promise<boolean>;
  get(key: string): Promise<string>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  getBytes(key: string): Promise<Uint8Array>;
  getMetaData(
    key: string
  ): Promise<{ contentType?: string; contentLength: number; etag?: string; lastModified?: Date }>;
  put(
    key: string,
    contents: string | Uint8Array | NodeJS.ReadableStream,
    options?: Record<string, unknown>
  ): Promise<void>;
  putStream(key: string, contents: NodeJS.ReadableStream, options?: Record<string, unknown>): Promise<void>;
  copy(source: string, destination: string, options?: Record<string, unknown>): Promise<void>;
  move(source: string, destination: string, options?: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<void>;
  deleteAll(prefix?: string): Promise<void>;
  listAll(
    prefix?: string,
    options?: { recursive?: boolean; paginationToken?: string }
  ): Promise<{
    paginationToken?: string;
    objects: Iterable<unknown>;
  }>;
}

export interface DatastreamResponse {
  readstream?: NodeJS.ReadableStream;
  body?: string | Uint8Array;
  size?: number;
}

export interface DatastreamServiceLike {
  getDatastream(oid: string, fileId: string): Promise<DatastreamResponse>;
}

export interface OcflStorageConfig {
  root: string;
  workspace: string;
  ocflVersion: string;
  layout: {
    extensionName: string;
  };
}

export interface OcflModuleLike {
  Ocfl: new (
    storeClass: unknown,
    storeOptions: Record<string, unknown>
  ) => {
    storage(config: OcflStorageConfig, storeOptions: Record<string, unknown>): OcflStorageLike;
  };
  OcflStore: new (options: Record<string, unknown>) => object;
}

export interface OcflStorageLike {
  load(): Promise<void>;
  create(options?: Record<string, unknown>): Promise<void>;
  object(id: string): OcflObjectLike;
}

export interface OcflObjectLike {
  load(): Promise<void>;
  update(updater: (transaction: OcflTransactionLike) => Promise<void>, mode?: 'MERGE' | 'REPLACE'): Promise<void>;
}

export interface OcflTransactionLike {
  write(
    logicalPath: string,
    data: string | Uint8Array | NodeJS.ReadableStream,
    options?: Record<string, unknown> | string
  ): Promise<void>;
}
