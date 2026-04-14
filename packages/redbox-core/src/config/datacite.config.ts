/**
 * Legacy DataCite connection compatibility config.
 * Runtime DOI behavior now resolves from doiPublishing instead.
 */

export interface DataciteConfig {
    username: string;
    password: string;
    doiPrefix: string;
    baseUrl: string;
}

export const datacite: DataciteConfig = {
    username: 'xxxxx',
    password: 'xxxxxxx',
    doiPrefix: "xxxxx",
    baseUrl: 'https://api.test.datacite.org'
};
