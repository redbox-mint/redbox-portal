import type { SailsConfig } from "redbox-core-types";

/**
 * JSON-LD configuration
 *
 * @type {Object}
 */
const jsonldConfig: SailsConfig["jsonld"] = {
  addJsonLdContext: true,
  contexts: {
    "default-1.0-draft": {
      "title": "http://purl.org/dc/elements/1.1/title",
      "description": "http://purl.org/dc/elements/1.1/description",
      "startDate": "http://schema.org/Date",
      "endDate": "http://schema.org/Date"
    },
    "default-1.0-active": {
      "title": "http://purl.org/dc/elements/1.1/title",
      "description": "http://purl.org/dc/elements/1.1/description",
      "startDate": "http://schema.org/Date",
      "endDate": "http://schema.org/Date"
    },
    "default-1.0-retired": {
      "title": "http://purl.org/dc/elements/1.1/title",
      "description": "http://purl.org/dc/elements/1.1/description",
      "startDate": "http://schema.org/Date",
      "endDate": "http://schema.org/Date"
    }
  }
};

module.exports.jsonld = jsonldConfig;
