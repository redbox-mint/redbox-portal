/**
 * Crontab Config Interface
 * (sails.config.crontab)
 * 
 * Scheduled task configuration.
 * Note: This file contains a function and must stay as JS for runtime.
 */

export interface CronJob {
    /** Cron interval pattern */
    interval: string;
    /** Service name to call */
    service: string;
    /** Method name to call */
    method: string;
}

export interface CrontabConfig {
    /** Enable cron jobs at bootstrap */
    enabled: boolean;
    /** Function returning cron job definitions */
    crons: () => CronJob[];
}

// Note: Default values contain a function.
// The original config/crontab.js file must be kept for runtime.
