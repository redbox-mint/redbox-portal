/**
 * JSON-LD Config Interface
 * (sails.config.jsonld)
 * 
 * JSON-LD context configuration.
 */

export interface JsonLdContextMapping {
    [fieldName: string]: string;
}

export interface JsonLdConfig {
    /** Whether to add JSON-LD context to responses */
    addJsonLdContext: boolean;

    /** Context mappings by workflow stage */
    contexts: {
        [workflowStage: string]: JsonLdContextMapping;
    };
}

export const jsonld: JsonLdConfig = {
    addJsonLdContext: true,
    contexts: {
        'default-1.0-draft': {
            title: 'http://purl.org/dc/elements/1.1/title',
            description: 'http://purl.org/dc/elements/1.1/description',
            startDate: 'http://schema.org/Date',
            endDate: 'http://schema.org/Date',
        },
        'default-1.0-active': {
            title: 'http://purl.org/dc/elements/1.1/title',
            description: 'http://purl.org/dc/elements/1.1/description',
            startDate: 'http://schema.org/Date',
            endDate: 'http://schema.org/Date',
        },
        'default-1.0-retired': {
            title: 'http://purl.org/dc/elements/1.1/title',
            description: 'http://purl.org/dc/elements/1.1/description',
            startDate: 'http://schema.org/Date',
            endDate: 'http://schema.org/Date',
        },
    },
};
