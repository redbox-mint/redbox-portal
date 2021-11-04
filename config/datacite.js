module.exports.datacite = {
    username: 'xxxxx',
    password: 'xxxxxxx',
    doiPrefix: "xxxxx",
    baseUrl: 'https://api.test.datacite.org',
    mappings: {
        url: "<%= 'https://research.jcu.edu.au/data/published/' + oid %>",
        publicationYear: "<%= record.metadata.citation_publication_date == null ? moment().format('YYYY') : moment(record.metadata.citation_publication_date).format('YYYY')  %>",
        title: "<%= record.metadata.citation_title %>",
        publisher: "<%= record.metadata.citation_publisher %>",
        creatorGivenName: "<%= creator.given_name %>",
        creatorFamilyName: "<%= creator.family_name %>",
    },
    citationUrlProperty: "metadata.citation_url",
    citationDoiProperty: "metadata.citation_doi",
    generatedCitationStringProperty: "metadata.citation_generated",
    citationStringTemplate: '<%= _.join(_.map(_.filter(_.get(data, "creators"), (c) => {return !_.isEmpty(c.family_name) || !_.isEmpty(c.given_name)}), (c)=> {return !_.isEmpty(c.family_name) || !_.isEmpty(c.given_name) ? ((c.family_name ? c.family_name : "") + ", " + (c.given_name ? c.given_name : "")) : "" }), "; ") + " ("+ moment(_.get(data, "citation_publication_date")).format("YYYY") + "): " + _.get(data, "citation_title") + ". " + _.get(data, "citation_publisher") + ". " + (_.get(data, "citation_doi", null) == null ? "{ID_WILL_BE_HERE}" : "https://doi.org/" + _.get(data, "citation_doi")) %>',
    creatorsProperty: "creators"
}