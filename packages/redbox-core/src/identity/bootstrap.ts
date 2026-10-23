import { createHash } from 'node:crypto';
import type { AuthBrandConfig } from '../authentication/Accounts';
import type { IdentityRepositories, IdentityRows } from '../persistence/identity/IdentityRepositories';

export interface BootstrapRole {
  readonly id: string;
  readonly name: string;
}

/**
 * Seed once, after the selected roles are loaded. Existing credentials and role
 * assignments belong to the operator; startup never resets or expands them.
 * The repository hashes credentials and owns the single membership relation.
 */
export async function bootstrapDefaultAdministrator(input: {
  readonly repository: IdentityRepositories;
  readonly auth: AuthBrandConfig;
  readonly roles: readonly BootstrapRole[];
  readonly administrator: BootstrapRole;
}): Promise<IdentityRows['user']> {
  const config = input.auth.local;
  const username = config?.default?.adminUser;
  if (!username) throw new Error('Default administrator username is required for identity bootstrap.');
  if (!input.administrator.id || !input.roles.some(role => role.id === input.administrator.id))
    throw new Error('Default administrator role must belong to the selected bootstrap roles.');
  const existing = await input.repository.one('user', { [config?.usernameField ?? 'username']: username });
  if (existing) {
    // A matching name alone must never turn an unrelated account into an admin.
    const member = await input.repository.one('role', { id: input.administrator.id }, { populate: ['users'] });
    const users = member?.users as readonly { readonly id?: string }[] | undefined;
    if (!users?.some(user => user.id === existing.id))
      throw new Error('Default administrator account exists without its administrator role; reconcile before startup.');
    return existing;
  }
  if (!config?.default?.adminPw)
    throw new Error('Default administrator password is required when creating a new account.');
  if (!config.default.email) throw new Error('Default administrator email is required when creating a new account.');
  const user = await input.repository.create('user', {
    type: 'local',
    name: 'Local Admin',
    [config.usernameField ?? 'username']: username,
    [config.passwordField ?? 'password']: config.default.adminPw,
    email: config.default.email,
    ...(config.default.token ? { token: createHash('sha256').update(config.default.token).digest('base64') } : {}),
  });
  // addMemberships writes both sides through the canonical repository relation.
  // Await it: readiness must not race a returned/unsubscribed Observable.
  await input.repository.addMemberships(
    'user',
    user.id,
    input.roles.map(role => role.id)
  );
  return user;
}

export interface BootstrapPathRule {
  readonly path: string;
  readonly role: string;
  readonly can_read?: boolean;
  readonly can_update?: boolean;
}

/** Preserve stored policy. Configuration is a seed, never a mutable role-ID cache. */
export async function bootstrapPathRules(input: {
  readonly repository: Pick<IdentityRepositories, 'create'>;
  readonly brandId: string;
  readonly rules: readonly BootstrapPathRule[];
  readRules(): Promise<readonly unknown[]>;
  roleId(name: string): string | undefined;
}): Promise<void> {
  if ((await input.readRules()).length) return;
  const rules = input.rules.map(rule => {
    const role = input.roleId(rule.role);
    if (!role) throw new Error('Path rule bootstrap references an unavailable role.');
    return { ...rule, role, branding: input.brandId };
  });
  // Resolve every role before the first write. Like the existing bootstrap,
  // this is not transactional: a database failure requires checkpoint recovery.
  for (const rule of rules) await input.repository.create('pathrule', rule);
}
