/**
 * RAiD Config Interface
 * (sails.config.raid)
 * 
 * RAiD (Research Activity Identifier) integration configuration.
 */

export interface RaidTypeMapping {
    id: string;
    schemaUri: string;
}

export interface RaidContributorPosition {
    schemaUri: string;
    id: string;
}

export interface RaidContributorRoles {
    schemaUri: string;
    types: Record<string, string>;
}

export interface RaidContributorConfig {
    position: Record<string, RaidContributorPosition>;
    flags: {
        leader: string[];
        contact: string[];
    };
    hiearchy: {
        position: string[];
    };
    roles: RaidContributorRoles;
}

export interface RaidMappingField {
    dest: string;
    src: string;
    parseJson?: boolean;
    contributorMap?: Record<string, unknown>;
}

export interface RaidConfig {
    basePath: string;
    token: string;
    saveBodyInMeta: boolean;
    retryJobName: string;
    retryJobSchedule: string;
    retryJobMaxAttempts: number;
    orcidBaseUrl: string;
    raidFieldName: string;
    types: {
        title: Record<string, RaidTypeMapping>;
        description: Record<string, RaidTypeMapping>;
        language: Record<string, RaidTypeMapping>;
        access: Record<string, RaidTypeMapping>;
        contributor: RaidContributorConfig;
        organisation: {
            role: Record<string, RaidTypeMapping>;
        };
        subject: {
            for: RaidTypeMapping;
            seo: RaidTypeMapping;
        };
    };
    mapping: {
        [recordType: string]: {
            [fieldName: string]: RaidMappingField;
        };
    };
}

// Note: Default values contain complex mapping structures.
// The original config/raid.js file should be kept.
