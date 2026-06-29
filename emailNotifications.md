# Make Email Notification Config Branding-Aware

## Context

Email notifications in ReDBox are sent by [EmailService.ts](packages/redbox-core/src/services/EmailService.ts), which reads **everything** from the single global `sails.config.emailnotification` block ([emailnotification.config.ts](packages/redbox-core/src/config/emailnotification.config.ts)): the sender `from` address, default `subject`, the per-template subject registry, the SMTP `serverOptions`, and the `enabled` flag. In a multi-brand portal this means every brand sends mail with the same identity — e.g. a record-transfer email for "Institution A" still comes "from" the default ReDBox address with a generic subject. There is no way for an institution to brand its outgoing notifications.

The codebase already has a clean, established pattern for per-brand config: a config-model class registered in the [ConfigModels](packages/redbox-core/src/configmodels/ConfigModels.ts) registry, persisted per-brand in the `AppConfig` model, resolved at runtime via `AppConfigService.getAppConfigurationForBrand(brandName)`, and surfaced automatically in the admin AppConfig UI. Figshare/DOI publishing and the newly-added `integrationNotification` all use it. This migration makes email notifications follow the same pattern.

**Scope (confirmed with user):** only the **sender identity (`from`, optional `replyTo`) and subjects (default subject + per-template subject overrides)** become per-brand. SMTP transport (`serverOptions`) and the `enabled` flag stay global. Brands **reuse the existing shared `.ejs` templates** — no per-brand template directories. The global `sails.config.emailnotification` remains the base/fallback; a brand only overrides the fields it sets.

## Approach

Add an `emailNotification` config model, resolve a brand's overrides on top of the global defaults inside `EmailService`, and thread brand context in from the three call sites that have it (record-notification hooks, the messaging API controller, the integration-notification email channel). `sendMessage`'s transport/enabled logic is unchanged because those stay global.

### 1. New config model — `configmodels/EmailNotificationConfig.ts`

Mirror [IntegrationNotificationConfig.ts](packages/redbox-core/src/configmodels/IntegrationNotificationConfig.ts):

```ts
import { AppConfig } from './AppConfig.interface';
export class EmailNotificationConfig extends AppConfig {}
export const EMAIL_NOTIFICATION_SCHEMA = {
  type: 'object',
  title: 'Email Notification',
  properties: {
    from: { type: 'string', title: 'From Address', default: '' },
    replyTo: { type: 'string', title: 'Reply-To Address', default: '' },
    subject: { type: 'string', title: 'Default Subject', default: '' },
    templates: {
      type: 'object',
      title: 'Per-Template Subject Overrides',
      patternProperties: {
        '^[a-zA-Z0-9_-]+$': {
          type: 'object',
          properties: { subject: { type: 'string', title: 'Subject' } },
        },
      },
    },
  },
};
```

All defaults are empty — an unset brand contributes nothing and falls through to the global config.

### 2. Register the model — [ConfigModels.ts](packages/redbox-core/src/configmodels/ConfigModels.ts)

- Add `'emailNotification'` to the `ConfigModelKey` union.
- Add an entry to `modelsMap` (key `'emailNotification'`, `modelName: 'EmailNotificationConfig'`, `title: 'Email Notification'`, the class + schema + `tsGlob`).

Registration automatically: (a) makes `getAppConfigurationForBrand(name).emailNotification` available (defaulted via `loadAppConfigurationModel`), and (b) surfaces the config in the admin AppConfig editor (schema-driven, no UI code needed). No `secretFields` — these fields are not secret.

### 3. Brand-aware resolution in [EmailService.ts](packages/redbox-core/src/services/EmailService.ts)

Add a private helper that merges global defaults with a brand's overrides, **ignoring empty-string overrides** (so an unset brand field does not blank out the global value):

```ts
private resolveBrandEmailConfig(brand?: string | BrandingModel): { defaults: EmailDefaults; templates: Record<string, EmailTemplate> } {
  const globalDefaults = sails.config.emailnotification.defaults;
  const globalTemplates = sails.config.emailnotification.templates ?? {};
  if (!brand) return { defaults: globalDefaults, templates: globalTemplates };

  const brandName = typeof brand === 'string' ? brand : brand.name;
  const brandCfg = _.get(AppConfigService.getAppConfigurationForBrand(brandName), 'emailNotification', {}) as Record<string, unknown>;

  // only apply non-empty overrides
  const overrideDefaults = _.pickBy(_.pick(brandCfg, ['from', 'replyTo', 'subject']), v => !_.isEmpty(v));
  return {
    defaults: _.merge({}, globalDefaults, overrideDefaults),
    templates: _.merge({}, globalTemplates, _.get(brandCfg, 'templates', {})),
  };
}
```

Use the **name-keyed in-memory map** (`getAppConfigurationForBrand`) like [figshare-v2/config.ts](packages/redbox-core/src/services/figshare-v2/config.ts) `getBrandName` does — it is synchronous and already merged with defaults. (Avoid `getAppConfigByBrandAndKey`, which keys by brand **id** and is async; see Note below.)

Thread the resolved config through `evaluateProperties` so the `from`/`subject` default lookups become brand-aware:

- `evaluateProperties(options, config, templateData, brand?)` — resolve `const brandEmail = this.resolveBrandEmailConfig(brand)` once, and pass it into the property evaluators.
- `evaluatePropertyDefault(...)` — read from `brandEmail.defaults` instead of `sails.config.emailnotification.defaults`.
- `evaluatePropertyTemplateConfig(...)` — read from `brandEmail.templates` instead of `sails.config.emailnotification.templates`.

These three already form one call chain (`evaluateProperties` → `evaluateProperty` → the two helpers), so pass `brandEmail` down as an added argument. `from`/`subject` (and optional `replyTo` via `otherSendOptions`) then resolve from the brand. `sendMessage`'s `enabled` check and `serverOptions` are untouched (global, per scope). Add `'resolveBrandEmailConfig'` is internal; optionally export a small `getBrandEmailDefaults(brandName)` for the integration channel (step 6).

### 4. Derive brand in `sendRecordNotification` — same file

`sendRecordNotification(oid, record, options, user, response)` already has the `record`. Derive the brand name from it (reuse the resolution logic in [figshare-v2/config.ts](packages/redbox-core/src/services/figshare-v2/config.ts) `getBrandName`: `record.metaMetadata.brandId` → `BrandingService.getBrandById(...).name`, falling back to `'default'`). Pass that brand name into the `evaluateProperties(options, {}, variables, brandName)` call. This covers the main production path (the `recordtype.config.ts` post/pre email hooks).

### 5. Derive brand in the messaging API — [EmailController.ts](packages/redbox-core/src/controllers/EmailController.ts)

`sendNotification(req, res)` has the request. Get `const brandName = BrandingService.getBrandNameFromReq(req)` and pass it as the 4th arg to `this.emailService.evaluateProperties(options, config, templateData, brandName)`.

### 6. Brand-aware integration email channel — [IntegrationNotificationService.ts](packages/redbox-core/src/services/IntegrationNotificationService.ts)

`EmailChannel.send(...)` currently calls `EmailService.sendMessage(recipients, body, subject)` with no `from`, so it uses the global address. The dispatcher already resolves the brand name (`resolvedBrandId`). Pass the brand's `from` through: resolve via the new `EmailService.getBrandEmailDefaults(brandName).from` (or pass the brand name into a brand-aware send) and supply it as the `msgFrom` argument. Plumb the resolved brand name from `dispatch()` into the `ctx` handed to `channel.send`.

## Critical files

- New: [packages/redbox-core/src/configmodels/EmailNotificationConfig.ts](packages/redbox-core/src/configmodels/EmailNotificationConfig.ts)
- [packages/redbox-core/src/configmodels/ConfigModels.ts](packages/redbox-core/src/configmodels/ConfigModels.ts) — register key + model
- [packages/redbox-core/src/services/EmailService.ts](packages/redbox-core/src/services/EmailService.ts) — `resolveBrandEmailConfig`, brand-aware `evaluateProperties`/defaults/template lookups, brand derivation in `sendRecordNotification`
- [packages/redbox-core/src/controllers/EmailController.ts](packages/redbox-core/src/controllers/EmailController.ts) — pass brand from `req`
- [packages/redbox-core/src/services/IntegrationNotificationService.ts](packages/redbox-core/src/services/IntegrationNotificationService.ts) — brand-aware `from` in `EmailChannel`

## Backward compatibility & notes

- All new params are optional / default to global behaviour; existing callers and the global `sails.config.emailnotification` are unchanged. Brands with no `emailNotification` AppConfig record behave exactly as today.
- Empty-string brand fields must NOT overwrite global values — handled by the `_.pickBy(..., !_.isEmpty)` filter in `resolveBrandEmailConfig`.
- **Note (pre-existing, optional to fix):** `IntegrationNotificationService.dispatch()` passes a brand **name** to `AppConfigService.getAppConfigByBrandAndKey()`, which queries by brand **id** — so its DB overrides silently never load (it always gets defaults). Out of scope for this change; flag it. The new email path deliberately uses the name-keyed `getAppConfigurationForBrand` to avoid this trap.

## Verification

1. **Build:** `npm run build` in `packages/redbox-core` (or the repo's TS build) — confirm the new config model and signatures compile.
2. **Unit/integration tests (Mocha, in docker per [redbox-testing] skill):**
   - Extend/add an `EmailService` test under `packages/redbox-core/test/services/`: assert that with a brand whose `emailNotification` override sets `from`/`subject`, `evaluateProperties(options, {}, vars, brandName)` yields the brand's `fromRendered`/`subjectRendered`, and that with no override it falls back to global; assert an empty-string override does not blank the global value.
   - Run existing `EmailService` and `IntegrationNotificationService` tests to confirm no regression.
3. **Manual end-to-end:**
   - In the admin AppConfig UI for a non-default brand, set Email Notification `from` and a per-template subject override; save.
   - Trigger a record notification for a record in that brand (e.g. the publication/transfer-owner flow) and confirm the captured email (integration-testing-email / mailpit container, SMTP `1025`) shows the brand's `from` and subject.
   - Trigger an integration audit failure for that brand and confirm the alert email uses the brand `from`.
   - Repeat for the default brand to confirm the global fallback is unchanged.
