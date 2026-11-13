/** Deployment-level storage selection for registered AppConfig secret fields. */
export interface AppConfigSecretsConfig {
  provider: 'database' | 'aws-secrets-manager';
  /** Separate field secrets (default), or one mutable JSON secret per brand. */
  layout?: 'per-field' | 'brand-json';
  /** Uses the SDK region/credential chain when omitted (including IAM roles). */
  region?: string;
  /** Use a different prefix for each deployment sharing an AWS account. */
  namePrefix: string;
  /** Optional customer-managed KMS key ID or ARN. */
  kmsKeyId?: string;
}

export const appConfigSecrets: AppConfigSecretsConfig = {
  provider: 'database',
  namePrefix: 'redbox/appconfig',
};
