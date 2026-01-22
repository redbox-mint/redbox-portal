## Configuring Dashboard Tables

Dashboards are very configurable.
The configuration requires declaring the Type and the Table settings.

### Dashboard Type Configuration

#### Dashboard Type

The dashboard type configuration defines format rules.

| Project name | Type                                                        | Description                                                     | Required? | Default value |
|--------------|-------------------------------------------------------------|-----------------------------------------------------------------|-----------|---------------|
| name         | string                                                      | A unique name for the type of dashboard                         | true      | *no default*  |
| formatRules  | [Dashboard Type Format Rules](#dashboard-type-format-rules) | The rules that guide the format and rendering of the dashboard. | true      | *no default*  |

#### Dashboard Type Format Rules

The rules that guide the format and rendering of the dashboard.

| Project name          | Type                                                                                                    | Description                                                                                                                                                   | Required? | Default value |
|-----------------------|---------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|---------------|
| filterBy              | [Dashboard Type Format Rules Filter](#dashboard-type-format-rules-filter)                               | The filter to apply to the result set                                                                                                                         | true      | *no default*  |
| recordTypeFilterBy    | string                                                                                                  | The record type to filter by. Depending on filterBy and/or groupBy there may be different record types retrieved. This is an optional filter that can be set. | false     | *no default*  |
| filterWorkflowStepsBy | List of string                                                                                          | The workflow step to filter by                                                                                                                                | false     | *no default*  |
| sortBy                | string                                                                                                  | The sort by string in mongo format (key:<1 or -1>)                                                                                                            | false     | *no default*  |
| groupBy               | String                                                                                                  | The group by strategy. Valid options: `groupedByRecordType`; `groupedByRelationships`; `''`;                                                                  | false     | *no default*  |
| sortGroupBy           | List of [Dashboard Type Format Rules Sort Group By](#dashboard-type-format-rules-sort-group-by) objects |                                                                                                                                                               | false     | Empty list    |

#### Dashboard Type Format Rules Filter

| Project name           | Type   | Description                                                                                          | Required? | Default value |
|------------------------|--------|------------------------------------------------------------------------------------------------------|-----------|---------------|
| filterBase             | string | The type to filter by. Valid Options: `record`; `user`;                                              | true      | `record`      |
| filterBaseFieldOrValue | string | If `filterBase` is `record`: the record value. If `filterBase` is `user`: a field path               | true      | *no default*  |
| filterField            | string | Field path to obtain a value from the record object that will be matched to `filterBaseFieldOrValue` | true      | *no default*  |
| filterMode             | string | Valid options: `equal`; `regex`; `true`;                                                             | true      | *no default*  |

*Note that `user` is a completely different structure separate from the `record`, so it requires the field path*

*Note that the value of the field set in `filterField` will be matched to the set value if `filterBase` is `record`,
or matched to the value derived from the user object field path if `filterBase` is `user`.*

#### Dashboard Type Format Rules Sort Group By

| Project name      | Type   | Description | Required? | Default value |
|-------------------|--------|-------------|-----------|---------------|
| rowLevel          | number |             |           |               |
| compareFieldValue | string |             |           |               |
| compareField      | string |             |           |               |
| relatedTo         | string |             |           |               |

### Dashboard Table Configuration

#### Dashboard Table

| Project name        | Type                                             | Description                            | Required? | Default value |
|---------------------|--------------------------------------------------|----------------------------------------|-----------|---------------|
| rowLevelrowConfig   | List of Dashboard Table Row Config objects       | Rendering templates for the table rows |           |               |
| rowRulesConfig      | List of Dashboard Table Row Rules Config objects |                                        |           |               |
| groupRowConfig      | List of Dashboard Table Row Config objects       |                                        |           |               |
| groupRowRulesConfig | List of Dashboard Table Row Rules Config objects |                                        |           |               |
| formatRules         | Dashboard Type Format Rules                      |                                        |           |               |

#### Dashboard Table Row Config

| Project name | Type   | Description  | Required? | Default value |
|--------------|--------|--------------|-----------|---------------|
| title        | string | Column title |           |               |
| variable     | string |              |           |               |
| template     | string |              |           |               |
| initialSort  | string |              |           |               |

#### Dashboard Table Row Rules Config

| Project name          | Type   | Description | Required? | Default value |
|-----------------------|--------|-------------|-----------|---------------|
| name                  | string |             |           |               |
| action                | string |             |           |               |
| renderItemTemplate    | string |             |           |               |
| evaluateRulesTemplate | string |             |           |               |

