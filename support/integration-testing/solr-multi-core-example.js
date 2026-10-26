'use strict';
// Selected v6 application configuration: REDBOX_APPLICATION_CONFIG points at this file.
module.exports = { solr: { cores: { default: { options: { host: 'solr', port: 8983, core: 'redbox' } }, publications: { options: { host: 'solr', port: 8983, core: 'publications' } } } } };
