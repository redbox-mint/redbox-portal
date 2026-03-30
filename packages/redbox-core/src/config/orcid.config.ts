/**
 * ORCID Config Interface
 * (sails.config.orcid)
 * 
 * ORCID integration configuration.
 */

export interface OrcidConfig {
    /** ORCID API base URL */
    url: string;
}

export const orcid: OrcidConfig = {
    url: 'https://pub.orcid.org',
};
