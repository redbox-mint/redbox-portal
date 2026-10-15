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
export interface AppConfigBundleLease {
  readonly name: string;
  readonly collection: BundleLockCollection;
  readonly owner: string;
  token: string;
  expiresAt: number;
  active: boolean;
  aborted: boolean;
  lost: boolean;
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
  async synchronizeBundle(brandId: string, purpose: 'save' | 'load' = 'save', lease?: AppConfigBundleLease): Promise<void> {
    const name = this.bundleName(brandId);
    if (lease) {
      this.assertBundleLease(lease, name);
      this.synchronizeBundleCache(name, lease.token);
      return;
    }
    let lock: BundleLock | null;
    try { lock = await this.lockCollection().findOne({ _id: name }); }
    catch { throw new Error('Unable to coordinate AppConfig secret update'); }
    if (lock?.owner && lock.expiresAt.getTime() > Date.now()) {
      if (purpose === 'save') throw new Error('Another AppConfig secret update is in progress for this brand. Retry shortly.');
      // Startup/reload can read the current AWS value during another node's write.
      // Its snapshot must remain untrusted for a later save, even if that writer
      // already published its token but has not yet finished its AWS request.
      this.invalidate(name);
      this.bundleTokens.delete(name);
      return;
    }
    this.synchronizeBundleCache(name, lock?.cacheToken ?? '');
  }

  /** Keep the same cross-node lease from the authoritative row read through cache publication. */
  async withBundleSave<T>(brandId: string, save: (lease: AppConfigBundleLease) => Promise<T>): Promise<T> {
    const name = this.bundleName(brandId);
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
    const lease: AppConfigBundleLease = { name, collection, owner, token: '', expiresAt: now + 120_000, active: true, aborted: false, lost: false };
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    let renewing: Promise<void> | undefined;
    let closing = false;
    const schedule = () => {
      if (closing || !lease.active || lease.aborted || lease.lost) return;
      heartbeat = setTimeout(() => {
        if (closing || lease.aborted || lease.lost) return;
        renewing = this.checkBundleSave(lease).catch(() => {
          sails.log.error('Unable to renew AppConfig secret write lease. Further writes require a valid lease.');
        }).finally(schedule);
      }, 20_000);
      heartbeat.unref();
    };
    try {
      let lock: BundleLock | null;
      try { lock = await collection.findOne({ _id: name, owner }); }
      catch { throw new Error('Unable to coordinate AppConfig secret update'); }
      if (!lock) throw new Error('Unable to coordinate AppConfig secret update');
      lease.token = lock.cacheToken ?? '';
      this.assertBundleLease(lease, name);
      this.synchronizeBundleCache(name, lease.token);
      schedule();
      return await save(lease);
    } finally {
      closing = true;
      clearTimeout(heartbeat);
      await renewing;
      lease.active = false;
      if (lease.lost || Date.now() >= lease.expiresAt) sails.log.error('AppConfig secret write lease was lost during the save. Reload and retry the intended configuration.');
      // An aborted request may still finish at AWS. Leave its lease until expiry.
      if (!lease.aborted) {
        // Keep the freshness token after release; it is cache invalidation metadata,
        // not a stored secret version or rollback history.
        try {
          const released = await collection.updateOne({ _id: name, owner }, { $set: { expiresAt: new Date(0) }, $unset: { owner: '' } });
          if (released.matchedCount !== 1) sails.log.error('AppConfig secret write lease ownership changed before release.');
        }
        catch { sails.log.error('Unable to release AppConfig secret write lease; it will expire automatically.'); }
      }
    }
  }

  private assertBundleLease(lease: AppConfigBundleLease, name: string): void {
    if (lease.expiresAt <= Date.now()) lease.lost = true;
    if (lease.name !== name || !lease.active || lease.aborted || lease.lost) throw new Error('AppConfig secret write lease was lost or aborted');
  }

  /** Renew immediately before persistence, and while an unabortable database write is pending. */
  async checkBundleSave(lease: AppConfigBundleLease): Promise<void> {
    this.assertBundleLease(lease, lease.name);
    const expiresAt = Date.now() + 120_000;
    let renewed: { matchedCount: number };
    try {
      renewed = await lease.collection.updateOne({ _id: lease.name, owner: lease.owner, expiresAt: { $gt: new Date() } }, { $max: { expiresAt: new Date(expiresAt) } });
    } catch { throw new Error('Unable to coordinate AppConfig secret update'); }
    if (renewed.matchedCount !== 1) lease.lost = true;
    lease.expiresAt = Math.max(lease.expiresAt, expiresAt);
    this.assertBundleLease(lease, lease.name);
  }

  /** Merge only explicitly changed fields into the current brand JSON; never send cached snapshots. */
  async storeBundle(brandId: string, changes: ReadonlyMap<string, string | null>, lease?: AppConfigBundleLease): Promise<string | undefined> {
    if (!lease) return this.withBundleSave(brandId, owned => this.storeBundle(brandId, changes, owned));
    const name = this.bundleName(brandId);
    this.assertBundleLease(lease, name);
    const { collection, owner } = lease;
    const controller = new AbortController();
    const signal = controller.signal;
    const deadline = Date.now() + 30_000;
    const timeout = setTimeout(() => { lease.aborted = true; controller.abort(); }, 30_000);
    try {
      const result = await this.safeAwsCall('store', async () => {
        this.synchronizeBundleCache(name, lease.token);
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
        await this.checkBundleSave(lease);
        const marked = await collection.updateOne({ _id: name, owner, expiresAt: { $gt: new Date() } }, { $set: { cacheToken: nextToken } });
        if (marked.matchedCount !== 1) { lease.lost = true; throw new Error('AppConfig secret write lease was lost'); }
        lease.token = nextToken;
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
      });
      this.assertBundleLease(lease, name);
      return result;
    } finally { clearTimeout(timeout); }
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
      if (!Object.prototype.hasOwnProperty.call(bundle.values, key)) {
        // A clear can commit before its database write fails, or while a reload
        // still holds the old reference. The current bundle remains authoritative.
        sails.log.warn('AppConfig bundle field has been cleared. Retry any incomplete configuration save.');
        return '';
      }
      return bundle.values[key];
    });
  }
}
