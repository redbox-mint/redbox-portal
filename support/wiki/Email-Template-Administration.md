# Email template administration

The brand's **Admin** role can draft, publish, reset and restore email templates. The page route is `GET /:branding/:portal/admin/email-templates`; its view loads the `email-templates` Angular application using the portal's existing admin layout. The Angular project supplies the editor. There is no separate publisher role, approval workflow, test send, SMTP configuration or recipient editor.

The JSON API is under `/:branding/:portal/app/email-templates`. Both prefixes require the current route brand's Admin role. Role IDs are checked against that brand, including on installations whose stored path rules predate the API. Body and query `branding`, `brandId` and actor fields never choose the tenant or audit actor. Actor ID and display name come from the authenticated user.

## Drafts, publication and defaults

The catalogue includes configured template IDs and valid file-only `.hbs` IDs in `emailnotification.settings.templateDir`. Reading the catalogue and editor never seeds or updates rows. The live `EmailTemplate` model remains the only database content consulted by sends. Absence of a live row continues to follow current hook/core defaults.

A draft is a separate `(brandId, templateId)` document. It contains subject, body, format, `draftRevision`, `baseVersion`, author identity and timestamps. `baseVersion` is the live `{id, revision}` token when the draft began, or `null` when it began from the supplied default. It is retained across autosaves. A private Mongo collection, `emailtemplatedraftrevision`, keeps a counter under a collision-free brand/template `_id`. Counter values survive draft deletion, preventing a stale autosave from matching a discarded and recreated draft. Failed CAS attempts can leave harmless gaps in draft revisions.

Draft saves return policy and syntax diagnostics and retain work in progress, including empty content. Invalid structure or excessive UTF-8 length is rejected. Publication requires a valid draft, its exact revision, and the expected live token (`null` to create an override). Discard and replacement also require the caller's draft revision. Conflicts return current live/draft counters and actor metadata; callers should preserve unsaved local text and reload.

Publishing copies the draft into the live override and deletes only the published draft revision. A newer concurrent autosave remains available and is reported by `draftRetained`. Reset inserts a reset event and removes the live override; it leaves drafts intact. Restore copies an applied `publish` or `restore-published` history entry **into the draft only**. Publishing that draft creates a new `restore-published` event. A reset history entry has no content and cannot be restored; start from the current supplied default instead.

Every successful live mutation advances a monotonic version: publish v1, reset v2, recreate v3. Direct trusted `EmailTemplateService.create/update/reset/upsert` calls use the same lifecycle. Row IDs remain part of live CAS tokens, so tokens from an earlier override lifetime cannot match a replacement.

The live row and history event store `defaultHash`, SHA-256 of the JSON array `[subject, body, format]` from the supplied default. If the current supplied content differs, the catalogue/editor returns `defaultUpdated: true`. This is a prompt to review the new default; it never changes the published override. Older pre-administration rows without a baseline hash cannot reliably detect earlier upstream changes; their first subsequent publication establishes the baseline.

## History and storage

`EmailTemplateHistory` is insert-only except retention pruning. Its unique `(brandId, templateId, version)` index prevents duplicate audit entries; version allocation is fenced independently of retention. Entries contain the event, content (all null for reset), restoration provenance, default hash, actor and creation time. Internal correlation fields record intended live ID, previous live token and published draft revision. They are excluded from API history responses.

`emailnotification.settings.historyMaxVersions` defaults to **50** and must be a positive safe integer. Oldest history is pruned after a successful live mutation. Pruning is bounded strictly below the pruning operation's own committed transition and the durable head's committed version. The head's live version and reservation are also protected. A delayed pruning task cannot delete a newer live version or an in-flight reservation. Retention can temporarily exceed the configured count during an incomplete transition. A pruning failure is logged as a content-free maintenance warning and leaves extra history for a later successful mutation to prune; it does not reverse or falsely fail a committed publication. No Mongo transactions are required.

The private native `emailtemplatelifecyclehead` collection has one permanent document per `(brandId, templateId)`. It holds `version` (the highest allocated version), `committedVersion` (the last applied transition), `liveToken` (the last committed live `{id, revision}`, or null), and `reservation` (an in-flight version, or null). It contains no subject/body. Every publish, reset and trusted create/update reserves by CAS on the head version and empty reservation before history insertion. Live writes retain the stage-1 ID/revision CAS. A reservation is never cleared on a failed or ambiguous storage result; other writers conflict, including when no live row exists. Head documents and reconciliation audit documents must never be removed by retention or ordinary cleanup.

Existing deployments need no migration/seeding. The first live mutation lazily derives a head from the existing live revision and latest retained history. Its unique index arbitrates concurrent initializers; each loser reloads the winning head. Stage-1 live rows with no history establish their existing revision as the baseline. Reads of the catalogue/editor do not create heads. An unmatched pre-head history event becomes an incomplete reservation requiring reconciliation.

Bootstrap creates unique indexes for the live identity, draft identity, history version, lifecycle-head identity and reconciliation identity/version, including under `migrate: safe`. The revision ledger uses Mongo's built-in unique `_id` index. Automatic action, REST and shortcut blueprints remain disabled. Writes require the model's native Mongo datastore/driver handles; another adapter can continue resolving supplied/live templates through the existing read path, but cannot perform admin writes.

## Preview and record access

For record templates, `record.redboxOid` is a compatibility alias of the curated
`record.oid`, including in `imports.record`; it never restores other stored-record
internals. Context JSON generated from a selected record includes `title` when its metadata
title is a string, and `record.viewUrl` and `record.editUrl` when the brand URL and
curated record OID are non-empty strings. The URLs use the brand's portal path,
`/record/view/` or `/record/edit/`, and an encoded OID. All three are editable plain
values: preview respects caller-supplied `title` and string URL edits, including
empty strings. Changing metadata or the OID does not update these values unless
they are removed or the context is reset from the record. Missing or non-string
URLs are derived again when their sources are available, and otherwise omitted.
The root `recordUrl` remains an integration payload field and is not derived for
record emails. The legacy `imports` alias is rebuilt from `record`, including its
URLs, on every preview and is not offered for editing.

The server returns `contextKind` in catalogue and editor responses: `record`
by default, or `integration` for `integrationFailure`, `integrationRecovery`, and
any valid template ID named by an **email** channel in the brand's resolved
`integrationNotification` app config, including every `perIntegration` override.
Disabled configurations/channels count too. Resolution uses the same brand-scoped
app-config resolver as integration dispatch (DB config or global defaults), with
no cross-brand search or cache. If resolution fails, only the two core IDs are
classified as integration. Minimal apps without the resolver use the global
default config. Non-email channels and unreferenced custom templates stay record
contexts; names and template content are not otherwise used to guess the kind.

Integration templates show **Sample integration alert** and **Reset sample** in
place of the record picker. They use the flat `IntegrationNotificationPayload`
fields plus `portal` and `sailsConfig`, without `record`, `oid` or `imports`.
The sample comes from schema examples, uses failure/recovery to match the core
ID (custom channel templates default to failure), and includes ISO timestamps
and a sample OID with the brand's encoded record view URL. No real-record lookup
is performed for integration samples. Context JSON remains editable, accepts the
same relaxed JSON, and reports advisory schema differences. Reset confirms before
replacing edited JSON. Samples and edits remain temporary per-template UI state.
Record type and stage selectors are hidden; the field source reads **Integration
alert fields**.

Integration preview calls `buildFromTemplate` with the route brand and payload
`title` as `defaultSubject`, then follows the usual async rendering hooks and
sanitisation without sending mail. Unchanged supplied-default content uses that
runtime subject; preview accepts optional `source: default|override` to distinguish
identical content (the editor supplies it for integration templates; omission
preserves legacy override-subject behavior). Draft and published override subjects
take precedence, including a draft created by saving unchanged default content. Payload
edits pass through without record curation; reserved portal/config values are
rebuilt from the trusted route brand just as on sends. Pre-render hook injection
cannot overwrite the edited preview payload, and post-render hooks still run.

The record picker uses the configured existing search service with ten results per page. It re-loads every candidate and rechecks exact `record.metaMetadata.brandId === brandId` and `RecordsService.hasViewAccess(brand, user, roles, record)`. A first-page exact OID lookup uses that same access boundary. Index totals and inaccessible candidate titles are not returned.

Record-context requests enforce both checks before running `EmailService.buildPreviewContext`. That method dispatches through the real three-argument `buildFromTemplateAsync` hook chain, captures curated display context after hooks run, and stops before rendering or sending. Supply the selected `templateId` query parameter for hooks whose display data depends on the template (including SCU). Omission selects the first configured template. Hook display roots must also be listed in `emailnotification.settings.additionalContextRoots` (for SCU, `['scuEmail']`) to appear in filtered context/help and be accepted in drafts. Configure that in deployment config or the companion hook; the core does not infer or widen the allowlist. Missing, foreign-brand and denied records all produce the same 403 error, without a record existence oracle. Admin status alone does not grant record view access.

The context endpoint returns `{context: object}`. The UI edits `JSON.stringify(context, null, 2)` and submits that **string** to preview. Preview preserves hook display roots only if they are present in the submitted JSON; it does not recompute them and overwrite edits. Roots come from the same core/context-root configuration as the validator. Unknown roots are dropped. Recursive copying reads only own data properties, removes `__proto__`, `constructor` and `prototype`, creates objects without a prototype and limits nesting to 64 levels. It never follows prototype properties or invokes getters.

Edited preview dispatches through the real `buildFromTemplateAsync` rendering hook chain, including hook code that post-processes subject/body after `super`. An internal response-object WeakMap selects the draft content and the already filtered, curated submitted context. Hooks execute with a separate copy; their pre-render injection cannot overwrite edited hook display values or add missing roots to the actual compile context. There is no send argument, notification input, or caller-controlled data property that selects this content override. Hooks must forward the response object to `super`, as on the delivery seam. After the entire hook chain returns, preview applies subject hardening, output byte limits and `DomSanitizerService.sanitizeEmail`, so hook-added output is checked too. It uses the same strict Handlebars instance/helpers as real delivery. HTML responses report only removed element/attribute names, never values, URLs or source excerpts. Text bodies remain text. Missing render data produces typed diagnostics with HTTP 400. No preview or other administration method creates a mail transport. The Angular app must place HTML in a sandboxed iframe with neither `allow-scripts` nor `allow-same-origin`.

`emailnotification.settings.maxPreviewContextBytes` defaults to **262144 (256 KiB)** and is validated at startup as a positive safe integer. It caps submitted context JSON before parsing and record-context JSON before return. Template source/output limits remain `maxSubjectBytes` (998 by default) and `maxBodyBytes` (1048576). Admin JSON bodies have an independent **8388608-byte (8 MiB)** streaming parser limit, allowing JSON escaping overhead while bounding allocations. Oversize requests return 413. The JSON parser matches the full `<rootContext>/<brand>/<portal>/app/email-templates` prefix by path segments; unrelated form and multipart paths containing the same substring continue through Skipper. Explicit configured body-parser skip paths retain precedence.

## HTTP contract

Send the session cookie, `Accept: application/json`, and `Content-Type: application/json` for bodies. Mutations retain standard Sails CSRF protection: obtain `/csrfToken?branding=<brand>&portal=<portal>` with the same session (or fetch the token after the session already has its brand) refresh it after login because Passport regenerates the session, and send its `_csrf` in `X-CSRF-Token`. The shared Angular HTTP client can use `enableCsrfHeader()` after configuration initializes. `X-Source: jsclient` follows portal convention; these routes return raw JSON independent of API wrapper selection.

Shared request/response interfaces are exported by `@researchdatabox/sails-ng-common`, from `packages/sails-ng-common/src/email-template-admin.model.ts`. Core shapes are `EmailAdminContent`, `EmailAdminEditorState`, `EmailAdminDraftResponse`, `EmailAdminMutationResponse`, `EmailAdminHistory`, `EmailAdminPreview`, `EmailAdminErrorResponse` and the endpoint-specific request/response types.

Paths below are relative to `/:branding/:portal/app/email-templates`. All successful calls return HTTP 200 and `Cache-Control: no-store`.

| Method / path | Request | Response |
|---|---|---|
| GET `/catalogue` | none | `{templates: EmailAdminCatalogueEntry[]}` |
| GET `/templates/:templateId` | none | `EmailAdminEditorState` |
| PUT `/templates/:templateId/draft` | `{content, expectedDraftRevision: number or null}` | `{draft, diagnostics}` |
| DELETE `/templates/:templateId/draft` | `{expectedDraftRevision: number}` | `{discarded: true}` |
| POST `/templates/:templateId/draft/from-default` | `{expectedDraftRevision: number or null}` | `{draft, diagnostics}` |
| POST `/templates/:templateId/validate` | `{content}` | `{diagnostics: []}`; invalid content returns 400 |
| POST `/templates/:templateId/preview` | `{content, context: JSON string}` | `{subject, html or text, sanitiserRemovals, diagnostics: []}` |
| GET `/preview-records` | `q` (0–200 chars), `page` (1–1000, default 1) | `{records: [{oid, title}], page, hasMore}` |
| GET `/preview-records/:oid/context` | optional `templateId` query | `{context: object}` |
| POST `/templates/:templateId/publish` | `{expectedDraftRevision: number, expectedLiveToken: {id, revision} or null}` | `{state: EmailAdminEditorState, draftRetained: boolean}` |
| POST `/templates/:templateId/reset` | `{expectedLiveToken: {id, revision}}` | `{state: EmailAdminEditorState, draftRetained: false}` |
| GET `/templates/:templateId/history` | none | `{versions: EmailAdminHistory[]}` newest first |
| GET `/templates/:templateId/history/:version` | positive integer version | `EmailAdminHistory` |
| POST `/templates/:templateId/history/:version/restore` | `{expectedDraftRevision: number or null}` | `{draft, diagnostics}` |

Service/controller errors have `{error: {code, message}, diagnostics: [{code, field, reason, line, column}], current?: {live, draft, latestVersion, lastChange}}`. Diagnostics contain no template text; line/column are one-based. Conflicts include `current` with safe counters and actor ID/name/time, including the latest reset/reservation actor when no live override remains. Validation/preview failures return 400, authorization/record-unavailable 403, unknown templates/versions or unavailable defaults 404, conflicts 409, limits 413, and storage/sanitizer availability failures 500. Standard Sails CSRF failures occur before the controller: with JSON negotiation they return 403 with `"CSRF mismatch"` outside production, or an empty body in production unless `keepResponseErrors` is enabled.

## Crash windows and operations

Publication orders checks/validation → head CAS reservation → history insert → live ID/revision CAS → head finalization → conditional draft deletion. Reset follows the same steps with a live deletion and no draft cleanup. History/head/reconciliation documents are never sources for sending.

| Failure window | Durable state and next send | Detection and action |
|---|---|---|
| Before head CAS | Previous live/default; no reserved version | Reload counters and retry. A delayed CAS fails if the head has advanced, even across reset and pruning. |
| Head reserved, history absent (including uncertain insert result) | Previous live/default; version consumed, other writers blocked | `INCOMPLETE_LIVE_TRANSITION`, including reservations with no history. Inspect after draining writers; roll back if history is absent. |
| History inserted, live write absent or uncertain | Previous live/default if not applied; intended content/default if applied | Reservation remains. Recovery compares live ID/revision or reset absence, then completes or rolls back safely. |
| Live applied, head not finalized (including ambiguous finalization result) | Intended live/default; reservation may remain | An outstanding reservation still reports `INCOMPLETE_LIVE_TRANSITION`. Recovery recognizes the applied write and finalizes it, even when rollback was requested. |
| Head finalized, published draft not deleted | New live content; exact published draft or newer autosave remains | `PUBLISHED_DRAFT_RETAINED` for the exact published revision. Reconciliation removes only that revision; it preserves a newer autosave. |
| Draft cleanup complete, response lost | New live/default and finalized head | Reload editor/history; stale tokens prevent blindly repeating the transition. |
| Pruning delayed or failed | Committed live/default; potentially extra old history | Content-free maintenance warning on failure. Bounded pruning never selects newer live/in-flight history. |
| Recovery decision audited, recovery interrupted | Reservation remains; audit fixes the recovery direction | Re-run reconciliation with the inspected version. It resumes the recorded decision and recognizes ambiguous applied writes. |

Consistency warnings remain in the existing editor/catalogue response shapes. `latestVersion` includes the durable highest allocated version even if history is absent or an operation was rolled back. Gaps are valid; the next mutation uses a greater version. Retained rolled-back history has `applied:false` permanently, including after later successful publications, and cannot be restored. History content is immutable; reconciliation decisions are separate content-free audit documents in `emailtemplatereconciliation`, uniquely indexed by brand/template/version. Those decisions survive normal history pruning. A rolled-back history entry can later be pruned under the normal content retention policy; the permanent decision and head still preserve the audit/version evidence.

### Console recovery procedure

`EmailTemplateService.reconcileTransition` is an operator service method. There is no HTTP route. Do not clear a head or delete history to unblock a template.

1. Put the affected deployment into maintenance for template writes. Stop/drain **all** web requests, background/hook jobs and trusted stage-1 writers that can mutate this brand/template. Terminate paused workers and drain any Mongo operations already dispatched by timed-out requests. Keep writers stopped until verification finishes. Reads/sends may continue only in processes that cannot write templates. A timeout alone does not prove a worker or its Mongo write has stopped. The separate Mongo documents cannot provide a transactional fence against a previously dispatched live insert; `writersQuiesced:true` is an operator assertion, not a distributed drain implementation.
2. Take a database backup. Open one Sails console against that database using the deployed fixed code and deployment configuration (for example `NODE_ENV=production node node_modules/sails/bin/sails.js console`), with background template writers disabled and the console instance inaccessible to HTTP clients. Use the database **brand ID**, not the route name. Run the following, replacing the identifiers. The inspection contains only counters/identity/booleans, so it is safe to print; never print raw live, draft or history documents.

   ```js
   var emailBrandId = 'DATABASE_BRAND_ID';
   var emailTemplateId = 'TEMPLATE_ID';
   var emailInspection = await EmailTemplateService.reconcileTransition(emailBrandId, emailTemplateId);
   console.log(emailInspection);
   ```

   Inspection is read-only and returns `version`, `committedVersion`, `pendingVersion`, `liveToken`, `historyPresent`, `liveMatchesTransition`, `previousLiveMatches`, `outcome` and `draftRetained`, together with the scoped IDs. For a headless deployment it derives this view without inserting a head. Do not proceed on unexpected identity/state; investigate from the backup without disclosing content in logs.
3. Choose the intended outcome. `complete` applies the preserved history if the previous live token still matches, or finalizes a write that already applied. `rollback` leaves the previous live/default unchanged and consumes the reservation version. If the intended live state already exists, either action completes it; recovery never rolls back content that may already have been delivered. With missing history, only rollback can release the unused reservation. A mismatch with both intended and previous state raises 409 and makes no speculative live write.

   ```js
   var emailRecovery = await EmailTemplateService.reconcileTransition(emailBrandId, emailTemplateId, {
     action: 'complete', // use 'rollback' to abandon an unapplied transition
     expectedVersion: emailInspection.version,
     writersQuiesced: true,
     actor: { id: 'OPERATOR_ID', name: 'Operator display name' }
   });
   console.log(emailRecovery);
   ```

   The expected version must match the inspection. A unique audit decision is inserted before any recovery live write; subsequent attempts resume that recorded decision even if a different action is supplied. If recovery loses an acknowledgement, keep writers stopped, inspect again and rerun against that version. Do not edit/remove the audit decision. Completion revalidates content against the current authoring policy before choosing the decision. If that validation rejects an unapplied event, choose rollback. Reconciliation of an already consistent head only retries conditional published-draft cleanup; reset always retains drafts. Newer autosaves are preserved.
4. Verify the content-free state and report, still with writers stopped:

   ```js
   console.log(await EmailTemplateService.reconcileTransition(emailBrandId, emailTemplateId));
   console.log(await EmailTemplateService.reportInconsistencies(emailBrandId, emailTemplateId));
   ```

   Require `pendingVersion:null`, `outcome:'consistent'`, and an empty consistency report. Inspect/reconcile again if exact published-draft cleanup failed. A newer retained draft is expected and is not an inconsistency. Resume writers and reload the admin editor. The next successful mutation must exceed every allocated version, including rolled-back versions. Preserve the backup and operator audit identity according to deployment policy.

The unit suite exercises missing-history rollback, create/update/reset completion/rollback, ambiguous live acknowledgements, recovery interrupted after the audit decision, legacy initialization, and newer-autosave preservation. The native Mongo suite exercises the real head/index/CAS and the same create/update/reset, missing-history, ambiguous-acknowledgement, draft-cleanup and legacy-reset recovery protocol.

## Verification

Core tests: `packages/redbox-core/test/services/EmailTemplateAdminService.test.ts`, `test/controllers/EmailTemplateAdminController.test.ts`, and existing email safety/compatibility suites. Real Mongo races, partial failures, HTTP session/role/record gating and transport spies extend `test/integration/services/EmailTemplateService.test.ts`. Bruno requests are under `test/bruno/2 - AJAX calls/5 - Email Template Admin` and use `support/integration-testing/run-bruno-general*.sh`. The compatibility test loads SCU's actual `src/api/services/EmailService.ts` override and its real view-data function; only the core base import is substituted to use this checkout's implementation. Private SCU compatibility remains opt-in with both `SCU_EMAIL_REPO` and `SCU_EMAIL_FIXTURE`; fixtures/templates are never copied into this repository.

## Schema assistance and editor lifecycle (stage 4)

Schema assistance is read-only and separate from publication policy. `GET
/schema-targets` lists only the route brand's record types and workflow stages.
`GET /context-schema?recordType=rdmp&stage=draft&templateId=notice` returns
`{recordType, stage, contextKind, precision, schema}`. `templateId` remains optional
for legacy record-schema clients. For integration IDs, request
`GET /context-schema?templateId=integrationFailure` without record type/stage:
`precision` and `contextKind` are `integration`, and `recordType`/`stage` are empty
strings. Required/optional payload fields, types, descriptions and known enums
drive the field tree, autocomplete, samples and validation. Record schemas include
the curated record and legacy `imports` alias. Both kinds describe explicitly
exposed configuration path names without serializing exposed values. Integration schemas include
public brand portal values as sample annotations. It is draft 2020-12 JSON Schema.
Both endpoints require the route brand's Admin role and return `no-store`.
Unknown types return `UNKNOWN_RECORD_TYPE` (404); invalid or unknown stages
return `INVALID_SCHEMA_TARGET` (400). Responses are capped at 512 KiB.

When enabled and available, `RecordSchemaService.describeStage` supplies metadata
fields with the current requesting Admin as caller. `precision` is
`record-schema`. If disabled, unavailable or unable to describe the target, a
brand-scoped, caller-effective edit form supplies a best-effort name/label list
(`form-config`). Reusable replacements use their final metadata names. Model
groups retain their nesting, repeatables describe item paths, and layout-only
containers add no path. Leaf values have unknown types and remain permissive. If there is no usable
form, metadata is an open object (`none`). Schema responses are not cached:
caller access, form and schema changes must take effect on the next request.

The editor logic defaults assistance to the selected record's type and stage,
otherwise the brand's first type and its starting stage. Explicit choices are
kept per template in application memory, never in template configuration.
Part 1 provides this state and pure field-tree, sample-generation and Context
JSON validation helpers; selector, field-tree, autocomplete and sample-button
presentation are supplied by the following UI layer.

Validation accepts optional `recordType` and `stage`. It adds diagnostics with
`severity: warning`: `UNKNOWN_FIELD`, `EACH_NOT_ARRAY`, `PRINTS_OBJECT` and,
when requested by internal callers, `OPTIONAL_UNGUARDED`. Suggestions contain
only schema sibling names, never source excerpts. `each` supports both arrays
and objects. Scoped `each`/`with`, aliases, relative paths and `@root` are checked
where their context is known. Uncertain helper scopes, ambiguous schema unions
and additional hook roots are skipped. Missing form-only fields are not treated
as errors. Record optional hints are suppressed by default. Integration validation always
uses the payload schema, including `OPTIONAL_UNGUARDED` hints (for example for
`recordUrl`); `if`, `if (isDefined ...)`, and equivalent undefined guards suppress
those hints. Both core integration templates have zero schema warnings. Unknown
root typos remain blocking policy errors, presented as `UNKNOWN_FIELD` with a safe
sibling suggestion where available (for example `summray` → `summary`). Warnings are capped at 100;
they never block Publish or alter catalogue `invalid` flags. Stage 2b syntax,
context-root and helper policy remains the only blocking template validation.
Existing diagnostics now include `severity: error`; older omitted severities
must still be interpreted as errors.

Context JSON accepts single-quoted strings, unquoted identifier keys and trailing
commas. It uses a small data-only parser with no evaluation, comments or code
support. Preview receives standard JSON. Blur reformats the field and displays
“Converted to standard JSON”. UTF-8 size and 64-level nesting limits and recursive
prototype-key filtering still apply. Client schema errors are advisory and
reported by JSON path, without echoing data values. PRE whitespace is retained
in the HTML preview's plain-text reading.

Each template owns a keyed editor instance. All in-app, hash and browser-history
navigation settles the outgoing save queue before destroying it. Failed saves
keep the editor and working copy open; conflicts are retained under the original
template ID in application memory. They do not block another template. Pending
mutations lock editing and dialog dismissal, and reset stops on any failed
preparatory save. Record changes retire previous context/preview; text typed
during context loading takes precedence over the late record response.

## Preview-frame threat model

HTML preview responses include `frameUrl`, a same-origin
`GET /preview-frame/:token` URL. Only the existing preview render/hook/sanitiser
path may issue a token. The frame route never accepts HTML from a query, body,
or token payload and never renders a template. Stored output is already
sanitised. Subject and plain-text response fields remain as before.

A cryptographically random 256-bit token refers to process-local output for at
most 60 seconds and four reads, without sliding expiry. It is bound to the
route brand, authenticated user ID and session ID, and every read requires that
brand's current Admin role. Foreign, expired, exhausted and unknown tokens all
return `PREVIEW_FRAME_UNAVAILABLE` (404). At most four frames per session/user,
64 globally and 8 MiB of HTML are retained; older frames are evicted. Nothing is
persisted to Mongo. Restarts or requests reaching another worker invalidate the
URL; render another preview (or configure sticky sessions). URLs must not be
shared as permanent preview links.

The iframe uses `src` and retains **`sandbox=""`**. The document also enforces
CSP `sandbox`, so opening the frame URL directly does not remove containment.
Its response CSP is:

```text
default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: http: data:; font-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox
```

It also sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`
and `Cache-Control: no-store`. The CSP policy recognizes this route before
adding portal nonces, and the controller replaces the enforcing header and
removes any report-only portal policy. The admin page's normal `frame-src 'self'`
already permits it. The global portal style/script policy is unchanged.

The attacker-controlled input is template/context content, including malicious
markup which may survive a future sanitiser regression. DOMPurify remains the
first boundary; the empty sandbox and CSP prevent scripts, same-origin access,
forms, popups and parent/top navigation. Allowed inline email CSS can affect
only the frame. External images/fonts may make network requests (and can track
views); this is an intentional email-preview capability, with no referrer sent.
The token is not an HTML injection channel or a substitute for authorization.
No preview method sends mail or widens the delivery context/helpers.

Preview JSON and its selected record are retained independently for each template
in client memory while browsing this page. The edited marker and overwrite
confirmations use the retained original record baseline. This temporary workspace
is not part of a draft and is cleared when the page is reloaded or left; existing
preview requests still render the current JSON without persisting it. Opening an
editor focuses its heading; returning to the catalogue restores the opening action,
including through browser history.
