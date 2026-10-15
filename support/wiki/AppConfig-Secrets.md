# AppConfig secrets in AWS Secrets Manager

AppConfig remains branding-aware and editable through the existing admin forms. By default, values remain in the database. Deployments on AWS can opt into Secrets Manager for fields registered in `ConfigModelInfo.secretFields` (including the existing Figshare token, DOI password, RAiD credentials and Oni ingestion admin tokens).

Set deployment configuration, for example in `config/local.js` or the appropriate `config/env` file:

```js
module.exports.appConfigSecrets = {
  provider: 'aws-secrets-manager',
  region: 'ap-southeast-2',
  namePrefix: 'my-production-portal/appconfig'
  // kmsKeyId: 'arn:aws:kms:...' // optional customer-managed key
};
```

Use a distinct prefix for each deployment. The SDK uses its standard AWS credential chain, including ECS task roles and EC2 instance roles; application passwords are still entered in AppConfig forms. Region can also come from the SDK's standard configuration.

The application role needs `secretsmanager:CreateSecret`, `secretsmanager:TagResource` and `secretsmanager:GetSecretValue` for secrets under the configured prefix. The optional `brand-json` layout also needs `secretsmanager:PutSecretValue`. If using a customer-managed KMS key, also grant the necessary `kms:GenerateDataKey` and `kms:Decrypt` permissions in IAM and the key policy.

## Storage and reads

AWS-backed AppConfig storage requires MongoDB 5.0 or newer, which supports nested dollar-prefixed reference keys. MongoDB 8.2 has been verified with the sails-mongo adapter. Each nonempty registered secret field is replaced in MongoDB by a structured reference:

```json
{
  "$appConfigSecret": {
    "provider": "aws-secrets-manager",
    "arn": "arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:..."
  }
}
```

Backend configuration loading resolves these references into strings before populating the existing branding configuration cache. Backend consumers continue to use `getAppConfigurationForBrand` / `sails.config.brandingAware` without changes. `getAllConfigurationForBrand` remains a raw storage read. Admin form/API reads and save responses remain masked with `__REDACTED__` and do not expose values or ARNs. Only the backend generates references; client-supplied reference objects are rejected.

A masked form submission preserves an existing reference without another AWS write. Resubmitting identical plaintext also preserves the existing ARN in either provider mode, so repeated hook overrides do not create new secrets. Resolved values are cached by ARN, concurrent reads share a request, and successful writes seed that cache directly. With a warm cache, masked saves and identical plaintext submissions make no AWS calls. A cold comparison reads the old secret once and reuses the result for hydration; new values are not read back after creation. This avoids extra requests, so a successful write does not separately verify `GetSecretValue` permission before saving. Empty strings stay empty. `__CLEAR_SECRET__` removes the field reference.

The default `per-field` layout creates a separate secret with a unique name for each changed field. Its old reference remains usable if the database write fails or another save runs concurrently. An explicit replacement can recover from an unreadable/deleted old field secret in AWS mode; database mode cannot downgrade a reference to plaintext. Preserving a masked reference requires its value to be cached or readable.

AWS SDK failures return generic store/resolve errors to callers; server logs record the operation and a known error category without SDK messages, resource ARNs or secret values. AWS failures propagate to the caller: saves do not fall back to storing plaintext, and configuration loads do not return unresolved references. Bootstrap therefore requires access to referenced secrets. Saves hydrate the changed configuration before writing the database and update only that cache key after persistence; unavailable secrets in unrelated keys cannot turn a successful write into a reported failure. Hydration or database failures preserve the previous active branding cache. Saves for the same brand and key are serialized within each portal process through persistence and cache publication; in `per-field` mode different keys can save concurrently. Cross-node branding caches are not synchronized automatically.

## Optional single JSON secret per brand

Set `layout: 'brand-json'` alongside `provider: 'aws-secrets-manager'` to keep all registered secrets for each brand in one AWS secret:

```js
module.exports.appConfigSecrets = {
  provider: 'aws-secrets-manager',
  layout: 'brand-json',
  region: 'ap-southeast-2',
  namePrefix: 'my-production-portal/appconfig'
};
```

Each brand uses a stable name under `<namePrefix>/brands/<brand-id-hash>`. MongoDB references contain the shared ARN plus a `key` selecting a value in the JSON. Keys encode `[configKey, ...fieldPath]` as JSON arrays, preserving literal punctuation in dynamic site names. For example, the AWS value is:

```json
{
  "format": "redbox-appconfig-v1",
  "values": {
    "[\"figsharePublishing\",\"connection\",\"token\"]": "figshare-token",
    "[\"doiPublishing\",\"connection\",\"password\"]": "doi-password"
  }
}
```

Application/admin reads and unchanged-password saves make zero AWS requests once cached and current. Saves check a small MongoDB cache token; a change made by another portal node invalidates the local bundle cache before comparison or hydration. A save after such a change reads the current bundle once, without rewriting unchanged passwords. Startup or an explicit reload fetches each distinct bundle ARN once for all its fields and configuration keys. A changed save reads the latest bundle once and sends one `PutSecretValue`, even when several fields change. Initial creation checks whether the bundle exists, then uses one `CreateSecret`. Explicit reloads refresh the ARN cache; failed reads are retried on subsequent requests. There is no background AWS polling.

Writes merge only changed fields into the latest AWS value, preserving other configuration keys and other nodes' completed changes. A MongoDB lease in `appconfigsecretlocks` coordinates the complete save across portal processes, from the authoritative configuration-row read through AWS changes, database persistence and cache publication. An overlapping writer is rejected before AWS access and can retry. Existing bundled references retain this protection after switching provider or layout. Startup and reload can read during a foreign write; their next save refreshes that snapshot before trusting it. Configuration keys with no registered secret fields skip lock checks entirely. Keys with registered secret fields take the lease even when those fields are absent, so an overlapping save cannot overlook a newly added password. AWS bundle requests abort after 30 seconds. The lease renews every 20 seconds while the save is pending, including during slow database writes; crashed/aborted writers' leases expire two minutes after their last renewal. Normal completion releases the lease immediately, retaining only coordination metadata. Failed renewals prevent further writes without a valid lease and are logged. A database write already dispatched through Waterline cannot be cancelled; after an outage exceeding the lease duration, reload and retry any affected save. The cache token changes before each AWS write, so even a failed request that commits at AWS invalidates other nodes' cached comparisons. The token stores no secret values or history and does not provide versioning or rollback. Saves within one process are serialized per brand. The application database account needs read/write access to the lock collection.

The application always uses the current JSON value and does not manage or reference versions. AWS automatically creates internal versions on updates; these cannot be disabled, and AWS version quotas still apply. The entire JSON must fit AWS's 65,536-byte secret-value limit. Clearing a bundled field removes its value from the current JSON; unrelated entries remain intact.

Bundled updates use roll-forward recovery. If AWS succeeds and the later database save fails, the AWS change remains applied. The active branding cache remains unchanged until a successful save or reload; existing database references resolve the new current value on reload. Retry the intended save to finish applying the configuration. Restoring an old database backup also reads the current bundle and cannot restore previous passwords. A missing field in a valid bundle resolves to an empty string with a warning: this covers a clear whose database write failed, a reload during that clear, and references restored from an older backup. Failure to read or parse the bundle still fails the load. Unchanged retries reuse the successful AWS result without another write.

Switching layouts does not rewrite rows at startup. Saving a configuration in `brand-json` mode migrates its registered plaintext values and masked per-field AWS references into the shared bundle. Other configurations migrate when saved; mixed references continue to load correctly. Existing standalone AWS secrets remain retained until explicitly cleaned up. Keeping the deployment prefix stable preserves the single bundle identity for each brand.

## Existing configurations and operational lifecycle

Enabling AWS storage does not rewrite existing rows at startup. Saving each configuration moves its nonempty registered plaintext secrets into AWS, including fields submitted with the existing mask. Older duplicate database rows and backups are not rewritten. When no database row exists, masked fields retain their deployment/model default values; saving them in AWS mode migrates those values into Secrets Manager while leaving the deployment defaults unchanged. For hook-provided password fields, register their paths in `secretFields`. A `*` path segment matches one dynamic own-property key, for example Oni’s `sites.*.ingestion.adminToken`. Dynamic keys containing dots or brackets are treated literally; prototype-related keys are rejected on writes. Legacy own properties with these names can still be hydrated and masked on reads without modifying object prototypes. Wildcards apply consistently to validation, masking, preservation, clearing, storage and hydration; a password widget alone does not select secure storage.

Secrets are tagged `managed-by=redbox-appconfig`. In `per-field` mode, replacement, clearing, and failed database saves can leave unreferenced secrets. They are intentionally retained to support backups and rollback. Administrators should inventory references across active databases and retained backups before scheduling deletion of unreferenced secrets. AWS charges per secret, so account for the retained history when defining that lifecycle. `brand-json` mode updates one secret per brand without creating a new billed secret for each change.

Setting the provider back to `database` does not migrate AWS secrets into MongoDB. Existing references still resolve using AWS and can be preserved or cleared. Replacing an externally stored secret requires AWS mode, preventing an accidental downgrade to plaintext. Moving fully away from AWS requires a separate deliberate migration.

Resolved secrets live in the existing in-memory branding cache. External AWS edits/rotation become visible after reloading configuration (for example, restarting the portal); this feature does not add automatic rotation polling.

## Regression verification

`test/integration/services/AppConfigService.test.ts` includes a real sails-mongo insert/update reference round trip with the Secrets Manager SDK mocked. Run it through the repository Mocha Docker workflow (see [ReDBox Automated Tests](ReDBox-Automated-Tests.md)). Package tests cover request counts for cached/unchanged saves, shared bundle updates, cross-process write coordination, per-field migration, repeated hook submissions, masked responses, wildcard lifecycles, sanitized AWS failures and roll-forward recovery. These tests do not verify live AWS access.

AppConfig write keys must be single safe names: dots, brackets, and prototype-related names are rejected before storage or cache updates. Hook configuration filenames use the name without their `.js`, `.json`, or `.ts` extension to match registered model keys.

## Upgrade: hook configuration filenames

Hook files at `branded-config/<brand>/{init-only,override}/foo.js` now use the registered key `foo`, rather than the legacy key `foo.js`. Review these files **before upgrading**: previously dormant `override/` files now take effect on every startup and can replace settings edited through the UI. Remove obsolete overrides or update them to the intended deployed settings. Init-only files create the real key only when it is absent. Within each init-only or override tree, files that normalize to the same key (including files in nested directories) are all skipped with an error; distinct keys continue to apply. The same key may intentionally appear once in each separate tree.

Legacy database rows with dotted/bracketed or prototype-related configuration keys are skipped with a warning during backend loading and are excluded from the active configuration and admin views. Direct reads through the configuration editor reject these keys. Raw storage reads still expose the rows for deliberate migration. The upgrade does not delete or rename them: review their values against the active registered key before explicitly migrating or removing them, and account for any plaintext secrets retained in those rows and backups.

DOI and Figshare support `$ENV_VAR` indirection for credentials. AWS mode stores that literal placeholder in Secrets Manager; after hydration the integration still resolves the environment variable as before. This preserves compatibility but incurs a secret-storage charge for the placeholder. Prefer entering the actual credential in AppConfig when using AWS storage.
