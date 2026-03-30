/**
 * Queue Config Interface
 * (sails.config.queue)
 * 
 * Queue service configuration.
 */

export interface QueueConfig {
    /** Name of the queue service to use */
    serviceName: string;
}

export const queue: QueueConfig = {
    serviceName: 'agendaqueueservice',
};
