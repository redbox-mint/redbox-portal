import { randomUUID, createHash } from 'node:crypto';
import { CreateSecretCommand, GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { AppConfigSecretsConfig } from '../config/appConfigSecrets.config';

export interface AppConfigSecretReference {
  $appConfigSecret: { provider: 'aws-secrets-manager'; arn: string; key?: string };
}

export function isAppConfigSecretReference(value: unknown): value is AppConfigSecretReference {
  if (typeof value !== 'object' || value === null || !('$appConfigSecret' in value)) return false;
  const reference = value.$appConfigSecret;
  return (
    typeof reference === 'object' &&
    reference !== null &&
    'provider' in reference &&
    reference.provider === 'aws-secrets-manager' &&
    'arn' in reference &&
    typeof reference.arn === 'string' &&
    reference.arn.startsWith('arn:') &&
    (!('key' in reference) || (typeof reference.key === 'string' && reference.key.length > 0))
  );
}

interface SecretValue { arn: string; name?: string; value: string }
interface BrandSecrets { format: 'redbox-appconfig-v1'; values: Record<string, string> }
interface BundleLock { owner?: string; expiresAt: Date; cacheToken?: string }
interface BundleLockCollection {
  findOne(filter: object): Promise<BundleLock | null>;
  updateOne(filter: object, update: object, options?: object): Promise<{ matchedCount: number }>;
}

/** Cached reads for both immutable field secrets and mutable brand bundles. */
export class AppConfigSecrets {
  private client: SecretsManagerClient;
  private values = new Map<string, Promise<SecretValue>>();
  private bundleTokens = new Map<string, string>();

  constructor(private config: AppConfigSecretsConfig) {
    this.client = new SecretsManagerClient({ region: config.region });
  }

  async store(brandId: string, configKey: string, field: string, value: string): Promise<AppConfigSecretReference> {
    const prefix = this.getPrefix();
    const scope = createHash('sha256')
      .update(JSON.stringify([brandId, configKey, field]))
      .digest('hex');
    const result = await this.safeAwsCall('store', () => this.client.send(
      new CreateSecretCommand({
        Name: `${prefix}/${scope}/${randomUUID()}`,
        SecretString: value,
        KmsKeyId: this.config.kmsKeyId,
        Tags: [{ Key: 'managed-by', Value: 'redbox-appconfig' }],
      })
    ));
    if (!result.ARN) throw new Error('AWS Secrets Manager did not return a secret ARN');
    this.remember({ arn: result.ARN, name: result.Name, value });
    return { $appConfigSecret: { provider: 'aws-secrets-manager', arn: result.ARN } };
  }

  private getPrefix(): string {
    const prefix = this.config.namePrefix;
    if (!prefix || !/^[a-zA-Z0-9/_+=.@-]+$/.test(prefix) || prefix.length > 400) throw new Error('Invalid appConfigSecrets.namePrefix');
    return prefix;
  }

  private remember(secret: SecretValue): void {
    const cached = Promise.resolve(secret);
    this.values.set(secret.arn, cached);
    if (secret.name) this.values.set(secret.name, cached);
  }

  /** Promise caching also coalesces concurrent reads. Rejected requests can be retried. */
  private async read(secretId: string): Promise<SecretValue> {
    const cached = this.values.get(secretId);
    if (cached) return cached;
    const pending = this.fetch(secretId);
    this.values.set(secretId, pending);
    try {
      const secret = await pending;
      if (this.values.get(secretId) === pending) {
        // Do not replace a newer value published while this read was in flight.
        if (!this.values.has(secret.arn)) this.values.set(secret.arn, pending);
        if (secret.name && !this.values.has(secret.name)) this.values.set(secret.name, pending);
      }
      return secret;
    } catch (error) {
      if (this.values.get(secretId) === pending) this.values.delete(secretId);
      throw error;
    }
  }

  private async fetch(secretId: string, signal?: AbortSignal): Promise<SecretValue> {
    const result = await this.client.send(new GetSecretValueCommand({ SecretId: secretId }), { abortSignal: signal });
    if (result.SecretString === undefined) throw new Error('AppConfig secrets must contain a SecretString');
    return { arn: result.ARN ?? secretId, name: result.Name, value: result.SecretString };
  }

  private parseBundle(value: string): BrandSecrets {
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { throw new Error('Invalid AppConfig secret bundle'); }
    if (typeof parsed !== 'object' || parsed === null || !('format' in parsed) || parsed.format !== 'redbox-appconfig-v1' ||
        !('values' in parsed) || typeof parsed.values !== 'object' || parsed.values === null || Array.isArray(parsed.values) ||
        !Object.values(parsed.values).every(value => typeof value === 'string')) throw new Error('Invalid AppConfig secret bundle');
    return parsed as BrandSecrets;
  }

  private bundleName(brandId: string): string {
    const scope = createHash('sha256').update(brandId).digest('hex');
    return `${this.getPrefix()}/brands/${scope}`;
  }

  private lockCollection(): BundleLockCollection {
    const model = AppConfig as unknown as { getDatastore?: () => { manager?: { collection?: (name: string) => BundleLockCollection } } };
    const collection = model.getDatastore?.().manager?.collection?.('appconfigsecretlocks');
    if (!collection) throw new Error('Bundled AppConfig secrets require MongoDB write coordination');
    return collection;
  }

  private synchronizeBundleCache(name: string, token: string): void {
    if (this.bundleTokens.get(name) !== token) this.invalidate(name);
    this.bundleTokens.set(name, token);
  }

  /** Mongo-only freshness check before comparisons or hydration during saves/reloads. */
  async synchronizeBundle(brandId: string): Promise<void> {
    const name = this.bundleName(brandId);
    let lock: BundleLock | null;
    try { lock = await this.lockCollection().findOne({ _id: name }); }
    catch { throw new Error('Unable to coordinate AppConfig secret update'); }
    if (lock?.owner && lock.expiresAt.getTime() > Date.now()) {
      throw new Error('Another AppConfig secret update is in progress for this brand. Retry shortly.');
    }
    this.synchronizeBundleCache(name, lock?.cacheToken ?? '');
  }

  /** A lease covers all portal nodes, since Secrets Manager has no conditional JSON update. */
  private async withBundleLock<T>(name: string, write: (signal: AbortSignal, deadline: number, collection: BundleLockCollection, owner: string, token: string) => Promise<T>): Promise<T> {
    const collection = this.lockCollection();
    const owner = randomUUID();
    const now = Date.now();
    try {
      await collection.updateOne({ _id: name, expiresAt: { $lte: new Date(now) } }, {
        $set: { owner, expiresAt: new Date(now + 120_000) }
      }, { upsert: true });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new Error('Another AppConfig secret update is in progress for this brand. Retry shortly.');
      }
      throw new Error('Unable to coordinate AppConfig secret update');
    }
    // Finish or abort well before a crashed writer's lease can be reclaimed.
    const controller = new AbortController();
    const remaining = 30_000 - (Date.now() - now);
    const timeout = setTimeout(() => controller.abort(), Math.max(remaining, 0));
    try {
      if (remaining <= 0) throw new Error('AppConfig secret write lease acquisition timed out');
      let lock: BundleLock | null;
      try { lock = await collection.findOne({ _id: name, owner }); }
      catch { throw new Error('Unable to coordinate AppConfig secret update'); }
      if (!lock) throw new Error('Unable to coordinate AppConfig secret update');
      return await write(controller.signal, now + 30_000, collection, owner, lock.cacheToken ?? '');
    } finally {
      clearTimeout(timeout);
      if (Date.now() >= now + 30_000) controller.abort();
      // An aborted request may still finish at AWS. Leave its lease until expiry.
      if (!controller.signal.aborted) {
        // Keep the freshness token after release; it is cache invalidation metadata,
        // not a stored secret version or rollback history.
        try { await collection.updateOne({ _id: name, owner }, { $set: { expiresAt: new Date(0) }, $unset: { owner: '' } }); }
        catch { sails.log.error('Unable to release AppConfig secret write lease; it will expire automatically.'); }
      }
    }
  }

  /** Merge only explicitly changed fields into the current brand JSON; never send cached snapshots. */
  async storeBundle(brandId: string, changes: ReadonlyMap<string, string | null>): Promise<string | undefined> {
    const name = this.bundleName(brandId);
    return this.withBundleLock(name, (signal, deadline, collection, owner, token) => this.safeAwsCall('store', async () => {
      this.synchronizeBundleCache(name, token);
      const cached = this.values.get(name);
      if (cached) {
        try {
          const secret = await cached;
          const bundle = this.parseBundle(secret.value);
          const unchanged = [...changes].every(([key, value]) => value === null
            ? !Object.prototype.hasOwnProperty.call(bundle.values, key)
            : Object.prototype.hasOwnProperty.call(bundle.values, key) && bundle.values[key] === value);
          if (unchanged) return secret.arn;
        } catch {
          // An in-flight read can fail. Retry under the lease with normal redaction.
        }
      }
      let current: SecretValue | undefined;
      try { current = await this.fetch(name, signal); }
      catch (error: unknown) {
        if (!(error instanceof Error) || error.name !== 'ResourceNotFoundException') throw error;
      }
      const bundle: BrandSecrets = current ? this.parseBundle(current.value) : { format: 'redbox-appconfig-v1', values: {} };
      let changed = false;
      for (const [key, value] of changes) {
        if (value === null) {
          if (Object.prototype.hasOwnProperty.call(bundle.values, key)) { delete bundle.values[key]; changed = true; }
        } else if (!Object.prototype.hasOwnProperty.call(bundle.values, key) || bundle.values[key] !== value) {
          Object.defineProperty(bundle.values, key, { value, enumerable: true, writable: true, configurable: true });
          changed = true;
        }
      }
      if (!changed) {
        if (current) this.remember(current);
        return current?.arn;
      }
      const value = JSON.stringify(bundle);
      if (Buffer.byteLength(value, 'utf8') > 65_536) throw new Error('AppConfig secret bundle exceeds the AWS 64 KiB limit');
      // Invalidate other nodes BEFORE dispatch: a failed/aborted AWS request may
      // still commit. Never leave their old caches marked as current in that case.
      const nextToken = randomUUID();
      const marked = await collection.updateOne({ _id: name, owner }, { $set: { cacheToken: nextToken } });
      if (marked.matchedCount !== 1) throw new Error('AppConfig secret write lease was lost');
      if (signal.aborted || Date.now() >= deadline) throw new Error('AppConfig secret write timed out');
      const result = current
        ? await this.client.send(new PutSecretValueCommand({ SecretId: current.arn, SecretString: value }), { abortSignal: signal })
        : await this.client.send(new CreateSecretCommand({
          Name: name, SecretString: value, KmsKeyId: this.config.kmsKeyId,
          Tags: [{ Key: 'managed-by', Value: 'redbox-appconfig' }]
        }), { abortSignal: signal });
      const arn = result.ARN ?? current?.arn;
      if (!arn) throw new Error('AWS Secrets Manager did not return a secret ARN');
      this.remember({ arn, name, value });
      this.bundleTokens.set(name, nextToken);
      return arn;
    }));
  }

  /** Explicit reloads refresh this ARN and its name alias without evicting other brands. */
  invalidate(arn: string): void {
    const cached = this.values.get(arn);
    if (cached) for (const [key, value] of this.values) if (value === cached) this.values.delete(key);
  }

  /** SDK messages can contain IAM/KMS resource details. Never log request inputs or raw errors. */
  private async safeAwsCall<T>(operation: 'store' | 'resolve', call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : '';
      const knownErrors = ['AccessDeniedException', 'DecryptionFailure', 'EncryptionFailure', 'ResourceNotFoundException', 'InvalidRequestException', 'ThrottlingException'];
      const category = knownErrors.includes(name) ? name : 'SDKError';
      sails.log.error(`AppConfig Secrets Manager ${operation} failed (${category}). Check AWS permissions, KMS and connectivity.`);
      throw new Error(`Unable to ${operation} AppConfig secret in AWS Secrets Manager`);
    }
  }

  async resolve(reference: AppConfigSecretReference): Promise<string> {
    return this.safeAwsCall('resolve', async () => {
      const secret = await this.read(reference.$appConfigSecret.arn);
      const key = reference.$appConfigSecret.key;
      if (key === undefined) return secret.value;
      const bundle = this.parseBundle(secret.value);
      if (!Object.prototype.hasOwnProperty.call(bundle.values, key)) throw new Error('Missing AppConfig bundle field');
      return bundle.values[key];
    });
  }
}
