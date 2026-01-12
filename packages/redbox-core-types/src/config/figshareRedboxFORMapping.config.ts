/**
 * Figshare ReDBox FOR Mapping Config Interface
 * (sails.config.figshareReDBoxFORMapping)
 * 
 * Field of Research code to Figshare category mapping.
 */

export interface ForMappingEntry {
    FOR2020Code: string;
    FigCatId: number;
}

export interface FigshareReDBoxFORMappingConfig {
    FORMapping: ForMappingEntry[];
}

// Note: Default values contain 7000+ mapping entries.
// The original config/figshareRedboxFORMapping.js file should be kept.
