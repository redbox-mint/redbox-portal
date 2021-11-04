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
    citationUrlProperty: "citation_url",
    creatorsProperty: "creators"
}