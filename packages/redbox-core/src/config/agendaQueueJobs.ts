import type { AgendaJobsConfig } from './agendaQueue.config';

export const RECORD_POST_COMMIT_RECONCILIATION_JOB_NAME = 'RecordsService-ReconcilePostCommitSave';

/** Daily orphan reconciliation for content-addressed brand typeface assets (design.md section 12). */
export const BRANDING_TYPEFACE_RECONCILE_JOB_NAME = 'BrandingTypefaceService-ReconcileAssets';

/** Offline job data. The host binds handlers and environment values explicitly. */
export const agendaQueueDefaultJobs: AgendaJobsConfig = {
  'SolrSearchService-CreateOrUpdateIndex': {
    fnName: 'solrsearchservice.solrAddOrUpdate',
    options: {
      lockLifetime: 3 * 1000,
      lockLimit: 1,
      concurrency: 1,
    },
  },
  'SolrSearchService-DeleteFromIndex': {
    fnName: 'solrsearchservice.solrDelete',
    options: {
      lockLifetime: 3 * 1000,
      lockLimit: 1,
      concurrency: 1,
    },
  },
  'RecordsService-StoreRecordAudit': {
    fnName: 'recordsservice.storeRecordAudit',
    options: {
      lockLifetime: 30 * 1000,
      lockLimit: 1,
      concurrency: 1,
    },
  },
  [RECORD_POST_COMMIT_RECONCILIATION_JOB_NAME]: {
    fnName: 'recordsservice.reconcilePostCommitSave',
    options: {
      lockLifetime: 30 * 1000,
      lockLimit: 1,
      concurrency: 1,
    },
  },
  'IntegrationAuditService-StoreIntegrationAudit': {
    fnName: 'integrationauditservice.storeIntegrationAudit',
    options: {
      lockLifetime: 30 * 1000,
      lockLimit: 1,
      concurrency: 1,
    },
  },
  'IntegrationNotificationService-Dispatch': {
    fnName: 'integrationnotificationservice.dispatch',
    options: { lockLifetime: 30000, lockLimit: 1, concurrency: 1 },
  },
  'SecurityEventService-StoreSecurityEvent': {
    fnName: 'securityeventservice.storeSecurityEvent',
    options: { lockLifetime: 30000, lockLimit: 1, concurrency: 1 },
  },
  'SiemForwardingService-ForwardSecurityEvents': {
    fnName: 'siemforwardingservice.forwardSecurityEvents',
    options: { lockLifetime: 120000, lockLimit: 1, concurrency: 1 },
  },
  'SiemForwardingService-RetryFailedDeliveries': {
    fnName: 'siemforwardingservice.retryFailedDeliveries',
    options: { lockLifetime: 120000, lockLimit: 1, concurrency: 1 },
    schedule: { method: 'every', intervalOrSchedule: '1 minute' },
  },
  RaidMintRetryJob: {
    fnName: 'raidservice.mintRetryJob',
  },
  MoveCompletedJobsToHistory: {
    fnName: 'agendaqueueservice.moveCompletedJobsToHistory',
    schedule: {
      method: 'every',
      intervalOrSchedule: '5 minutes',
    },
  },
  'Figshare-SyncRecord': {
    fnName: 'figshareservice.syncRecordJob',
    options: { concurrency: 4, lockLimit: 4, lockLifetime: 120000 },
  },
  'Figshare-Dispatch': {
    fnName: 'figshareservice.dispatchSyncJob',
    backend: 'mongodb',
    schedule: { method: 'every', intervalOrSchedule: '30 seconds' },
    options: { concurrency: 1, lockLimit: 1, lockLifetime: 120000 },
  },
  'Figshare-PublishAfterUpload-Service': {
    fnName: 'figshareservice.publishAfterUploadFilesJob',
    options: {
      lockLifetime: 120 * 1000,
      lockLimit: 1,
      concurrency: 1,
    },
  },
  'Figshare-UploadedFilesCleanup-Service': {
    fnName: 'figshareservice.deleteFilesFromRedbox',
    options: {
      lockLifetime: 120 * 1000,
      lockLimit: 1,
      concurrency: 1,
    },
  },
  [BRANDING_TYPEFACE_RECONCILE_JOB_NAME]: {
    fnName: 'brandingtypefaceservice.reconcileAssets',
    backend: 'mongodb',
    options: {
      lockLifetime: 10 * 60 * 1000,
      lockLimit: 1,
      concurrency: 1,
    },
    schedule: {
      method: 'every',
      intervalOrSchedule: '1 day',
      opts: {
        skipImmediate: true,
      },
    },
  },
};
