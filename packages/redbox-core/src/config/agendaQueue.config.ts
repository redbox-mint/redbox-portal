/**
 * Agenda Queue Config Interface
 * (configuration.agendaQueue)
 *
 * Agenda job queue configuration.
 */

import { agendaQueueDefaultOptions } from './agendaQueueDefaults';
import { agendaQueueDefaultJobs } from './agendaQueueJobs';

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

export function parseAgendaQueueBackend(
  value: string | undefined,
  source = 'agendaQueue.options.backend'
): AgendaQueueBackend | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }
  if ((AGENDA_QUEUE_BACKENDS as string[]).includes(value)) {
    return value as AgendaQueueBackend;
  }
  throw new Error(`Invalid ${source} value '${value}'. Expected one of: ${AGENDA_QUEUE_BACKENDS.join(', ')}.`);
}

export function parseAgendaHistoryRetentionHours(
  value: string | undefined,
  source = 'agendaQueue.options.historyRetentionHours'
): number | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }
  const hours = Number(value);
  if (Number.isFinite(hours) && hours >= 0) {
    return hours;
  }
  throw new Error(`Invalid ${source} value '${value}'. Expected a non-negative number of hours.`);
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
  /** Maximum drain wait in milliseconds; defaults to 30000. A timeout retains resource ownership for retry. */
  drainTimeoutMs?: number;
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
  /** Hours to retain completed jobs in the history collection */
  historyRetentionHours?: number;
  /** SQS backend configuration */
  sqs?: AgendaQueueSqsOptions;
}

export interface AgendaQueueConfig {
  /** Agenda options */
  options?: AgendaQueueOptions;
  /** Job definitions, keyed by unique job name */
  jobs: AgendaJobsConfig;
}

export { RECORD_POST_COMMIT_RECONCILIATION_JOB_NAME, BRANDING_TYPEFACE_RECONCILE_JOB_NAME } from './agendaQueueJobs';

export const agendaQueue: AgendaQueueConfig = {
  options: { ...agendaQueueDefaultOptions },
  jobs: agendaQueueDefaultJobs,
};
