# Configuring Solr

## Overview

ReDBox supports configuring Solr for indexing and search. The Solr configuration allows you to customise:

- The Solr server connection details and core name
- The Solr schema used by the target core
- How ReDBox metadata is transformed into Solr documents before indexing

Within the ReDBox configuration model, Solr settings are available under `sails.config.solr`. The default configuration is defined in `config/solr.js`.

## Solr Server Configuration

Connection settings for Solr are stored in `sails.config.solr.options`.

### Example

```javascript
options: {
  host: 'solr',
  port: '8983',
  core: 'redbox'
}
```

The available options match those supported by the [solr-client-js library](https://lbdremy.github.io/solr-node-client/code/solr.js.html).

## Solr Schema Configuration

The Solr schema configuration is stored in `sails.config.solr.schema`.

Schema initialisation only runs when there is no document present in the index containing the value configured in `sails.config.solr.initSchemaFlag`.

ReDBox uses the [Solr Schema API](https://solr.apache.org/guide/solr/latest/indexing-guide/schema-api.html) to apply schema changes. The supported schema operations align with the options documented in Solr's [Modify the Schema](https://solr.apache.org/guide/solr/latest/indexing-guide/schema-api.html#modify-the-schema) section.

### Example

```javascript
schema: {
  'add-field': [
    {
      name: 'full_text',
      type: 'text_general',
      indexed: true,
      stored: false,
      multiValued: true
    },
    {
      name: 'title',
      type: 'text_general',
      indexed: true,
      stored: true,
      multiValued: false
    }
  ],
  'add-dynamic-field': [
    {
      name: 'date_*',
      type: 'pdate',
      indexed: true,
      stored: true
    }
  ],
  'add-copy-field': [
    {
      source: '*',
      dest: 'full_text'
    }
  ],
  'add-field-type': [
    {
      name: 'myNewTextField',
      class: 'solr.TextField',
      indexAnalyzer: {
        tokenizer: {
          name: 'pathHierarchy',
          delimiter: '/'
        }
      },
      queryAnalyzer: {
        tokenizer: {
          name: 'keyword'
        }
      }
    }
  ]
}
```

## Mapping ReDBox Metadata to Solr Documents

Whenever a record is created or updated, ReDBox transforms the metadata document into a Solr document and submits it to Solr for indexing. These transformation rules are configured in `sails.config.solr.preIndex`.

### Moving Properties

The directives in `sails.config.solr.preIndex.move` move a value from one location in the document to another.

| Property name | Required | Description |
|---|---|---|
| `source` | Yes | Source property path. Use dot notation for nested object properties. |
| `dest` | Yes | Destination property path. Use an empty string to move an object to the document root. |

```javascript
move: [
  {
    source: 'metadata_property',
    dest: 'new_metadata_property'
  }
]
```

### Copying Properties

The directives in `sails.config.solr.preIndex.copy` copy a value from one location to another while leaving the original value unchanged.

| Property name | Required | Description |
|---|---|---|
| `source` | Yes | Source property path. Use dot notation for nested object properties. |
| `dest` | Yes | Destination property path. Use an empty string to copy an object to the document root. |

```javascript
copy: [
  {
    source: 'metadata_property',
    dest: 'copied_metadata_property'
  }
]
```

### Stringifying JSON

If you need to preserve structured objects as strings in the Solr index, `sails.config.solr.preIndex.jsonString` can be used to apply [`JSON.stringify`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify) to a property before indexing.

This can be useful when integrating with downstream tools such as [Project Blacklight](https://projectblacklight.org/), where the full object may need to be re-parsed later.

| Property name | Required | Description |
|---|---|---|
| `source` | Yes | Source property path. Use dot notation for nested object properties. |
| `dest` | No | Destination property path. If omitted, the stringified value replaces the value at `source`. |

```javascript
jsonString: [
  {
    source: 'metadata_property',
    dest: 'jsonstringified_metadata_property'
  }
]
```

### Template-Based Values

For more flexible transformations, ReDBox can evaluate a [Lodash template](https://lodash.com/docs/4.17.15#template) and assign the result to a field in the Solr document.

The template receives a variable named `data`:

- If `source` is defined, `data` is the value from that property
- If `source` is omitted, `data` is the entire document

| Property name | Required | Description |
|---|---|---|
| `source` | No | Source property path to expose as `data`. If omitted, the full document is provided. |
| `dest` | Yes | Destination property path. |
| `template` | Yes | Lodash template string to evaluate. |

```javascript
template: [
  {
    source: 'metadata_property',
    dest: 'concatenated_metadata_property',
    template: '<%= "concatenating text to " + data %>'
  },
  {
    dest: 'evaluated_metadata_property',
    template: '<%= data.metadataProperty + " " + data.anotherMetadataProperty %>'
  }
]
```

### Flattening the Document

Solr does not support nested objects, so documents must be flattened to top-level fields before being indexed.

ReDBox performs this step automatically at the end of the pre-index pipeline using the JavaScript [flat](https://www.npmjs.com/package/flat) library. Global options for this step can be configured in `sails.config.solr.preIndex.flatten.options`.

In addition to the standard full-document flattening, ReDBox supports selectively flattening specific attributes with their own options. These rules are defined in `sails.config.solr.preIndex.flatten.special`.

### Example

The following example flattens the `workflow` property using `_` as the delimiter instead of `.` and stores the result in `workflowflattened`:

```javascript
flatten: {
  special: [
    {
      source: 'workflow',
      dest: 'workflowflattened',
      options: {
        safe: false,
        delimiter: '_'
      }
    }
  ]
}
```

## See Also

- [Configuration Guide](Configuration-Guide)
- [Configuring the search page for a record type](Configuring-the-search-page-for-a-record-type)
- [ReDBox Portal API](ReDBox-Portal-API)
