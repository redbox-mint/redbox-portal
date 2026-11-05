import type { AuthorizedDomainsEmails } from '../configmodels/AuthorizedDomainsEmails';

export interface AuthorizedEmailResult {
  allowed: boolean;
  reason: 'missing-email' | 'invalid-address' | 'disabled' | 'unsupported-provider' |
    'unrestricted' | 'allowed-domain' | 'allowed-exception' | 'denied';
  matchedRule?: string;
}

/** Trim and fold letter case; domain rules also ignore the DNS root dot. @internal */
export function normalizeAuthorizedRule(value: string, domain = false): string {
  const normalized = value.trim().toLowerCase();
  return domain ? normalized.replace(/\.$/, '') : normalized;
}

/**
 * The AAF/OIDC account-creation gate. Addresses and stored rules ignore letter case
 * and surrounding whitespace. Domains are exact (ignoring a trailing root dot),
 * and empty provider lists allow all.
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
  email = normalizeAuthorizedRule(email);
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
  const domain = normalizeAuthorizedRule(parts[1], true);
  if (domains.some(rule => normalizeAuthorizedRule(rule, true) === domain)) return { allowed: true, reason: 'allowed-domain', matchedRule: domain };
  if (emails.some(rule => normalizeAuthorizedRule(rule) === email)) return { allowed: true, reason: 'allowed-exception', matchedRule: email };
  return { allowed: false, reason: 'denied' };
}
