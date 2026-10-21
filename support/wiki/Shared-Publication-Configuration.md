# Shared publication configuration

Figshare and Oni use one durable publication framework after a brand completes its one-way cutover. Configure `publicationPublishing` in the existing brand AppConfig editor at `/{brand}/{portal}/admin/appconfig/edit/publicationPublishing`. Legacy `figsharePublishing` and `oniPublishing` settings apply only before cutover. The independent migration journal decides authority: deleting or disabling unified AppConfig never restores legacy processing.

Start with the [validated configuration example](https://github.com/redbox-mint/redbox-portal/blob/master/support/documentation/examples/publication/configuration.json). It contains both providers, explicit approval and auto-sync policies, disjoint outputs and an `all` workflow rule. `npm run docs:test` validates it against the real `PublicationPublishing` schema and registered adapters. Both destinations and processing are disabled. Schema validation is local; the sample account, endpoints, token marker, disks, record type and stages must be replaced and verified before activation. The sample Oni token is deliberately nonfunctional; enter the actual credential through the AppConfig secret control.

## Processing and storage

Set an explicit current local `processing.serviceUsername` with edit access to the brand's publication records and `serviceUserType: "local"`. It is the persistence actor, distinct from the saved requester, institutional approver and creator. A departed approver alone does not revoke an institutional approval; current continuation policy, service permissions and explicit revocation still apply.

`processing.stagingDisk` names a durable Flydrive disk accessible to every worker. Sealed source descriptors, generated timestamps, dependency snapshots and selected attachment versions/digests survive process restarts. Process-local temporary storage is insufficient for shared workers. Provider repository storage is configured separately from staging. Mongo storage must certify the complete publication capability version 1; method names alone do not establish support.

The defaults are 5,000 ms coalescing, a 120,000 ms lease, 20,000 ms heartbeat, five durable failure attempts, 60,000 ms retry base, 120,000 ms observation and 300,000 ms cleanup. Durations are positive integers; the lease must cover at least three heartbeats. Transport retries and durable attempts are separate budgets. Manual review, embargo and readiness waits do not consume failure attempts. `Publication-Dispatch` scans every 30 seconds; `Publication-SyncRecord` jobs carry only brand/OID/destination identifiers. Durable state recovers missed or duplicate delivery.

Staging cleanup runs every five minutes only for enabled processing, with a grace period of at least one hour or `cleanupMs`, whichever is greater. All retained source, recovery, migration, operation and correction references protect their bytes. Interrupted admissions have no automatic expiry; unknown graphs and read failures retain inputs. This reclaims eligible staging copies. Figshare originals have a separate post-completion cleanup fence: verified attachment-to-URL replacement, a durable recovery copy and current/reference checks are required before original bytes can be removed. See [Figshare queued synchronisation](Figshare-Queued-Synchronisation).

## Named destinations and fixed targets

Destination IDs match `^[a-z][a-z0-9-]{0,63}$` and are stable within their brand. Each has `provider`, `displayName`, `enabled`, `archived`, `connection`, `mapping`, `attachments`, `writeBack` and `providerOptions`. Several destinations may use one provider. Registered provider schemas keep Figshare and Oni settings distinct:

- Figshare: `connection` contains the API/front-end URLs, token and verified token `accountId`; `mapping` contains `metadata`, `authors`, `categories`; `attachments` contains `selection` and `assets`; `providerOptions` carries `article`, `impersonation`, `embargo` and optional provider record/write-back settings. Central `writeBack` keys include `articleId`, `articleUrls`, `status`, `error`, `syncState`, `allFilesUploaded`.
- Oni: `connection` is one former site's public URL, Flydrive storage and ingestion settings; `mapping` is the Oni mapping object; `attachments` is its selection object; `providerOptions` carries `rootCollection` and `metadata`. Register all three output keys: `citationUrlPath`, `citationDoiPath`, `publicationErrorPath`.

Write-back paths must be safe children of `metadata`. Destinations cannot share exact, ancestor/descendant or array-root outputs. When adding a second Figshare destination, override its default status/error/state outputs as well as article ID/URLs; otherwise the implicit defaults collide. For multiple Oni sites, assign distinct citation/error paths explicitly.

Once a destination is referenced by approval, binding or operation evidence, retain its provider and canonical remote target. Figshare checks API/account identity; Oni checks the physical FS path or S3 endpoint/bucket/prefix and repository namespace. Disk aliases and display labels cannot create a second owner of the same remote object. Credential rotation may retain a verified target; credentials resolving to a different account may not. Use a new destination ID for a different target. Unused destinations may be changed or removed; used destinations must be retained and disabled or archived.

Disabling pauses mutations and retains evidence. Archiving also removes the destination from new selection. Neither shrinks an already approved set. One provider-defined remote object has one managing binding across the deployment's brands, records and destinations.

Use AppConfig's masked credential controls and backend-owned secret references. The registry supplies wildcard secret metadata such as `destinations.*.connection.token` and `destinations.*.connection.ingestion.adminToken`. Do not copy redacted sentinels or backend reference objects into source-controlled config. Credentials are resolved at execution and excluded from approvals, payload-free status, queue messages and migration reports.

## Approval and auto-sync

Existing trusted record events/hooks grant authority; no separate approval screen is introduced. A policy has a stable `id`, positive `version`, `recordType`, `event`, fixed nonempty `destinations`, `mode` and optional grant/continuation conditions. Supported save events include `onCreate`, `onUpdate`, `onTransitionWorkflow`; compatibility hook entry points are also matched by the server. Configured hooks can call `sails.services.publicationservice.acceptRequest` inside the containing save. A hook's JSON options cannot supply an approval, actor, destination set or ready flag.

`approval` authorizes one sealed source revision and the whole selected destination set. Local validation must succeed for every member before the grant. `auto-sync` explicitly permits eligible saves to authorize fresh revisions and records local failures independently per destination. Ordinary draft saves do not hash every attachment or call remote providers. A material content/mapping/selection/target change invalidates old work even if no replacement request is granted. A failed save never authorizes its content. Readiness follows successful synchronous hooks and final committed-source validation.

The example gates the grant on entering `queued`, while its continuation condition is independent of that stage. Keep requester-dependent checks in `grantCondition`; continuation expressions cannot reference the historical `user`. Add current business restrictions to continuation deliberately. Do not mechanically strip stage clauses from existing expressions. Status/link writes and the framework's exact workflow projection preserve unchanged requests; a transition hook changing mapped data or selected bytes causes ordinary invalidation.

## Central workflow and independent results

Rules have stable IDs/versions, record type, fixed destinations, `completion: "all" | "any"` and `targetStage`. Rules and destination scope are frozen at approval; adding a rule later cannot adopt historical success. Only current provider-confirmed completion for the approved source counts. Old links, audit success, newer pending work or an uncertain operation cannot stand in for completion.

With `all`, every listed destination must complete, including a disabled or archived member of the approved set. With `any`, one currently eligible completion can advance the record once. Unfinished siblings continue for the same approved content after the stage changes, without reapplying the original grant-stage gate. Current permissions, continuation, revocation and source identity remain enforced. Neither policy makes remote outcomes transactional or withdraws a successful sibling. A later failed auto-sync does not move the workflow backwards; status distinguishes pending latest content from historical success.

## Destination status

The existing Integration Status component shows one labelled entry per destination, including two Figshare destinations independently. Pending ready work appears even before import or an audit row exists. Provider filters retain Figshare/Oni history; destination filtering remains brand/view-access checked. Rendering reads stored evidence and never starts work or polls a provider.

Read work status and source revision together: queued, running, waiting, retrying, failed, repair required, revoked, superseded, paused and completed describe the particular request. Current/historical links remain distinct. Figshare publication and embargo/accessibility are separate observations. Oni deposit, configured indexing and object visibility are separate: repository readiness never proves discoverability of this object/version. Administrators additionally receive record-scoped lag, lease, retry/repair and quarantine signals without payloads or credentials.

Continue with [cutover and recovery](Shared-Publication-Operations), [Figshare](Figshare-Queued-Synchronisation), [Oni](Configuring-Oni-Publishing) and [provider development](Publication-Provider-Development).

Shared vocabulary administration has a separate [stage-2 release gate](Shared-Publication-Vocabularies).
Its switch defaults off. One-way conversion retains Figshare IDs/aliases, approved
revisions and original audit history; it never authorizes historical republishing.
