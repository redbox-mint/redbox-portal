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

The application role needs `secretsmanager:CreateSecret`, `secretsmanager:TagResource` and `secretsmanager:GetSecretValue` for secrets under the configured prefix. If using a customer-managed KMS key, also grant the necessary `kms:GenerateDataKey` and `kms:Decrypt` permissions in IAM and the key policy.

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

A masked form submission preserves an existing reference without another AWS write. Resubmitting identical plaintext also resolves and preserves the existing ARN in either provider mode, so repeated hook overrides do not create new secrets. In AWS mode, an explicit new value can also replace a reference whose old secret is unreadable or deleted; failure to read the old value prevents equality checking but does not prevent recovery. Masked values still require the existing secret to be readable. A changed secret creates a new secret with a unique name; the old reference remains usable if the database write fails or another save runs concurrently. Empty strings stay empty. `__CLEAR_SECRET__` removes the field reference.

AWS SDK failures return generic store/resolve errors to callers; server logs record the operation and a known error category without SDK messages, resource ARNs or secret values. AWS failures propagate to the caller: saves do not fall back to storing plaintext, and configuration loads do not return unresolved references. Bootstrap therefore requires access to referenced secrets. Saves hydrate the changed configuration before writing the database and update only that cache key after persistence; unavailable secrets in unrelated keys cannot turn a successful write into a reported failure. Hydration or database failures preserve the previous active cache.

## Existing configurations and operational lifecycle

Enabling AWS storage does not rewrite existing rows at startup. Saving each configuration moves its nonempty registered plaintext secrets into AWS, including fields submitted with the existing mask. Older duplicate database rows and backups are not rewritten. When no database row exists, masked fields retain their deployment/model default values; saving them in AWS mode migrates those values into Secrets Manager while leaving the deployment defaults unchanged. For hook-provided password fields, register their paths in `secretFields`. A `*` path segment matches one dynamic own-property key, for example Oni’s `sites.*.ingestion.adminToken`. Dynamic keys containing dots or brackets are treated literally; prototype-related keys are rejected on writes. Legacy own properties with these names can still be hydrated and masked on reads without modifying object prototypes. Wildcards apply consistently to validation, masking, preservation, clearing, storage and hydration; a password widget alone does not select secure storage.

Secrets are tagged `managed-by=redbox-appconfig`. Replacement, clearing, and failed database saves can leave unreferenced secrets. They are intentionally retained to support backups and rollback. Administrators should inventory references across active databases and retained backups before scheduling deletion of unreferenced secrets. AWS charges per secret, so account for the retained history when defining that lifecycle.

Setting the provider back to `database` does not migrate AWS secrets into MongoDB. Existing references still resolve using AWS and can be preserved or cleared. Replacing an externally stored secret requires AWS mode, preventing an accidental downgrade to plaintext. Moving fully away from AWS requires a separate deliberate migration.

Resolved secrets live in the existing in-memory branding cache. External AWS edits/rotation become visible after reloading configuration (for example, restarting the portal); this feature does not add automatic rotation polling.

## Regression verification

`test/integration/services/AppConfigService.test.ts` includes a real sails-mongo insert/update reference round trip with the Secrets Manager SDK mocked. Run it through the repository Mocha Docker workflow (see [ReDBox Automated Tests](ReDBox-Automated-Tests.md)). Package tests cover repeated plaintext/hook submissions, masked webservice responses, wildcard lifecycles, sanitized AWS failures and cache/persistence consistency. These tests do not verify live AWS access.

AppConfig write keys must be single safe names: dots, brackets, and prototype-related names are rejected before storage or cache updates. Hook configuration filenames use the name without their `.js`, `.json`, or `.ts` extension to match registered model keys.

## Upgrade: hook configuration filenames

Hook files at `branded-config/<brand>/{init-only,override}/foo.js` now use the registered key `foo`, rather than the legacy key `foo.js`. Review these files **before upgrading**: previously dormant `override/` files now take effect on every startup and can replace settings edited through the UI. Remove obsolete overrides or update them to the intended deployed settings. Init-only files create the real key only when it is absent.

Legacy database rows with dotted/bracketed or prototype-related configuration keys are skipped with a warning during backend loading and are excluded from the active configuration and admin views. Direct reads through the configuration editor reject these keys. Raw storage reads still expose the rows for deliberate migration. The upgrade does not delete or rename them: review their values against the active registered key before explicitly migrating or removing them, and account for any plaintext secrets retained in those rows and backups.

DOI and Figshare support `$ENV_VAR` indirection for credentials. AWS mode stores that literal placeholder in Secrets Manager; after hydration the integration still resolves the environment variable as before. This preserves compatibility but incurs a secret-storage charge for the placeholder. Prefer entering the actual credential in AppConfig when using AWS storage.

Saves currently read newly created secrets back before persistence and re-read unchanged plaintext references after the equality check. This verifies that the stored reference is readable before publishing it in the database/cache; it adds AWS read calls to save operations.
