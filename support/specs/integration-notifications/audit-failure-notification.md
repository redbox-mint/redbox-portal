# Integration Failure Notifications

## Context

The `IntegrationAuditService` records audit entries for external integrations (currently
DOI and Figshare) with a `status` of `started` / `success` / `failed`
([IntegrationAuditService.ts](packages/redbox-core/src/services/IntegrationAuditService.ts),
[IntegrationAuditModel.ts](packages/redbox-core/src/model/storage/IntegrationAuditModel.ts)).
Today a `failed` status is persisted silently — nobody is told. Operators only find out
by opening the record audit panel.

We want to **send a notification when an integration audit is recorded with a `failed`
status**, configurable to fire for other statuses too. **Email** is the channel to build
now (reusing the existing `EmailService`), but the dispatch layer must be **pluggable** so
**Slack** and **generic webhook** channels can be added later without touching the audit
service.

### Decisions made with the user

- **Channel now:** Email only. Pluggable interface so Slack/webhook drop in later.
- **Recipients & settings:** sourced from the **branding-aware app config system**
  (`AppConfigService` per-brand config), not static sails config — admin-editable per brand.
- **Behaviour:** failure notifications **plus throttling** of repeated failures **plus
  recovery alerts** (failed → success).
- **Delivery:** dispatched **via an Agenda queue job**, not inline — durable and retryable,
  and fully isolated from the audit persistence path.

## Approach

### 1. Per-brand config model: `integrationNotification`

Register a branding-aware app config model so each brand stores its own notification
settings, editable through the existing app-config admin UI.

- New config class file, e.g.
  `packages/redbox-core/src/configmodels/IntegrationNotificationConfig.ts`, mirroring the
  shape of existing registered models (e.g. `FigsharePublishing` / `DoiPublishing` referenced
  in [ConfigModels.ts](packages/redbox-core/src/configmodels/ConfigModels.ts)).
- Register it in [ConfigModels.ts](packages/redbox-core/src/configmodels/ConfigModels.ts)
  with `key: 'integrationNotification'` alongside `figsharePublishing` / `doiPublishing`.
- Settings shape (per brand):
  ```ts
  {
    enabled: boolean;                 // default false
    statuses: string[];               // default ['failed']
    recipients: string[];             // email addresses (required for email to send)
    recordUrlBase?: string;           // link base; oid appended for the audit/record link
    throttle: { enabled: boolean; windowSeconds: number };   // suppress repeat failures
    recoveryAlerts: boolean;          // notify on failed -> success
    channels: Array<{
      type: 'email' | 'slack' | 'webhook';   // only 'email' implemented now
      enabled?: boolean;
      recipients?: string[];          // overrides top-level for this channel
      template?: string;              // EJS name; default 'integrationFailure'
      // slack/webhook fields reserved for later: webhookUrl, url, headers, timeoutMs
    }>;
    perIntegration?: {                // keyed by integrationName ('doi'|'figshare')
      [name: string]: Partial<above>; // override statuses/recipients/channels per integration
    };
  }
  ```
- Read at runtime via
  `AppConfigService.getAppConfigByBrandAndKey(brandId, 'integrationNotification')`
  ([AppConfigService.ts:261](packages/redbox-core/src/services/AppConfigService.ts#L261)),
  resolving the brand from `entry.brandId` with
  `BrandingService.getBrandById(...)`, falling back to `BrandingService.getDefault()` when
  `brandId` is absent
  ([BrandingService.ts](packages/redbox-core/src/services/BrandingService.ts)).
  When no config row exists or `enabled` is false → no-op.

### 2. New service: `IntegrationNotificationService`

New file
`packages/redbox-core/src/services/IntegrationNotificationService.ts`, following the
`export namespace Services { export class X extends services.Core.Service }` +
`declare global { let IntegrationNotificationService }` pattern (mirror
[EmailService.ts](packages/redbox-core/src/services/EmailService.ts)). Register it in
[services/index.ts](packages/redbox-core/src/services/index.ts) using the lazy-getter
pattern used for `IntegrationAuditService`.

**Normalized payload** (decouples channels from the audit model):

```ts
interface IntegrationNotificationPayload {
  kind: 'failure' | 'recovery';
  title: string;
  summary: string;
  severity: 'info' | 'warning' | 'error';
  redboxOid: string;
  brandId?: string;
  integrationName: string;
  integrationAction: string;
  status: string;
  triggeredBy?: string;
  message?: string;
  errorDetail?: string;
  httpStatusCode?: number;
  traceId: string;
  spanId: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  recordUrl?: string;
  timestamp: string;
}
```

**Pluggable channel interface:**

```ts
interface IntegrationNotificationChannel {
  readonly type: string;
  send(payload: IntegrationNotificationPayload, ctx: { recipients: string[]; channelConfig: any }): Promise<void>;
}
```

- Implement **`EmailChannel`** now: render the EJS template via
  `EmailService.buildFromTemplate(template, payload)` then
  `EmailService.sendMessage(recipients.join(','), body, subject)` (use `firstValueFrom` as
  [EmailService.sendRecordNotification](packages/redbox-core/src/services/EmailService.ts)
  does). Empty recipient list → log warning, no send. Email enablement is already honoured
  by `EmailService` (`emailnotification.settings.enabled`).
- **Slack / Webhook**: define the adapter stubs/type but mark deferred. They will use
  `axios.post` (the codebase's HTTP client, e.g.
  [doi-v2/http.ts](packages/redbox-core/src/services/doi-v2/http.ts)). Channels resolved
  from config by `type` via a `Map`; unknown types logged and skipped.

**Agenda job handler `dispatch(job)`** — the queued entry point:

1. Read the `IntegrationAuditModel` from job data.
2. Resolve brand config (section 1). If disabled/absent → return.
3. Resolve effective settings (apply `perIntegration[entry.integrationName]` override).
4. **Throttle + recovery state** via
   [CacheService](packages/redbox-core/src/services/CacheService.ts)
   (`get`→Observable, `set(name, data, ttlSeconds)`), key
   `intnotif:<brandId>:<oid>:<integrationName>`:
   - **status `failed`**: if `throttle.enabled` and an active failure state exists within
     `windowSeconds` → suppress. Else build a `failure` payload, dispatch to channels, and
     write failure state to cache (TTL = `windowSeconds`, or longer to keep recovery state).
   - **status `success`**: if `recoveryAlerts` and an active failure state exists → build a
     `recovery` payload, dispatch, then clear the cache state. Otherwise no-op.
   - other statuses: only act if listed in effective `statuses`.
5. Build the payload (map fields; `severity`: failed→error, recovery→info; `recordUrl` from
   `recordUrlBase` + oid). Dispatch to each enabled channel with `Promise.allSettled`, each
   send wrapped in try/catch so one failing channel can't block the others.
6. Entire handler wrapped so it never rejects out of the job (errors logged via
   `sails.log.error(this.logHeader ...)`).

### 3. Hook into the audit persistence path

Single hook point: `IntegrationAuditService.persistEntry`
([IntegrationAuditService.ts:268](packages/redbox-core/src/services/IntegrationAuditService.ts#L268))
— the one funnel both flows reach (integrationtest calls it directly; production's Agenda
`storeIntegrationAudit` handler at
[line 927](packages/redbox-core/src/services/IntegrationAuditService.ts#L927) also calls it).

After a **successful** store (not in the `!isSuccessful()` branch, not in `catch`), enqueue
the dispatch job for terminal statuses only (`failed`, or `success` when recovery is
possible — skip `started`):

```ts
private enqueueNotification(entry: IntegrationAuditModel): void {
  try {
    if (entry.status !== 'failed' && entry.status !== 'success') return;
    AgendaQueueService.now('IntegrationNotificationService-Dispatch', entry);
  } catch (err) {
    sails.log.error(`${this.logHeader} Failed to enqueue integration notification.`);
    sails.log.error(err);
  }
}
```

- **Queued, not inline** → audit latency unchanged; delivery retriable via Agenda.
- **Error-isolated** → a queue/enqueue failure only logs; auditing is never disrupted.
- **No double-fire:** `persistEntry` runs once per status transition, so a `failed` entry
  enqueues exactly one job. Fine-grained suppression of _repeated_ failures is handled by the
  throttle cache in the dispatcher.

Register the job in
[agendaQueue.config.ts](packages/redbox-core/src/config/agendaQueue.config.ts) next to the
existing `IntegrationAuditService-StoreIntegrationAudit` entry:

```ts
{ name: 'IntegrationNotificationService-Dispatch',
  fnName: 'integrationnotificationservice.dispatch',
  options: { lockLifetime: 30000, lockLimit: 1, concurrency: 1 } }
```

### 4. Email templates

New EJS templates in `views/emailTemplates/` (rendered by `EmailService.buildFromTemplate`):

- `integrationFailure.ejs` — failure alert.
- `integrationRecovery.ejs` — recovery/back-to-normal alert.

Both consume the payload locals: `title`, `summary`, `integrationName`,
`integrationAction`, `status`, `redboxOid`, `recordUrl` (render link only if present),
`triggeredBy`, `message`, `errorDetail`, `httpStatusCode`, `traceId`, `startedAt`,
`completedAt`, `durationMs`, `timestamp`. HTML-escape (`<%= %>`) `message`/`errorDetail`.

## Critical files

| File                                                                                       | Change                                                                  |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `configmodels/IntegrationNotificationConfig.ts`                                            | New per-brand config model class                                        |
| [configmodels/ConfigModels.ts](packages/redbox-core/src/configmodels/ConfigModels.ts)      | Register `integrationNotification` key                                  |
| `services/IntegrationNotificationService.ts`                                               | New: service, channel interface, `EmailChannel`, `dispatch` job handler |
| [services/index.ts](packages/redbox-core/src/services/index.ts)                            | Register new global service (lazy getter)                               |
| [IntegrationAuditService.ts](packages/redbox-core/src/services/IntegrationAuditService.ts) | Enqueue notification in `persistEntry` after success                    |
| [agendaQueue.config.ts](packages/redbox-core/src/config/agendaQueue.config.ts)             | Define `IntegrationNotificationService-Dispatch` job                    |
| `views/emailTemplates/integrationFailure.ejs`, `integrationRecovery.ejs`                   | New templates                                                           |

## Reuse notes

- Email: `EmailService.buildFromTemplate` / `sendMessage` — already handles SMTP + enable flag.
- Per-brand config: `AppConfigService.getAppConfigByBrandAndKey` + `registerConfigModel`.
- Brand resolve: `BrandingService.getBrandById` / `getDefault`.
- Queue: `AgendaQueueService.now` + `agendaQueue.config.ts` registration (same pattern the
  audit service already uses).
- Throttle/recovery state: `CacheService.get` / `set(name, data, ttlSeconds)`.
- HTTP (future Slack/webhook): `axios`.

## Testing

Mocha (redbox-core), mirroring
[IntegrationAuditService.test.ts](packages/redbox-core/test/services/IntegrationAuditService.test.ts)
(`createMockSails`, `setupServiceTestGlobals`). Stub `EmailService`, `AppConfigService`,
`BrandingService`, `CacheService`.

New `IntegrationNotificationService.test.ts`:

- Status gating: `failed` dispatches; `started` never; `success` only when recovery state active.
- Config disabled / no brand config → no channel called.
- Email channel: `buildFromTemplate('integrationFailure', payload)` + `sendMessage` with
  joined recipients; empty recipients → warn + no send.
- Throttle: second `failed` within window suppressed; after window, sends again.
- Recovery: `failed` then `success` with `recoveryAlerts` → recovery email + cache cleared;
  `success` with no prior failure → no-op.
- `perIntegration` override applies; other integrations use global.
- Error isolation: channel `send` rejects → `dispatch` still resolves.

Additions to `IntegrationAuditService.test.ts`:

- `persistEntry` of a `failed` entry enqueues `IntegrationNotificationService-Dispatch` once
  (stub `AgendaQueueService.now`); `started` does not enqueue.
- Enqueue throwing does not break `persistEntry` (audit still succeeds).

End-to-end manual verification:

1. Seed an `integrationNotification` app config for the default brand (enabled, a recipient,
   email channel) via the app-config admin UI or `AppConfigService.createOrUpdateConfig`.
2. Trigger a failing DOI/Figshare action (or call `IntegrationAuditService.failAudit` in a
   dev console) and confirm the Agenda job runs and an email is sent (check mail catcher /
   SMTP log).
3. Trigger a second failure within the throttle window → no second email. After the window →
   email again.
4. Trigger a `success` after a failure with `recoveryAlerts` on → recovery email sent.
5. Run the redbox-core mocha suite (per [redbox-testing] docker-compose profile).
