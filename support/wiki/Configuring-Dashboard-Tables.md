## Configuring Dashboard Tables

Every workflow stage and every custom dashboard-view step owns one complete, independent set of dashboard settings. There are no dashboard profiles, record-type defaults or partial overrides: what you see for a stage in the editor is exactly what its dashboard uses, and changing one stage never changes another.

Settings are administered per brand in **Admin → Dashboard Configuration** (`/:branding/:portal/admin/dashboard-config`) or through the [REST API](#rest-api).

### How settings are created

- **New installations and new targets.** After core and hook bootstraps, ReDBox gives every workflow stage and view step that has no saved settings a one-time copy of its starting settings. Starting settings come from the hook declaration (`workflow[*][*].config.dashboard.table`, `dashboardview[*].steps[*].dashboardTable`, and the `dashboardtype` format rules the old runtime applied). With no declaration, the built-in columns are used.
- **Upgrades from v5.0.1.** A one-time data migration converts the old profile/default/override configuration. See [Upgrading from v5.0.1](#upgrading-from-v501).
- **After that, saved settings win.** Later hook upgrades, `bootstrapAlways`, or edits to hook declarations never overwrite saved settings. An existing stage with empty settings is not "missing" and is not re-seeded.

Hidden workflow stages appear in the editor (labelled *hidden stage*) so they can be configured, but they stay hidden on ordinary dashboards. Settings for stages or view steps that no longer exist are kept for recovery but are not shown for editing or copying. Renaming a stage or view step is a configuration identity change and needs an explicit migration; settings are never reassigned by similar names.

### Settings reference

```ts
interface DashboardSettings {
  searchable: boolean;       // Show the search box (workflow stage dashboards)
  showStageTitle: boolean;   // Show the heading above the stage's table
  tableConfig: {
    rowConfig: RowConfig[];            // Columns
    rowRulesConfig: RuleSet[];         // Named row action rule sets
    groupRowConfig: RowConfig[];       // Group row columns (custom views)
    groupRowRulesConfig: RuleSet[];    // Named group row rule sets (custom views)
    formatRules: {
      filterBy?: Filter;               // Records listed when nobody is searching
      queryFilters?: { [recordType: string]: QueryFilter[] }; // "Filter by" search fields
      sortBy?: string;                 // Overall sort, used when no column declares a sort
      groupBy?: '' | 'groupedByRecordType' | 'groupedByRelationships';
      sortGroupBy?: SortGroupBy[];
    };
  };
}
```

Empty values are meaningful: an empty column list shows an empty-table message, an empty template renders nothing, and an absent filter lists all permitted records. Nothing is filled in from another stage, a profile or the built-in columns.

Structural behaviour is not part of the settings and cannot be copied: which records a page lists (workflow stage, workspace package type, a view's `sourceRecordType`/`fetchMode`), permissions, forms, and page titles. The workspace page's record type and visible stages (`recordTypeFilterBy`, `filterWorkflowStepsBy`) are kept as read-only context from the old `workspace` dashboard type.

#### Row Config (columns)

| Field         | Type                 | Description                                                                                  |
|---------------|----------------------|----------------------------------------------------------------------------------------------|
| title         | string               | Column heading (translation key or text).                                                    |
| variable      | string               | Field path used for sorting and to identify the cell.                                        |
| template      | string               | Handlebars template for the cell. Empty renders an empty cell.                               |
| initialSort   | `asc` \| `desc`      | Makes the column sortable with this initial direction.                                       |
| defaultSort   | boolean              | Use this column for the initial sort.                                                        |
| secondarySort | string               | Field path used as a secondary sort for this column.                                         |

#### Rule sets

Rule sets are referenced from column templates with `{{evaluateRowLevelRules rulesConfig metadata metaMetadata workflow oid "ruleSetName"}}` (or `evaluateGroupRowRules groupRulesConfig groupedItems "ruleSetName"` in group rows). Workflow stage dashboards and custom views both supply the stage's own rule sets.

| Field                 | Type               | Description                                                              |
|-----------------------|--------------------|--------------------------------------------------------------------------|
| ruleSetName           | string             | Unique name within the list.                                             |
| applyRuleSet          | boolean            | `false` renders nothing.                                                 |
| separator             | string             | Joins rendered rules.                                                    |
| rules[].name          | string             | Rule name.                                                               |
| rules[].action        | `show` \| `hide`   |                                                                          |
| rules[].renderItemTemplate | string        | Handlebars output for the rule.                                          |
| rules[].evaluateRulesTemplate | string     | Optional; the rule renders only when this evaluates to `true`.           |

#### Filter

| Field                  | Type   | Description                                                                                          |
|------------------------|--------|------------------------------------------------------------------------------------------------------|
| filterBase             | string | `record` or `user`.                                                                                  |
| filterBaseFieldOrValue | string | If `filterBase` is `record`: the value. If `user`: a path on the current user object.                |
| filterField            | string | Record field path compared with the value.                                                           |
| filterMode             | string | For example `equal` or `regex`.                                                                      |

User-relative filters are stored as expressions and evaluated for whoever views the dashboard.

#### Search filters and sorting

`queryFilters` is keyed by the record type of the dashboard page (`workspace` on the workspace page). Each entry is `{ filterType: 'text', filterFields: [{ name, path, template? }] }`. A field `template` receives the typed text as `value`. When a page's key has no entries the search box filters by title.

Column sorting is used first. If no column declares a sort, `sortBy` (for example `metaMetadata.lastSaveDate:-1`) is used; otherwise records are listed most recently modified first.

#### Grouping (custom views)

`groupBy`, `sortGroupBy`, `groupRowConfig` and `groupRowRulesConfig` are applied by custom dashboard views. Workflow stage dashboards list records without grouping; the editor warns if grouping is set on a stage.

| sortGroupBy field | Description                                              |
|-------------------|----------------------------------------------------------|
| rowLevel          | Group level, starting at 0.                              |
| compareFieldValue | Value (for `groupedByRecordType`, the record type).      |
| compareField      | Field compared with `compareFieldValue` (relationships). |
| relatedTo         | Field holding the parent oid (relationships).            |

### Editing and copying

The editor lists workflow stages by record type and custom views by view. For the selected target it shows every setting, with **Save**, **Copy from…** and **Copy to…**. Unsaved changes are flagged and you are asked before they are discarded.

Filters, sorting, search and grouping are set up with guided controls rather than JSON:

- **Which records are listed**: all records, records linked to the signed-in person (choose the record field, *exactly match* or *contain*, and the person's email, username, name or another property), or records with a fixed value. A summary sentence confirms the rule.
- **Default order**: a field and a direction, used only when no column declares an initial sort.
- **Search fields**: a list of label and record field pairs for the "Filter by" menu, with an optional advanced template that transforms the typed text.
- **Grouping** (custom views): no grouping, by record type, or by related records, with ordered levels. For related records each level after the first names the field that links it to the level above.

#### Record field suggestions

Wherever a record field path is entered (columns, filters, sorting, search fields, grouping links) the editor suggests fields from the record JSON schema of the selected stage, resolved by `RecordSchemaService` for the signed-in administrator. View steps use their source record type and stage. The editor states whether the schema is complete or partial. Paths the schema does not describe are flagged, and saves and copies report them as warnings to acknowledge. They are not errors: records can contain fields that no form describes, and fields under components the schema cannot describe are not checked. If the schema cannot be resolved, editing continues without suggestions.

Settings are copied in groups. A selected group *replaces* the destination's values completely, including clearing values the source does not have; unselected groups are left alone.

| Group                         | Replaces                                                                                   |
|-------------------------------|--------------------------------------------------------------------------------------------|
| Columns and row actions       | `rowConfig` (including column sorting and templates) and `rowRulesConfig`                   |
| Filters, sorting and search   | `filterBy`, `queryFilters`, `sortBy`, `searchable`, `showStageTitle`                       |
| Grouping and group rows       | `groupBy`, `sortGroupBy`, `groupRowConfig`, `groupRowRulesConfig`                          |
| All settings                  | All of the above. Refused when the source has fields that are not recognised settings.    |

- **Copy from** loads saved settings from another dashboard into your draft. Nothing is saved until you press Save, and the draft keeps its own base revision.
- **Copy to** copies this dashboard's *saved* settings (save first) to one or more other dashboards, including across record types. It shows a before/after preview and any warnings; every warning must be acknowledged. All destinations are updated in one write, or none are.

Each copy is independent: later changes to the source do not affect the destinations. Field paths, record-type keys and URLs are never rewritten; copying between record types produces warnings where settings mention the source record type.

#### Validation

Saves and copies validate the *resulting* settings. These block the change:

- malformed Handlebars templates, invalid values (for example `initialSort`, `groupBy`), duplicate rule set names;
- a template that names a rule set that does not exist (`evaluateRowLevelRules ... "missing"`);
- structural profile fields (`recordTypeFilterBy`, `filterWorkflowStepsBy`, `hideWorkflowStepTitleForRecordType`) inside stage settings.

The resulting record filter must be complete (a field and a value), the overall sort must be `field:1` or `field:-1`, and relationship group levels need their record type and linking field.

These are warnings you can acknowledge: record field paths that the stage's record schema does not describe, rule set names that cannot be checked before the dashboard runs, search filters keyed to a record type the page does not use, an overall sort on a field that is not a column, and grouping or search settings that have no effect for that kind of target.

#### Concurrency

Each brand's dashboard configuration has one revision number. Every save and copy states the revision it was based on; if anything changed in the meantime the request is refused with `409` and nothing is written. Reload, review and try again.

### Dashboard runtime

Dashboards load all stage settings for a page from one saved revision (`GET /:branding/:portal/dashboard/settings/workflow/:recordType` or `.../view/:dashboardView`) and request compiled templates for exactly those settings. If an administrator saves in between, the page reloads settings and templates together instead of mixing versions. An open page keeps its snapshot; a fresh load sees the latest settings.

### REST API

All paths are relative to `/:branding/:portal/api/dashboard-config` and require the Admin role. The editor uses the same operations through CSRF-protected session routes under `/:branding/:portal/admin/dashboard-config`.

| Method | Path                         | Purpose                                                                 |
|--------|------------------------------|-------------------------------------------------------------------------|
| GET    | `/targets`                   | Workflow stages (hidden ones flagged) and view steps.                    |
| GET    | `/workflows/:recordType/:stage` | Complete settings and the brand revision.                           |
| PUT    | `/workflows/:recordType/:stage` | Replace the settings: `{ expectedRevision, settings, validationFingerprint?, acknowledgedWarningIds? }`. |
| GET    | `/views/:view/:step`         | As above for a view step.                                               |
| PUT    | `/views/:view/:step`         | As above for a view step.                                               |
| POST   | `/validate`                  | Read-only: `{ target, expectedRevision, settings }` → errors, warnings, `validationFingerprint`. |
| POST   | `/copy/preview`              | Read-only: `{ source, destinations, groups }` → changes, findings, `expectedRevision`, `previewFingerprint`. |
| POST   | `/copy/apply`                | The same request plus `expectedRevision`, `previewFingerprint` and `acknowledgedWarningIds`. |
| GET    | `/workflows/:recordType/:stage/fields` | Record fields for the stage from its record JSON schema: `{ status, reason?, recordType, workflowStage, fields, openPrefixes }`. |
| GET    | `/views/:view/:step/fields`  | As above for a view step (source record type and stage).                 |
| GET    | `/migration/preflight`       | Read-only legacy migration report (see below).                          |

Targets are `{ "kind": "workflow", "recordType": "rdmp", "stage": "draft" }` or `{ "kind": "view", "view": "consolidated", "step": "consolidated" }`. Errors use typed codes: `400 invalid-request|invalid-settings`, `404 target-not-found`, `409 stale-revision|stale-preview|warnings-require-review|settings-changed`, `410 legacy-operation-retired`, `503 configuration-unavailable`. With `X-ReDBox-Api-Version: 2.0`, findings are returned in the error `meta`.

**Breaking change.** The old operations (`/info`, `/defaults`, `/overrides`, `/merged/...`, `/merged-view/...`, `/merged-type/...`) now return `410` with code `legacy-operation-retired`. Generic app-config writes to `dashboardTableConfig` are refused. `GET /dashboard/type/:dashboardType` still exists but its `formatRules` only describe structural context and `tableConfig` is always empty. `GET /dashboard/view/:dashboardView` no longer includes step `dashboardTable`.

### Upgrading from v5.0.1

The migration `20260925T000000-dashboard-stage-configuration` (in `api/migrations/`) runs before bootstrap. It does **not** flatten the old merged-config API. It reconstructs what the v5.0.1 dashboards actually rendered, including:

- columns and headings from the raw workflow/view table (or the built-in columns), with the templates the old client actually executed from the compiled merged configuration — cells that rendered blank because of index/variable mismatches are kept as explicit empty templates;
- the stage-order leakage of format rules (a stage without its own rules used the previous stage's), materialised as independent settings, and search controls from the final shared rules;
- the stage title visibility from `hideWorkflowStepTitleForRecordType`, only where it had an effect;
- settings the old runtime ignored (for example an overall `sortBy` with column sorting absent, or `formatRulesOverride` on views) are not activated.

For each brand it saves an immutable recovery snapshot (AppConfig key `dashboardConfigLegacySnapshot`), converts, and publishes the complete configuration in one write. Reruns keep the first snapshot and never overwrite a published configuration. If a conversion has *material differences* — for example the same stage rendered differently on the standard and workspace pages — the brand is not published and startup stops with the finding ids. Dashboards are unavailable (`503`) until the migration completes; they never fall back to the old inheritance.

Recommended procedure for each production deployment:

1. Restore a recent database copy with the exact hooks and assets into staging, and record representative dashboards (headings, cells, actions, filters, search, grouping) for representative roles, including workspace and custom views.
2. Deploy this version to staging with `REDBOX_SKIP_MIGRATIONS=true`, sign in as an administrator and call `GET /default/rdmp/api/dashboard-config/migration/preflight`. Each report contains the input fingerprint, proposed settings, per-target outcome (`preserved`, `needs-resolution`, `inactive`) and findings, plus a readable `summary`.
3. Review every `resolution` finding. Accept it, or supply replacement settings, in a resolutions file:

   ```json
   {
     "captureFingerprints": { "default": "<inputFingerprint from the preflight>" },
     "acceptedFindingIdsByBrand": { "default": ["<finding id>"] },
     "replacements": [{ "brand": "default", "target": { "kind": "workflow", "recordType": "existing-locations", "stage": "existing-locations-draft" }, "settings": { "...": "complete settings" } }]
   }
   ```

   A brand fingerprint is required whenever that brand has accepted findings or replacement settings. Acceptances are scoped by brand; the old unscoped `acceptedFindingIds` array is rejected because identical findings can occur in more than one brand. A fingerprint for a brand with no applicable decisions is ignored.

   Point `REDBOX_DASHBOARD_MIGRATION_RESOLUTIONS` at the file. The migration refuses to run if the deployed configuration no longer matches the fingerprint.
4. Restart without `REDBOX_SKIP_MIGRATIONS`, using a single instance. Compare the dashboards with step 1, then check that the editor can save and copy.
5. Record the approved report and fingerprint, take the normal production backup, and repeat steps 4–5 in production.

The recovery snapshot is evidence, not an automatic rollback. To roll back, restore the matching previous application, hooks, assets and the database backup; settings edited after the upgrade cannot be translated back to profiles and overrides.
