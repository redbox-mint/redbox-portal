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
|- exposedConfigPaths
|
|- additionalContextRoots
|
|- maxTemplateNesting / maxTemplateExpressions
|- maxSubjectBytes / maxBodyBytes
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
| settings/exposedConfigPaths | Dotted config paths copied into `sailsConfig`; non-secret values only. Defaults to `['appUrl']`. | No | `['appUrl', 'publicContact.email']` |
| settings/additionalContextRoots | Extra hook display roots permitted in DB overrides; defaults to `[]`. | No | `['scuEmail']` |
| settings/maxSubjectBytes | UTF-8 byte cap on source and rendered subject; defaults to `998`. | No | `998` |
| settings/maxBodyBytes | UTF-8 byte cap on source and rendered body; defaults to `1048576` (1 MiB). | No | `1048576` |
| settings/maxTemplateNesting | Maximum combined block and subexpression nesting, including chained `else if`. Checked before parsing; defaults to `64`. | No | `64` |
| settings/maxTemplateExpressions | Maximum expression statements plus subexpressions per subject or body. Checked before parsing; defaults to `1024`. | No | `1024` |
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
  templateDir: "views/emailTemplates/",
  exposedConfigPaths: ["appUrl"]
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
|- description (optional)
|
|- template
|
```

| Field            | Description                                                                                                                                                                              | Required | Example        |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|----------------|
| < email-code >    | The email code used by the application to find the configuration to trigger an email | Yes      | transferOwnerTo           |
| < email-code >/subject    | The email's subject; omitted entries use `defaults.subject` | No | Ownership of DMP record/s has been transferred to you |
| < email-code >/description | Plain-string purpose and trigger description for administrators; never rendered as Handlebars or sent | No | Sent to the new custodian when an ownership transfer uses this template. |
| < email-code >/template    | The template file (located in the directory specified in the settings/templateDir property) to use to render the contents | Yes      | transferOwnerTo |

### Example
```
templates: {
  transferOwnerTo: {
    subject: 'Ownership of DMP record/s has been transferred to you',
    template: 'transferOwnerTo',
    description: 'Sent to the new custodian when an ownership transfer uses this template.'
  }
}
```

Descriptions appear as optional `description` values in both catalogue and editor-state
API responses. The catalogue's `subject` remains the supplied default subject, separate
from the purpose description. File-only/hook templates can omit a description; the
editor must not invent a trigger. Startup rejects non-string descriptions, including
`null`. An empty string is allowed. These values belong to supplied configuration;
draft, publish and reset only change subject, body and format.

The seven bundled templates have these purposes:

| Template | When it is used | Source of the description |
| --- | --- | --- |
| `integrationFailure` | Sent to configured recipients when an integration fails and failure notifications are enabled. | `IntegrationNotificationService.dispatch` status/config/throttle gates and `EmailChannel.send` default template selection. |
| `integrationRecovery` | Sent after a previously notified integration failure succeeds, if recovery alerts are enabled. | The same service's success branch requires a cached prior notified failure and `recoveryAlerts`. |
| `publicationStaged` | Sent to the chief investigator, data manager and supervisor when a draft publication is queued for publishing. | Dev-hook `recordtype.ts` dataPublication create/update post-save trigger: notification state `draft`, workflow stage `queued`. |
| `publicationReview` | Sent to the configured reviewer after the staged notification succeeds, to review the queued publication. | The staged trigger's `onNotifySuccess` chain. |
| `publicationPublished` | Sent to contributors, creators and the reviewer when a reviewed publication becomes published. | Dev-hook create/update trigger: notification state `emailed-reviewing`, workflow stage `published`. |
| `transferOwnerTo` | Notifies the new custodian when an RDMP ownership transfer uses this template; core config has no automatic trigger. | Supplied subject/body and email service integration fixture; no core service or workflow caller is configured. |
| `test` | Example for explicitly requested test notifications; core config has no automatic trigger. | Supplied subject/body and template rendering examples; no automatic core caller. |

Publication descriptions describe the bundled demo workflow. Hooks with different
triggers or recipients should override the description alongside their template config.
Adding a description does not enable a notification or change any recipient/trigger rule.

### Email Templates

Email templates are located in the directory defined in the `settings/templateDir` property of the `config/emailnotification.js` file. Bodies are `.hbs` files written in [Handlebars](https://handlebarsjs.com/), compiled with `strict: true` and the shared ReDBox helpers. Subjects also support Handlebars. Missing required display values fail rendering; guard optional values with `if` or use the shared `get` helper.

#### Example
```
<h1>Hello!</h1>
<p>This is a test email from ReDBox Portal</p>
<p>Data: {{data}}</p>
```


## Email render context

Email bodies (supplied files and database overrides), subjects and Handlebars address fields receive constructed `portal` and `sailsConfig` values on every send. Caller data cannot replace these reserved values. The full `sails.config` object is never added to template data.

- `portal.appUrl`: the configured application URL.
- `portal.brandName`: the name resolved from the trusted stage-1 `brandId`, never a brand ID/name in display data.
- `portal.brandUrl`: the brand's portal URL, built like `BrandingService.getFullPath`: application URL, the configured HTTP root context (if any), the resolved brand name and `auth.defaultPortal` (for example `https://portal.example/root/default/rdmp`). Empty unless the application URL, brand and default portal are all known.
- `portal.portalName`: the configured `auth.defaultPortal`; the current delivery context carries no request-specific portal.

All four keys are always present and contain strings. Unknown values are empty strings, so these paths work with strict Handlebars even without brand context. In particular, a legacy call without a brand gets empty `brandName` and `brandUrl`; it does not infer the default brand. For example, `{{portal.brandName}}` and `{{portal.appUrl}}` can be used in subjects or bodies.

`sailsConfig` is a compatibility alias containing **only `appUrl` by default**. `appUrl` is always present (empty string if unknown), including when the configured allowlist is empty. If `emailnotification.settings` is absent (for example in a minimal hook or test application), the default allowlist `['appUrl']` applies. Configure `sails.config.emailnotification.settings.exposedConfigPaths` to expose additional **non-secret values only**:

```javascript
settings: {
  exposedConfigPaths: ['appUrl', 'publicContact.email']
}
// A copy of sails.config.publicContact.email is available as:
// {{sailsConfig.publicContact.email}}
```

Paths must be non-empty strings with non-empty dot-separated segments and no surrounding whitespace. `__proto__`, `constructor` and `prototype` segments are rejected. The allowlist is validated at bootstrap, so an invalid entry or unsupported value fails startup with an error naming the offending entry or path; the same checks run again on every render in case configuration changes at runtime, failing that render rather than exposing extra config. Only own data properties are read. Values must be plain, acyclic data (primitives, arrays and plain objects); functions, class instances, accessors and nested prototype keys are rejected. Values are deep-copied, so templates and hooks cannot mutate live configuration through this alias. Allowlisting an object exposes all its plain descendants: prefer specific leaf paths and never allowlist credentials or a broad secret-bearing subtree.

A path that does not exist (or has value `undefined`) is omitted, with a warning once per path per EmailService instance. Referencing an omitted path directly may fail strict rendering; use `{{get sailsConfig "publicContact.email" ""}}` for optional values. Warnings identify paths, never their values.

### Migration for templates and hooks

Existing `{{sailsConfig.appUrl}}` and `{{get sailsConfig "appUrl" ""}}` expressions continue to work. Templates that read other config paths must move to `portal`, receive explicit hook display values, or have a deployer allowlist the required non-secret paths. Hook JavaScript can still read `sails.config` directly. Preserve the three-argument `buildFromTemplateAsync(name, data, response)` override and pass the same response to `super`; injected display values such as SCU's `scuEmail` remain available to bodies and selected subjects. Reserved aliases are reconstructed after hook injection too.

Bodies and subjects receive a **constructed record**, for supplied files and DB overrides on every path (record notifications, HTTP notifications, integrations, `sendTemplate`, direct builders and `runTemplate`). All of `record.metadata` is retained as a copy; deployers remain responsible for what their metadata contains. The record schema is:

| Path | Purpose |
|---|---|
| `record.oid` and top-level `oid` | Record link/identifier; explicit top-level OID takes precedence, otherwise `record.oid`/`record.redboxOid`. |
| `record.redboxOid` | Legacy alias of the curated `record.oid`, including via `imports.record.redboxOid`; no other stored-record internals are restored. |
| `record.viewUrl`, `record.editUrl` | Optional portal links to view or edit this record, using the curated OID. |
| `record.metadata` | All record metadata for display. |
| `record.dateCreated`, `record.lastSaveDate` | Creation and modification display dates. |
| `record.workflow.stage`, `record.workflow.stageLabel` | Workflow status and human-readable label. |
| `record.metaMetadata.type` | Display record type. |
| `record.metaMetadata.brandId` | Display tenant identity; never used to infer the trusted render brand. |
| `record.metaMetadata.createdBy` | Creator attribution. |
| `record.metaMetadata.createdOn`, `record.metaMetadata.lastSaveDate` | Compatibility date aliases used for record provenance displays. |

No other record fields cross this boundary: authorization lists, stored authorization, internal IDs/revisions, lifecycle/harvest fields, search core, form/package configuration and attachment-field lists are excluded. The legacy `imports` object is unused by the seven core and 19 SCU `.hbs` templates inspected, but is retained for other hooks as **only** `{ record, oid }`, with the same curated record; it cannot retain a second raw record. Caller data is not mutated. Integration payload fields and explicit hook display roots retain their existing values. `to`, `cc`, `bcc` and `from` templates still receive the **full record and original imports** for recipient resolution, with the restricted `portal`/`sailsConfig` values. Definitive subject rendering for template sends happens after hook injection so hook values are available for supplied subjects too. `sendMessage` continues accepting already-rendered strings, subject to the output protections below.

When a record is present, the optional root `title` copies `record.metadata.title`
when it is a string, unless the caller supplied `title`. The optional
`record.viewUrl` and `record.editUrl` values are
`${portal.brandUrl}/record/view/${encodeURIComponent(oid)}` and
`${portal.brandUrl}/record/edit/${encodeURIComponent(oid)}`, using the curated OID.
URLs are derived only when the brand URL and OID are non-empty strings; otherwise
they are omitted. Existing string values on the incoming record, including empty
strings and edits in preview Context JSON, take precedence over derivation.
The legacy `imports.record` alias contains the same URLs. No values are derived
without a record. The root `recordUrl` is supplied only by integration payloads
or callers; core does not derive it for record emails. Integration payload values
retain their existing behavior.

### Record and integration preview contexts

The Admin editor exposes a server-selected context kind. `record` is the default.
`integrationFailure` and `integrationRecovery` always use `integration`; other IDs
use it when named by an email channel's `template` in the brand's resolved
`integrationNotification` app config, including `perIntegration.*.channels`.
Disabled channels/configurations still count. Core reads only that brand's
app config using the integration dispatch resolver (DB configuration or global
defaults); it does not inspect other brands, guess from template content, or
cache classifications. If resolution fails, only the two core defaults qualify.
Minimal apps without an app-config resolver use the global defaults.

Integration previews offer a schema-generated sample alert and **Reset sample**,
with editable Context JSON and no record type/stage selector or record lookup.
The field tree and autocomplete describe the flat `IntegrationNotificationPayload`
contract, including required/optional fields and `kind`/`severity` enums, plus the
same restricted `portal` and `sailsConfig` objects used by sends. There is no
`record` or `imports` object. Core samples match failure/recovery to the template;
custom channel templates start with failure data. Sample `recordUrl` uses the
brand's portal view URL and an encoded sample OID, with ISO timestamps for date
fields. Optional payload fields can be removed or edited for preview.

Preview follows the integration `buildFromTemplate` path with trusted route
`brandId` and payload `title` as the runtime default subject. Unchanged supplied
defaults use that title; override subjects take precedence. The payload is not
curated as a record. Integration schema lint reports unknown fields with safe
suggestions and warns about unguarded optional fields such as `recordUrl`.
Use `{{#if recordUrl}}...{{/if}}` or `{{#if (isDefined durationMs)}}...{{/if}}` to
guard optional values. Both bundled integration templates have zero warnings.

### Persisted-template expression validation

Create/update validate Handlebars syntax **and AST expressions** in both fields. Partials (including dynamic partials and partial blocks) and decorators are rejected. Explicit helper calls must name a currently registered Handlebars helper: built-ins and the shared `sails-ng-common` helpers remain available, including `json`. Quoted helper names are supported in calls, blocks and subexpressions; other literal heads follow Handlebars' conversion to a helper name and must also be registered. This validates helper existence; a narrower helper allowlist is deferred. Triple-stash output remains allowed because HTML is sanitised at delivery.

Recognised top-level roots are `record`, `oid`, `imports`, `portal`, `sailsConfig`, legacy core `name`/`data`, and all integration payload keys: `kind`, `title`, `summary`, `severity`, `redboxOid`, `brandId`, `integrationName`, `integrationAction`, `status`, `triggeredBy`, `message`, `errorDetail`, `httpStatusCode`, `traceId`, `spanId`, `startedAt`, `completedAt`, `durationMs`, `recordUrl`, `timestamp`. Metadata/payload descendants are dynamic; validation checks roots, not whether a nested field exists. `this`, explicit current-context paths, Handlebars data variables (`@index`, `@key`, `@first`, `@last`, `@root`), lexical block params and relative parent paths are supported. Strict runtime rendering still validates actual data availability.

Save-time validation is an **authoring policy**, not a proof that a template can or cannot render. It is not the data-exposure boundary: the constructed render context is, and strict rendering still fails at send time for anything missing. The policy rejects, wherever they appear (including branches that would never run): partials and decorators, and invocations of unregistered helpers. An `@`-prefixed invocation head is always treated as a data variable or block parameter, never as a helper, so helpers whose registered names begin with `@` cannot be called from overrides. It rejects unknown roots where the context is certainly the template's root data: bare paths, `this.X` and `./X` at the top level (outside any block), **including as helper or block arguments** (for example `{{#if unknown}}` or `{{concat oid unused=unknown}}`, even though Handlebars would treat the missing value as empty there), and explicit `@root.X` anywhere, unless a block parameter named `root` is in scope (Handlebars resolves that name first). A template that violates the policy is rejected even if it would render. `../unknown` at the top level has no parent context, so it is accepted and fails strict rendering.

Inside **any** block, including the built-in `if`/`unless`, `each`, `with`, implicit/section blocks and custom block helpers, relative paths are left to render time. Helper context semantics cannot be established reliably (helpers can be replaced or wrapped), so no block is trusted to preserve the root context. For example, `{{#if oid}}{{unknown}}{{/if}}` and `{{#record.metadata.enabled}}{{this.unknown}}{{/record.metadata.enabled}}` pass validation and fail strict rendering. Block parameters belong to their declaring program's lexical scope (including nested programs), end at its boundary and cannot be reached through `../`, `this.` or `./`. A block parameter used as an invocation head, with or without an `@` prefix (such as `(get)` or `(@get)` for `as |get|`), is a value rather than a helper call: Handlebars resolves it first and ignores its arguments, so neither the head nor its arguments are checked. A dotted head such as `p.title` for `as |p|` is also a lexical value (not an unknown helper), but Handlebars still evaluates its arguments, so they are checked as usual.

Unknown roots in certain root contexts are **errors**, not warnings. Unknown roots inside context-changing blocks and missing dynamic metadata keys can pass this authoring check and surface as strict rendering failures. Handlebars can instead return an empty value for a missing property reached through a block parameter. The constructed curated render context is the data-exposure boundary: data that is not passed in cannot be rendered. Root validation does not expand that context and is not a security boundary. Hooks must explicitly declare extra display roots for references in certain root contexts:

```javascript
settings: {
  additionalContextRoots: ['scuEmail'] // default []
}
```

Entries must be simple identifiers, without dots, whitespace or prototype names. This setting allows names; it does not populate their values or expose additional record/config internals. SCU deployments using DB overrides must add `scuEmail`. Supplied files retain their trusted hook-specific root vocabulary without this setting; they still use curated records, syntax/length validation and delivery sanitisation. A stored override is checked again against current configuration/helpers on every read/render, even if a caller replaces its subject. Removing a root can therefore invalidate existing overrides.

AST and syntax failures use `EmailTemplateError` with `code: 'INVALID_TEMPLATE'`, a content-free message and structured `diagnostic: { field, reason, line, column }`. Reason categories include `UNKNOWN_CONTEXT_ROOT`, `UNKNOWN_HELPER`, `UNSUPPORTED_CONSTRUCT`, `TOO_COMPLEX` and the syntax reasons `UNCLOSED_BLOCK`, `MISMATCHED_CLOSE`, `UNEXPECTED_TOKEN` (older clients/servers may use `INVALID_SYNTAX`); lines and columns are one-based. Unclosed blocks point at their opening; mismatched closes point at the closing tag. Syntax diagnostics may include `helper`, restricted to the fixed names `each`, `if`, `unless`, `with`; arbitrary helper/path names are never returned. There is no `diagnostic.expression`, even for plain identifier paths or management calls. Template text, subjects, bodies and exception-provided names/codes are never copied into diagnostics, chronicles, logs or audit reports. Editors can use the location to highlight their separately authorised source. Missing data remains `RENDER_FAILED`.

Audit stored overrides without aborting on the first invalid row:

```typescript
const failures = await EmailTemplateService.reportInvalidOverrides(brandId);
// [{ brandId, templateId, id, revision, code, message, diagnostic? }]
```

The method reads raw rows for the requested validated brand and reports failures under current validation, including unknown template IDs, identity/revision errors, AST failures and limits. It returns no body/subject content and performs no writes. Unlike `list`, it continues past invalid rows. It is a backend-only method with the same trusted-code authorization boundary as other management methods.

### HTML sanitisation and delivery failures

Every `html` delivery, including supplied templates, DB overrides and already-rendered `sendMessage` calls, passes through `DomSanitizerService.sanitizeEmail` using `sails.config.dompurify.profiles.email` (defined in `packages/redbox-core/src/config/dompurify.config.ts`). The email profile permits paragraphs/divs/spans, common emphasis, sub/sup, headings, quotes/code, lists, tables/captions/rows/cells and images. Attributes cover presentation (`class`, `title`, `style`, dimensions/alignment and table attributes), link `href`, image `src`/`alt` and list numbering. Inline style declarations are retained for email layout, but CSS resource loading/execution constructs (`url()`, `image-set()`/`image()`/`src()`, unsafe protocols, `expression()`, at-rules, escapes/comments, `behavior`, `-moz-binding`) cause the style attribute to be removed. This is intentionally a presentation profile, not a full CSS parser.

Only absolute HTTP/HTTPS or `mailto:` links and absolute HTTP/HTTPS image sources are allowed. Remote images may come from **any host**, to support institution-hosted logos and content. Relative/protocol-relative references, `cid:`, `data:`, `javascript:` and `vbscript:` URLs are removed; attribute-specific checks also block DOMPurify's usual data-image exception. No script/style elements, iframe/object/embed, forms/inputs, SVG/MathML, event attributes or data attributes are permitted. The explicit tag/attribute lists keep ordinary email formatting without enabling interactive content. Deployers can adjust the profile but must preserve these safety restrictions.

Unsafe markup is stripped and the email still sends. The request chronicle records `emailSanitisationRemovedMarkup: true` when real disallowed content is removed, with no body/subject or sanitizer exception content. DOM normalisation (such as tag casing, quote changes or inserted `tbody`) and removal of DOMPurify's synthetic `BODY` wrapper do not count; disallowed attributes on that wrapper still count. A missing email profile is checked explicitly to prevent `getDOMPurifyConfig` falling back to another profile. Missing profiles, unavailable sanitizer services or sanitizer exceptions fail delivery with typed `SANITISATION_FAILED`; unsanitised output is never sent. Text-format bodies are passed through unchanged. Existing HTTP error envelopes handle delivery validation errors.

### Subjects and content limits

Final rendered subjects lose CR/LF, C0/C1 controls, DEL and Unicode line/paragraph separators before delivery. Subjects are not HTML-sanitised. Length checks count **UTF-8 bytes** and apply to both source and rendered subject/body, for files, stored overrides and caller overrides, plus already-rendered direct sends. Rendered body length is checked before sanitisation and again afterwards; the subject cap is checked before controls are removed. Oversized content fails with typed `LENGTH_LIMIT`; it is never silently truncated. Invalid cap settings fail bootstrap/render with `INVALID_TEMPLATE`.

`settings.maxSubjectBytes` defaults to **998**, the SMTP header line limit (transport folding/encoding still applies); this comfortably accommodates ordinary notification subjects while rejecting runaway metadata expansion. `settings.maxBodyBytes` defaults to **1048576 (1 MiB)**, leaving room for detailed institutional HTML tables while bounding parsing, compilation and delivery work. Both must be positive safe integers. Source limits apply to unrendered Handlebars too, so raise a limit deliberately if a large template expression needs more room. These are content budgets, not total MIME message/attachment limits.

`settings.maxTemplateNesting` (default **64**) and `settings.maxTemplateExpressions` (default **1024**) bound synchronous parser work for every subject and body, including supplied defaults. Both must be positive safe integers and are validated at startup. The shared pre-parse scan counts block statements, printed/helper expressions and subexpressions; combined block/subexpression depth includes each chained `else if` as another level. Closing tags, plain `else`, comments, escaped mustaches, quoted/segment literals and raw-block contents do not add expressions. Exceeding either bound returns a content-free, blocking `TOO_COMPLEX` validation diagnostic before Handlebars parses. Validate, preview, draft save and publish all use this policy; invalid drafts remain editable, but cannot publish. Schema lint uses the same counter and its warnings remain advisory.

### Deferred work

A narrower helper allowlist/removing `json`, Handlebars prototype-access options, restrictions on the existing `sendNotification` endpoint, recipient rules, schedules, SMTP, conditions and post-send actions remain outside template administration. See [Email Template Administration](Email-Template-Administration) for the authorized draft, publish, history and preview API and admin page integration.

## Brand-specific persisted overrides (stage 1)

`EmailTemplateService` manages optional overrides of the supplied hook/core templates. The [email template administration API](Email-Template-Administration) provides a brand Admin boundary for draft, publish, reset, restore and preview operations. Direct service calls remain trusted application code; do not expose these methods through a generic service-invocation endpoint.

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

All methods return promises. Content is a complete `{ subject, body, format: 'html' | 'text' }` unit; `updatedBy` is an optional trusted actor identifier. Created/updated timestamps are assigned by the native persistence boundary; live mutations also insert an audit history version.

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

Create/update validate brand existence, a known template with a valid supplied default, allowed format, non-empty subject/body, source byte limits, Handlebars syntax and AST expressions as described above. Actual required data is checked at render time. `resolve(templateId, brandId?)` returns the selected raw unit with `source`, and with brand, `id` and revision for an override.

A unique compound Mongo index enforces identity, supplemented by a collision-free unique `uid`. Bootstrap explicitly creates the compound index even with `migrate: safe`; index failure fails startup. Concurrent creates fail with `EmailTemplateConflictError` (`code: REVISION_CONFLICT`). Updates put the expected version token (`_id` plus `revision`) in a native Mongo `findOneAndUpdate` predicate and write the next permanently allocated lifecycle version with an updated timestamp. Failed or rolled-back reservations consume versions, so the new revision can exceed the previous live revision by more than one. The installed sails-mongo fetched Waterline update/destroy implementations first select IDs and then write by ID alone, discarding the original revision condition; this service therefore uses native atomic operations for update and reset. Missing/stale rows and conflicting reset operations fail with the same typed conflict. Reset uses a native conditional `deleteOne` and returns the supplied default; it never writes a default copy. Versions advance across reset/recreate, including a version for each reset. Because the token also includes the row ID, a stale token from before a reset/recreate cycle can never update or delete the replacement override.

Atomic writes need native Mongo access to the `EmailTemplate` datastore. If the datastore's adapter is `sails-mongo` but the native manager or driver `ObjectId` is unavailable, bootstrap fails with `PERSISTENCE`. On another adapter (for example a sails-disk test application), bootstrap logs a warning and skips index creation, reads and supplied defaults keep working, and `create`/`update`/`reset` and admin mutations fail with `PERSISTENCE` rather than falling back to a non-atomic write.

Other errors use `EmailTemplateError` codes `UNKNOWN_BRAND`, `UNKNOWN_TEMPLATE`, `MISSING_DEFAULT`, `INVALID_TEMPLATE`, `PERSISTENCE`, `RENDER_FAILED`, `SANITISATION_FAILED` and `LENGTH_LIMIT`. Rendering retains the existing `{ status: 500, body: 'Templating error.', ex }` failure envelope with a typed `ex`; record sends and `sendTemplate` throw it, HTTP returns an error, and integration delivery logs failure and reports unsuccessful delivery.

### Rendering extension contract and caching

`buildFromTemplateAsync(templateId, data = {}, response = {})` keeps its existing **three-argument signature**. Hooks may add display values to `data`, then pass the same `response` object to `super`. The public `buildFromTemplate(..., context)` wrapper associates trusted context with that response object in a private WeakMap. Do not replace the response object in a hook: doing so loses the context. This preserves SCU's `scuEmail` display-value injection for both supplied and DB bodies, and also makes that data available to selected subjects. For branded async rendering, use the public wrapper; adding a fourth argument to an existing hook override would lose context.

Successful wrapper renders return `{ status: 200, body, subject, format, source, revision }` when a context argument is supplied (an empty `{}` context selects supplied defaults). The legacy two-argument call `buildFromTemplate(id, data)` keeps its body-only behaviour: supplied defaults only, no subject is rendered, so subject-only display data is not required. Delivery code must use the `subject` and `format` on the completed build result. `evaluateProperties` remains synchronous for address resolution and returns its existing `templateRendered` Observable; for branded calls its preliminary `subjectRendered` may be unrendered until the selected source is known. Await the build result for the definitive subject/format. The reserved render values are constructed as described in **Email render context** above, including for legacy direct builder calls and `runTemplate`.

Every branded render queries the DB; there is no override-query cache or DB compilation cache. Changes are visible to every process on the next send, including delete/recreate cycles. Supplied file compilation retains the existing per-process filename cache (restart after editing a supplied file). DB compilation caching, if added later, must include brand, template ID and revision plus generation/content identity across reset/recreate.

Restricted configuration, curated record context, persisted-expression validation/reporting, HTML sanitisation and subject/length hardening also apply to administration and preview. See [Email Template Administration](Email-Template-Administration) for lifecycle, API, retention and consistency details.
