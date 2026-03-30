/**
 * ORM Config Interface
 * (sails.config.orm)
 * 
 * Waterline ORM hook configuration.
 */

export interface OrmConfig {
    /** Timeout for ORM hook initialization in milliseconds */
    _hookTimeout?: number;
}

export const orm: OrmConfig = {
    _hookTimeout: 120000,
};
