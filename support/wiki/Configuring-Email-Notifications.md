# Configuring Email Notifications

## Introduction

The ReDBox portal has a flexible email notification system that can be customised to your needs.

## Configuring Email Settings

The `config/emailnotification.js` file provides configuration properties relating to the sending of emails.

```
api
|
|- send
|
settings
|
|- enabled
|
|- from
|
|- templateDir
|
defaults
|
|- from
|
|- subject
|
|- format
|
templates
|
|- <template name>
    |
    |- subject
    |
    |- template
|
```
Where <> are property labels that are variables.

| Field            | Description                                                                                                                                                                              | Required | Example        |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|----------------|
| api/send    | The URL and HTTP method of the API endpoint to send emails (via ReDBox) | Yes      | N/A           |
| settings    | Section used to capture email notification settings  | Yes      | N/A           |
| settings/enabled    | Whether email notifications are enabled | Yes      | true         |
| settings/from    | The from address to use when sending emails | Yes      | noreply@redboxresearchdata.com.au         |
| settings/templateDir    | The template directory that contains the email template files | Yes      | views/emailTemplates/        |
| defaults   | Section used to capture default properties for emails (when not otherwise set) | Yes      | N/A          |
| defaults/from    | The default from address | Yes      | redbox@redboxresearchdata.com.au             |
| defaults/subject    | The default from email subject | Yes      | A notification from ReDBox         |
| defaults/format    | The email format, can either be in HTML or plain text | Yes      | html         |

### Example
```
api: {
  send: {method: 'post', url: "/api/v1/messaging/emailnotification"}
},
settings: {
  enabled: true,
  from: "noreply@redbox",
  templateDir: "views/emailTemplates/"
},
defaults: {
  from: "redbox@dev",
  subject: "ReDBox Notification",
  format: "html"
},
```

## Customising Email Templates

Both the subjects and the contents of email notifications can be customised via configuration and templates.

### Configuring email subjects and templates
The templates section of the `config/emailnotification.js` file contains configuration to customise the subject and template for an email notification.

```
<email-code>
|
|- subject
|
|- template
|
```

| Field            | Description                                                                                                                                                                              | Required | Example        |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|----------------|
| < email-code >    | The email code used by the application to find the configuration to trigger an email | Yes      | transferOwnerTo           |
| < email-code >/subject    | The email's subject | Yes      | Ownership of DMP record/s has been transferred to you |
| < email-code >/template    | The template file (located in the directory specified in the settings/templateDir property) to use to render the contents | Yes      | transferOwnerTo |

### Example
```
templates: {
  transferOwnerTo: {subject: 'Ownership of DMP record/s has been transferred to you', template: 'transferOwnerTo'}
}
```

### Email Templates

Email templates are located in the directory defined in the `settings/templateDir` property of the `config/emailnotification.js` file. Bodies are `.hbs` files written in [Handlebars](https://handlebarsjs.com/), compiled with `strict: true` and the shared ReDBox helpers. Subjects also support Handlebars. Missing required display values fail rendering; guard optional values with `if` or use the shared `get` helper.

#### Example
```
<h1>Hello!</h1>
<p>This is a test email from ReDBox Portal</p>
<p>Data: {{data}}</p>
```


## Brand-specific persisted overrides (stage 1)

`EmailTemplateService` manages optional overrides of the supplied hook/core templates. There are no management HTTP endpoints or editor UI in stage 1. Call this backend service only from trusted application code; any future API must provide its own authorization. Do not expose it through a generic service-invocation endpoint.

The stable template ID is the key in `sails.config.emailnotification.templates`. Its `template` property selects the `.hbs` filename (without extension). Existing file-only IDs in `settings.templateDir` are also supported for bundled templates and legacy hooks. IDs use letters, digits, underscores, dots and hyphens and cannot be paths. Hook config and template directories continue to supply defaults, including recipient aliases; no default rows are seeded or copied into storage. `format` can optionally be set per configured template, falling back to `defaults.format`.

For an explicitly supplied brand ID, each render validates that the brand exists and queries the indexed `(brandId, templateId)` override identity. An override supplies **subject, body and format together**. If no row exists, the current supplied configuration and file supply all three. DB failures and invalid stored rows fail rendering and are logged; they are never treated as a missing override. A known configured ID with a missing file fails with `MISSING_DEFAULT` when the default is needed. A valid override can still render if its supplied file later disappears, but management writes/reset require a valid supplied default so reset cannot silently install a broken fallback.

| Value | First choice | Second choice | Supplied default |
|---|---|---|---|
| Subject | Explicit caller `subject` | Brand override subject | Template config subject, then global default subject |
| Body | Brand override body | — | Configured `.hbs` body (or the legacy filename) |
| Format | Explicit caller `msgFormat` / `format` | Brand override format | Template config format, then global default format |

An explicit caller subject is still rendered with Handlebars; explicit subject/format values must also pass validation. Integration notifications retain their generated payload title as the runtime default subject, including custom channel templates; a DB subject takes precedence over that title. Addresses, `otherSendOptions`, conditions, schedules, SMTP settings and post-send hooks remain outside the override.

### Trusted brand propagation and legacy calls

- `sendRecordNotification(oid, record, options, user, response)` obtains the brand from `record.metaMetadata.brandId`, including workflow, save hooks and scheduled jobs that invoke this method. `options.brandId` is ignored. No hook options or email IDs need changing.
- HTTP `EmailController.sendNotification` resolves the brand ID from the route/policy's resolved brand name (`req.options.locals.branding`, or the route's `req.params.branding`). It does not use a body or display-data brand ID. An unresolved brand fails the request.
- Integration notifications carry their persisted audit/job `brandId` through dispatch and `EmailChannel` to the renderer. An explicitly unknown brand fails; it cannot select the default brand's template. Legacy integration jobs without a brand retain their existing notification-config lookup, but render **supplied templates only**.
- Non-record callers and custom jobs pass `{ brandId }` as the final argument: `buildFromTemplate(id, data, context)`, `sendTemplate(to, subjectOrUndefined, id, data, context)`, or `evaluateProperties(options, config, data, context)`.
- Missing brand context means supplied defaults only, **including when the installation's default brand has an override**. Display data is never used to infer a tenant. This preserves legacy behavior and prevents an ambiguous background call from using another tenant's content. Empty, null or unknown explicitly supplied IDs fail instead of falling back.
- `sendTemplate` now returns a promise for delivery; background callers should await it so render/delivery failures are observable.
- `sendMessage` sends an already rendered message and does not resolve templates or brands.

### Backend management contract

All methods return promises. Content is a complete `{ subject, body, format: 'html' | 'text' }` unit; `updatedBy` is an optional trusted actor identifier. Created/updated timestamps are supplied by the existing Waterline model defaults.

```typescript
const defaults = await EmailTemplateService.getDefault(brandId, templateId);
const override = await EmailTemplateService.get(brandId, templateId); // null if absent
const overrides = await EmailTemplateService.list(brandId); // overrides only
const created = await EmailTemplateService.create(brandId, templateId, content, actorId);
// Version token: { id, revision } of the override the caller last read.
const edited = await EmailTemplateService.update(brandId, templateId, content, { id: created.id, revision: created.revision }, actorId);
await EmailTemplateService.reset(brandId, templateId, { id: edited.id, revision: edited.revision });
// Compare-and-set convenience: null (no override seen) creates, a version token updates.
await EmailTemplateService.upsert(brandId, templateId, content, expectedVersionOrNull, actorId);
```

Create/update validate brand existence, a known template with a valid supplied default, allowed format, non-empty subject/body and strict Handlebars syntax. Precompilation validates syntax eagerly; actual required data is checked at render time. `resolve(templateId, brandId?)` returns the selected raw unit with `source`, and with brand, `id` and revision for an override.

A unique compound Mongo index enforces identity, supplemented by a collision-free unique `uid`. Bootstrap explicitly creates the compound index even with `migrate: safe`; index failure fails startup. Concurrent creates fail with `EmailTemplateConflictError` (`code: REVISION_CONFLICT`). Updates put the expected version token (`_id` plus `revision`) in a native Mongo `findOneAndUpdate` predicate and write `revision + 1` with an updated timestamp. The installed sails-mongo fetched Waterline update/destroy implementations first select IDs and then write by ID alone, discarding the original revision condition; this service therefore uses native atomic operations for update and reset. Missing/stale rows and conflicting reset operations fail with the same typed conflict. Reset uses a native conditional `deleteOne` and returns the supplied default; it never writes a default copy. Revisions start at 1 for each newly created override's lifetime; because the token includes the row ID, a stale token from before a reset/recreate cycle can never update or delete the replacement override.

Atomic writes need native Mongo access to the `EmailTemplate` datastore. If the datastore's adapter is `sails-mongo` but the native manager or driver `ObjectId` is unavailable, bootstrap fails with `PERSISTENCE`. On another adapter (for example a sails-disk test application), bootstrap logs a warning and skips index creation, reads and supplied defaults keep working, and `update`/`reset` fail with `PERSISTENCE` rather than falling back to a non-atomic write.

Other errors use `EmailTemplateError` codes `UNKNOWN_BRAND`, `UNKNOWN_TEMPLATE`, `MISSING_DEFAULT`, `INVALID_TEMPLATE`, `PERSISTENCE` and `RENDER_FAILED`. Rendering retains the existing `{ status: 500, body: 'Templating error.', ex }` failure envelope with a typed `ex`; record sends and `sendTemplate` throw it, HTTP returns an error, and integration delivery logs failure and reports unsuccessful delivery.

### Rendering extension contract and caching

`buildFromTemplateAsync(templateId, data = {}, response = {})` keeps its existing **three-argument signature**. Hooks may add display values to `data`, then pass the same `response` object to `super`. The public `buildFromTemplate(..., context)` wrapper associates trusted context with that response object in a private WeakMap. Do not replace the response object in a hook: doing so loses the context. This preserves SCU's `scuEmail` display-value injection for both supplied and DB bodies, and also makes that data available to selected subjects. For branded async rendering, use the public wrapper; adding a fourth argument to an existing hook override would lose context.

Successful wrapper renders return `{ status: 200, body, subject, format, source, revision }` when a context argument is supplied (an empty `{}` context selects supplied defaults). The legacy two-argument call `buildFromTemplate(id, data)` keeps its body-only behaviour: supplied defaults only, no subject is rendered, so subject-only display data is not required. Delivery code must use the `subject` and `format` on the completed build result. `evaluateProperties` remains synchronous for address resolution and returns its existing `templateRendered` Observable; for branded calls its preliminary `subjectRendered` may be unrendered until the selected source is known. Await the build result for the definitive subject/format. Full `sails.config` remains available as `sailsConfig` through `evaluateProperties` in stage 1.

Every branded render queries the DB; there is no override-query cache or DB compilation cache. Changes are visible to every process on the next send, including delete/recreate cycles. Supplied file compilation retains the existing per-process filename cache (restart after editing a supplied file). DB compilation caching, if added later, must include brand, template ID and revision plus generation/content identity across reset/recreate.

Stage 2 will restrict/sanitize render context and HTML. Stage 3 will add authorized administration, drafts/publication/history and editing-session identity. Stage 1 implements none of those features and does not narrow the existing render context.
