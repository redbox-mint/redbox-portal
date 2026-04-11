/**
 * Agenda Queue Config Interface
 * (sails.config.agendaQueue)
 * 
 * Agenda job queue configuration.
 */

export interface AgendaJobSchedule {
    method: 'every' | 'schedule' | 'now';
    intervalOrSchedule: string;
    data?: unknown;
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

export interface AgendaJobDefinition {
    /** Unique job name */
    name: string;
    /** Function to execute: 'service.method' format */
    fnName: string;
    /** Job options */
    options?: AgendaJobOptions;
    /** Schedule configuration */
    schedule?: AgendaJobSchedule;
}

export interface AgendaQueueOptions {
    /** MongoDB connection string */
    db?: string;
    /** MongoDB collection name */
    collection?: string;
    /** Default lock lifetime */
    defaultLockLifetime?: number;
    /** Process every interval */
    processEvery?: string;
}

export interface AgendaQueueConfig {
    /** Agenda options */
    options?: AgendaQueueOptions;
    /** Job definitions */
    jobs: AgendaJobDefinition[];
}

export const agendaQueue: AgendaQueueConfig = {
    jobs: [
        {
            name: 'SolrSearchService-CreateOrUpdateIndex',
            fnName: 'solrsearchservice.solrAddOrUpdate',
            options: {
                lockLifetime: 3 * 1000,
                lockLimit: 1,
                concurrency: 1
            }
        },
        {
            name: 'SolrSearchService-DeleteFromIndex',
            fnName: 'solrsearchservice.solrDelete',
            options: {
                lockLifetime: 3 * 1000,
                lockLimit: 1,
                concurrency: 1
            }
        },
        {
            name: 'RecordsService-StoreRecordAudit',
            fnName: 'recordsservice.storeRecordAudit',
            options: {
                lockLifetime: 30 * 1000,
                lockLimit: 1,
                concurrency: 1
            }
        },
        {
            name: 'RaidMintRetryJob',
            fnName: 'raidservice.mintRetryJob'
        },
        {
            name: 'MoveCompletedJobsToHistory',
            fnName: 'agendaqueueservice.moveCompletedJobsToHistory',
            schedule: {
                method: 'every',
                intervalOrSchedule: '5 minutes'
            }
        },
        {
            name: 'Figshare-PublishAfterUpload-Service',
            fnName: 'figshareservice.publishAfterUploadFilesJob',
            options: {
                lockLifetime: 120 * 1000,
                lockLimit: 1,
                concurrency: 1
            }
        },
        {
            name: 'Figshare-UploadedFilesCleanup-Service',
            fnName: 'figshareservice.deleteFilesFromRedbox',
            options: {
                lockLifetime: 120 * 1000,
                lockLimit: 1,
                concurrency: 1
            }
        }
    ]
};
