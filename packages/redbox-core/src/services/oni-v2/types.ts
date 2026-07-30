import type {
  OniPublishingConfigData,
  OniPublishingSiteConfig,
  OniSiteStorageConfig,
} from '../../configmodels/OniPublishing';
import type { Readable } from 'node:stream';

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
  ensureRootCollection(config: ResolvedOniPublishingConfigData, site?: OniPublishingSiteConfig): Promise<void>;
  writeDatasetObject(crate: OniCrateBuildResult, input: OniPublishInput): Promise<void>;
}

export interface OcflStorageConfig {
  root: string;
  workspace: string;
  ocflVersion: string;
  layout: {
    extensionName: string;
  };
}

export interface OcflModuleAdapter {
  Ocfl: new (
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

export interface OcflTransactionAdapter {
  write(
    logicalPath: string,
    data: string | Uint8Array | Readable,
    options?: Record<string, unknown> | string
  ): Promise<void>;
}
