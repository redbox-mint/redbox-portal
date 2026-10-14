import { randomUUID, createHash } from 'node:crypto';
import { CreateSecretCommand, GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { AppConfigSecretsConfig } from '../config/appConfigSecrets.config';

export interface AppConfigSecretReference {
  $appConfigSecret: { provider: 'aws-secrets-manager'; arn: string };
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
    reference.arn.startsWith('arn:')
  );
}

/** Immutable secrets keep failed DB writes and concurrent saves from changing old references. */
export class AppConfigSecrets {
  private client: SecretsManagerClient;

  constructor(private config: AppConfigSecretsConfig) {
    this.client = new SecretsManagerClient({ region: config.region });
  }

  async store(brandId: string, configKey: string, field: string, value: string): Promise<AppConfigSecretReference> {
    const prefix = this.config.namePrefix;
    if (!prefix || !/^[a-zA-Z0-9/_+=.@-]+$/.test(prefix) || prefix.length > 400) {
      throw new Error('Invalid appConfigSecrets.namePrefix');
    }
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
    return { $appConfigSecret: { provider: 'aws-secrets-manager', arn: result.ARN } };
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
    const result = await this.safeAwsCall('resolve', () => this.client.send(new GetSecretValueCommand({ SecretId: reference.$appConfigSecret.arn })));
    if (result.SecretString === undefined) throw new Error('AppConfig secrets must contain a SecretString');
    return result.SecretString;
  }
}
