/**
 * Crontab Config Interface and Default Values
 * (sails.config.crontab)
 * 
 * Scheduled task configuration.
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

export const crontab: CrontabConfig = {
    enabled: false, // enable this to register async checker at bootstrap
    crons: function () {
        return [
            { interval: '1 * * * * * ', service: 'workspaceasyncservice', method: 'loop' }
        ];
    }
};

