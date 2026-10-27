/**
 * JSON-LD Config Interface
 * (configuration.jsonld)
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
  contexts: {},
};
