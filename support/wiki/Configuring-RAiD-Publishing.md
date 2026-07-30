# Configuring RAiD Publishing

RAiD publishing is configured per brand through the `raidPublishing` AppConfig model. The record's `metaMetadata.brandId` selects the brand; credentials from one brand are never used for another unknown brand. The legacy `sails.config.raid` block supplies bootstrap defaults only.

## Mapping fields

Every mapping field selects one engine explicitly. JSONata is preferred for typed values:

```json
{
  "title": {
    "dest": "title[0].text",
    "engine": "jsonata",
    "expression": "record.metadata.title"
  },
  "titleType": {
    "dest": "title[0].type",
    "engine": "jsonata",
    "expression": "types.title.Primary"
  }
}
```

Handlebars is intended for rendered text. Set `parseJson` only when the rendered text is JSON:

```json
{
  "alternateUrl": {
    "dest": "alternateUrl[0].url",
    "engine": "handlebars",
    "template": "https://example.edu/records/{{record.redboxOid}}"
  }
}
```

Both engines receive `record`, `options`, `mappedData`, `fieldConfig`, `types`, and `runContext`. Handlebars exposes only the deterministic `json`, `lookupPath`, `date`, and `number` helpers. JSONata additionally exposes `$contributors()` and `$subjects(data, type)`. Service objects, lodash, Sails globals, and arbitrary JavaScript are not exposed.

Legacy lodash `<% ... %>` templates are rejected with a configuration error and must be migrated.

## Reliability and observability

`connection.timeoutMs` and `connection.oauth.timeoutMs` are Effect-enforced deadlines. Transient failures use bounded exponential retry according to `connection.retry`; exhausted transient mint failures may then use the durable Agenda policy in `durableRetry`. Explicit caller cancellation is not retried.

Each invocation records a parent `mintRaid` integration audit with child records for source loading, mapping, token acquisition, each mint attempt, persistence, and durable retry scheduling. Audit and log summaries redact credentials and authorization data.
