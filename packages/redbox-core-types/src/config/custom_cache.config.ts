/**
 * Custom Cache Config Interface
 * (sails.config.custom_cache)
 * 
 * Custom caching configuration.
 */

export interface CustomCacheConfig {
    /** Cache expiry time in seconds */
    cacheExpiry: number;
}

export const custom_cache: CustomCacheConfig = {
    cacheExpiry: 31536000 // one year in seconds
};
