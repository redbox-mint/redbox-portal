/**
 * Mint Config Interface
 * (sails.config.mint)
 * 
 * Mint integration configuration.
 */

export interface MintApiEndpoint {
    method: 'get' | 'post' | 'put' | 'delete';
    url: string;
}

export interface MintApiConfig {
    search: MintApiEndpoint;
}

export interface MintConfig {
    /** Mint root URI path */
    mintRootUri: string;

    /** API key for external Mint calls */
    apiKey: string;

    /** Mint API endpoints */
    api: MintApiConfig;
}

export const mint: MintConfig = {
    mintRootUri: 'mint',
        apiKey: '',
    api: {
        search: {
            method: 'get',
            url: '/api/v1/search',
        },
    },
};
