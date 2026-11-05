import type { AuthorizedDomainsEmails } from '../configmodels/AuthorizedDomainsEmails';

export interface AuthorizedEmailResult {
  allowed: boolean;
  reason: 'missing-email' | 'invalid-address' | 'disabled' | 'unsupported-provider' |
    'unrestricted' | 'allowed-domain' | 'allowed-exception' | 'denied';
  matchedRule?: string;
}

/**
 * The legacy AAF/OIDC account-creation gate. Callers pass the provider-normalized
 * email (both sign-in providers lowercase it). Stored rules are never normalized:
 * matching is case-sensitive, domains are exact, and empty provider lists allow all.
 * Deliberately retains the legacy address check; HTTP callers validate syntax separately.
 * Pure evaluation: no logging, persistence, or mutation of draft/runtime configuration.
 * @internal
 */
export function evaluateAuthorizedEmail(
  email: string,
  config: Partial<AuthorizedDomainsEmails>,
  provider: string
): AuthorizedEmailResult {
  if (!email) return { allowed: false, reason: 'missing-email' };
  const parts = email.includes('@') ? email.split('@') : [];
  if (parts.length !== 2) return { allowed: false, reason: 'invalid-address' };
  if (config.enabled?.toString() !== 'true') return { allowed: true, reason: 'disabled' };

  let domains: string[];
  let emails: string[];
  if (provider === 'aaf') {
    domains = [...(config.domainsAaf || [])];
    emails = [...(config.emailsAaf || [])];
  } else if (provider === 'oidc') {
    domains = [...(config.domainsOidc || [])];
    emails = [...(config.emailsOidc || [])];
  } else return { allowed: false, reason: 'unsupported-provider' };

  if (!domains.length && !emails.length) return { allowed: true, reason: 'unrestricted' };
  if (domains.indexOf(parts[1]) !== -1) return { allowed: true, reason: 'allowed-domain', matchedRule: parts[1] };
  if (emails.indexOf(email) !== -1) return { allowed: true, reason: 'allowed-exception', matchedRule: email };
  return { allowed: false, reason: 'denied' };
}
