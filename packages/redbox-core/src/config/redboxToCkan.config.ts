/**
 * ReDBox to CKAN Config Interface
 * (sails.config.redboxToCkan)
 * 
 * ReDBox to CKAN integration configuration.
 */

export interface CkanConfig {
    urlBase: string;
    apiKey: string;
    ownerOrgId: string;
}

export interface RedboxToCkanConfig {
    urlBase: string;
    ckan: CkanConfig;
}

export const redboxToCkan: RedboxToCkanConfig = {
    urlBase: 'http://localhost:1500',
    ckan: {
        urlBase: 'http://203.101.227.135:5000',
        apiKey: '0190b9e6-7ba1-432e-a5af-8218e416bacb',
        ownerOrgId: 'qcif'
    }
};
