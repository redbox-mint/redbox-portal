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

// Note: Default values contain complex job definitions.
// The original config/agendaQueue.js file should be kept for runtime.
