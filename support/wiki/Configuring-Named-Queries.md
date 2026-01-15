This document details the configuration and usage of named queries within our application's reporting framework. Named queries allow for the creation of predefined, parameterizable queries that can be utilized both within the application and via a REST API to fetch data in a structured and efficient manner.

## Overview

Named queries are defined in a JavaScript configuration file, which maps various query parameters and MongoDB queries to specific record collections. This enables the application to fetch data based on the defined criteria and return result sets accordingly.

## Configuration

Below is a breakdown of how to configure a named query within the `module.exports.namedQuery` object:

### Structure of a Named Query

Each named query is a property of the `namedQuery` object, identified by a unique key. For instance, `listRDMPRecords` and `listDRRecords` are examples of named query keys. Each key contains several sub-properties that define the query behavior:

- **collectionName**: Specifies the MongoDB collection to be queried. The supported values are `record` and `user`
- **brandIdFieldPath**: Path within the documents to identify brand Id field. For records this is `metaMetadata.brandId`
- **resultObjectMapping**: Maps fields from MongoDB documents to the properties of the resulting JavaScript object. This uses template literals to dynamically insert values.
- **mongoQuery**: Contains the MongoDB query to filter documents in the collection. It specifies the criteria that documents must meet to be included in the result set.
- **queryParams**: Defines the parameters that can be passed to the query and how they alter the MongoDB query.

### Example: Configuring `listRDMPRecords`

Here's a closer look at the configuration of the `listRDMPRecords` named query:

```javascript
'listRDMPRecords': {
  collectionName: 'record',
  brandIdFieldPath: 'metaMetadata.brandId',
  resultObjectMapping: {
    oid: '<%= record.redboxOid%>',
    title: '<%= record.metadata.title %>',
    contributor_ci: '<%= record.metadata.contributor_ci.text_full_name %>',
    contributor_data_manager: '<%= record.metadata.contributor_data_manager.text_full_name %>'
  },
  mongoQuery: {
    'metaMetadata.type': 'rdmp',
    'metadata.title': null,
    'dateCreated': null
  },
  queryParams: {
    'title': {
      type: 'string',
      path: 'metadata.title',
      queryType: 'contains',
      whenUndefined: 'defaultValue',
      defaultValue: ''
    },
    'dateCreatedBefore': {
      type: 'string',
      path: 'dateCreated',
      queryType: '<=',
      whenUndefined: 'defaultValue',
      defaultValue: '3000-01-01T00:00:00.000Z'
    },
    // Additional parameters...
  }
}
```

### Parameter Configuration

Each parameter within `queryParams` consists of several sub-properties:

- **type**: The data type of the parameter (e.g., `string`, `number`).
- **path**: The document path that the parameter pertains to.
- **queryType**: Defines the type of comparison. Supported values are the [supported query modifier values](https://sailsjs.com/documentation/concepts/models-and-orm/query-language#?criteria-modifiers) in Sails (e.g., `contains`, `<=`).
- **whenUndefined**: Specifies the behavior if the parameter is not provided (e.g., `ignore`, `defaultValue`).
- **defaultValue**: A default value used if the parameter is undefined and `whenUndefined` is set to `defaultValue`.

## Utilizing Named Queries via REST API

To utilize these named queries through the [REST API](https://redbox-mint.github.io/redbox-portal/additional-documentation/rest-api.html#report-report-get), send a request to the appropriate endpoint with the required parameters. For example, to call the `listRDMPRecords` query:

```
GET /default/rdmp/api/report/namedQuery/listRDMPRecords?title=someTitle&dateCreatedBefore=2022-05-01
```

The server will process this request by substituting the parameters into the named query configuration and executing the resulting MongoDB query.