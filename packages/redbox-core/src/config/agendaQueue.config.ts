/**
 * Agenda Queue Config Interface
 * (sails.config.agendaQueue)
 * 
 * Agenda job queue configuration.
 */

export interface AgendaJobSchedule {
    method: 'every' | 'schedule' | 'now';
    intervalOrSchedule?: string;
    data?: unknown;
    opts?: {
        timezone?: string;
        skipImmediate?: boolean;
        forkMode?: boolean;
    };
}

export type AgendaQueueBackend = 'mongodb' | 'sqs';

const AGENDA_QUEUE_BACKENDS: AgendaQueueBackend[] = ['mongodb', 'sqs'];

export function parseAgendaQueueBackend(value: string | undefined, source = 'agendaQueue.options.backend'): AgendaQueueBackend | undefined {
    if (typeof value === 'undefined') {
        return undefined;
    }
    if ((AGENDA_QUEUE_BACKENDS as string[]).includes(value)) {
        return value as AgendaQueueBackend;
    }
    throw new Error(`Invalid ${source} value '${value}'. Expected one of: ${AGENDA_QUEUE_BACKENDS.join(', ')}.`);
}

export interface AgendaQueueSqsOptions {
    queueUrl: string;
    region?: string;
    endpoint?: string;
    queueType?: 'standard' | 'fifo';
    waitTimeSeconds?: number;
    visibilityTimeout?: number;
    fifoMessageGroupIdStrategy?: 'jobName' | 'fixed';
    fifoMessageGroupId?: string;
    maxMessagesPerPoll?: number;
}

export interface AgendaJobOptions {
    /** Lock lifetime in milliseconds */
    lockLifetime?: number;
    /** Maximum number of locks */
    lockLimit?: number;
    /** Number of concurrent jobs */
    concurrency?: number;
    /** Priority level */
    priority?: 'lowest' | 'low' | 'normal' | 'high' | 'highest' | number;
}

export interface AgendaJobConfig {
    /** Function to execute: 'service.method' format */
    fnName: string;
    /** Queue backend override */
    backend?: AgendaQueueBackend;
    /** Job options */
    options?: AgendaJobOptions;
    /** Schedule configuration */
    schedule?: AgendaJobSchedule;
}

export interface AgendaJobDefinition extends AgendaJobConfig {
    /** Unique job name */
    name: string;
}

export type AgendaJobsConfig = Record<string, AgendaJobConfig>;

export interface AgendaQueueOptions {
    /** Default backend for jobs without an override */
    backend?: AgendaQueueBackend;
    /** MongoDB connection string */
    db?: string;
    /** MongoDB collection name */
    collection?: string;
    /** Default lock lifetime */
    defaultLockLifetime?: number;
    /** Process every interval */
    processEvery?: string;
    /** SQS backend configuration */
    sqs?: AgendaQueueSqsOptions;
}

export interface AgendaQueueConfig {
    /** Agenda options */
    options?: AgendaQueueOptions;
    /** Job definitions, keyed by unique job name */
    jobs: AgendaJobsConfig;
}

export const agendaQueue: AgendaQueueConfig = {
    options: {
        backend: parseAgendaQueueBackend(process.env['sails__agendaQueue_options_backend'], 'sails__agendaQueue_options_backend') ?? 'mongodb',
        db: process.env['sails__agendaQueue_options_db'] ?? '',
        collection: process.env['sails__agendaQueue_options_collection'] ?? 'agendaJobs',
        processEvery: process.env['sails__agendaQueue_options_processEvery'] ?? '5 seconds',
    },
    jobs: {
        'SolrSearchService-CreateOrUpdateIndex': {
            fnName: 'solrsearchservice.solrAddOrUpdate',
            options: {
                lockLifetime: 3 * 1000,
                lockLimit: 1,
                concurrency: 1
            }
        },
        'SolrSearchService-DeleteFromIndex': {
            fnName: 'solrsearchservice.solrDelete',
            options: {
                lockLifetime: 3 * 1000,
                lockLimit: 1,
                concurrency: 1
            }
        },
        'RecordsService-StoreRecordAudit': {
            fnName: 'recordsservice.storeRecordAudit',
            options: {
                lockLifetime: 30 * 1000,
                lockLimit: 1,
                concurrency: 1
            }
        },
        'IntegrationAuditService-StoreIntegrationAudit': {
            fnName: 'integrationauditservice.storeIntegrationAudit',
            options: {
                lockLifetime: 30 * 1000,
                lockLimit: 1,
                concurrency: 1
            }
        },
        'IntegrationNotificationService-Dispatch': {
            fnName: 'integrationnotificationservice.dispatch',
            options: { lockLifetime: 30000, lockLimit: 1, concurrency: 1 }
        },
        'RaidMintRetryJob': {
            fnName: 'raidservice.mintRetryJob',

        },
        'MoveCompletedJobsToHistory': {
            fnName: 'agendaqueueservice.moveCompletedJobsToHistory',
            schedule: {
                method: 'every',
                intervalOrSchedule: '5 minutes'
            }
        },
        'Figshare-PublishAfterUpload-Service': {
            fnName: 'figshareservice.publishAfterUploadFilesJob',
            options: {
                lockLifetime: 120 * 1000,
                lockLimit: 1,
                concurrency: 1
            }
        },
        'Figshare-UploadedFilesCleanup-Service': {
            fnName: 'figshareservice.deleteFilesFromRedbox',
            options: {
                lockLifetime: 120 * 1000,
                lockLimit: 1,
                concurrency: 1
            }
        }
    }
};
