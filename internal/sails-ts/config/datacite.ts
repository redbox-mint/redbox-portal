import type { SailsConfig } from "redbox-core-types";

const dataciteConfig: SailsConfig["datacite"] = {
    username: 'xxxxx',
    password: 'xxxxxxx',
    doiPrefix: "xxxxx",
    baseUrl: 'https://api.test.datacite.org',
    mappings: {
        url: "<%= 'https://redboxresearchdata.com.au/published/' + oid %>",
        publicationYear: "<%= _.isEmpty(record.metadata.citation_publication_date) ? moment().format('YYYY') : moment(record.metadata.citation_publication_date).format('YYYY')  %>",
        title: "<%= record.metadata.citation_title %>",
        publisher: "<%= record.metadata.citation_publisher %>",
        creatorGivenName: "<%= creator.given_name %>",
        creatorFamilyName: "<%= creator.family_name %>",
        creatorIdentifier: "<%= `http://orcid.org/${creator.orcid}` %>",
        "sizes": "<%= JSON.stringify([record.metadata.collectionCapacity]) %>",
        "identifiers": "<%= JSON.stringify(record.metadata.finalIdentifiers) %>",
        "subjects": ["<%= JSON.stringify(record.metadata.finalKeywords) %>", "<%= JSON.stringify(processForCodes(record.metadata['dc:subject_anzsrc:for'])) %>"],
        "dates": [
            {"dateType": "Available", "template": "<%= record.metadata.embargoUntil %>"},
            {"dateType": "Created", "template":  "<%= record.dateCreated %>"},
            {"dateType": "Updated", "template":  "<%= record.dateUpdated %>"},
            {"dateType": "Other", "template":  "<%= record.metadata.startDate %>", "dateInformation": "Start Date"},
            {"dateType": "Other", "template":  "<%= record.metadata.endDate %>", "dateInformation": "End Date"}
        ],
        "rightsList": [
            {"key": "rightsUri", "template": "<%= record.metadata.license_identifier %>"}
        ],
        "descriptions": [
            {"descriptionType": "Abstract", "template": "<%= JSON.stringify([record.metadata.description]) %>"}
        ]
    },
    citationUrlProperty: "metadata.citation_url",
    citationDoiProperty: "metadata.citation_doi",
    generatedCitationStringProperty: "metadata.citation_generated",
    citationStringTemplate: '<%= _.join(_.map(_.filter(_.get(data, "creators"), (c) => {return !_.isEmpty(c.family_name) || !_.isEmpty(c.given_name)}), (c)=> {return !_.isEmpty(c.family_name) || !_.isEmpty(c.given_name) ? ((c.family_name ? c.family_name : "") + ", " + (c.given_name ? c.given_name : "")) : "" }), "; ") + " ("+ moment(_.get(data, "citation_publication_date")).format("YYYY") + "): " + _.get(data, "citation_title") + ". " + _.get(data, "citation_publisher") + ". " + (_.get(data, "citation_doi", null) == null ? "{ID_WILL_BE_HERE}" : "https://doi.org/" + _.get(data, "citation_doi")) %>',
    creatorsProperty: "creators"
}

module.exports.datacite = dataciteConfig;
