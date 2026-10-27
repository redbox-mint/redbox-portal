import { localCredentialUser } from '../../authentication/Accounts';
import { createHash } from 'node:crypto';
import type { IdentityRepositories, IdentityRows } from '../../persistence/identity/IdentityRepositories';

export interface AuthenticatedActor {
  readonly id: string;
  readonly username: string;
  readonly type?: string;
  readonly name?: string;
  readonly email?: string;
  readonly roles: readonly { readonly id: string; readonly brandId: string; readonly name?: string }[];
}

type User = IdentityRows['user'];
type IdentityInput = Pick<IdentityRepositories, 'one' | 'verifyPassword' | 'findByApiTokenHash'>;

function id(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value && typeof value === 'object' ? id(Reflect.get(value, 'id')) : '';
}

/** Pilot authentication reads authoritative credential-safe snapshots on every request. */
export class HttpIdentity {
  public constructor(private readonly repository: IdentityInput) {}

  public async session(userId: string): Promise<AuthenticatedActor | false> {
    return this.actor(await this.repository.one('user', { id: userId }, { populate: ['roles'] }));
  }

  public async bearer(token: string): Promise<AuthenticatedActor | false> {
    if (!token) return false;
    return this.actor((await this.bearerProfile(token)) || null);
  }

  public async bearerProfile(token: string): Promise<User | false> {
    if (!token) return false;
    return this.effectiveUser(
      await this.repository.findByApiTokenHash(createHash('sha256').update(token).digest('base64'), {
        populate: ['roles'],
      })
    );
  }

  /** Bound by a login adapter; this class does not add a public login route. */
  public async local(username: string, password: string): Promise<AuthenticatedActor | false> {
    return this.actor(await localCredentialUser(this.repository, username, password));
  }

  /** Credential-safe public profile retains the existing browser user/role shape. */
  public async profile(userId: string): Promise<User | false> {
    return this.effectiveUser(await this.repository.one('user', { id: userId }, { populate: ['roles'] }));
  }

  private async effectiveUser(user: User | null): Promise<User | false> {
    if (!user || user.loginDisabled === true) return false;
    const visited = new Set<string>();
    while (user.linkedPrimaryUserId) {
      const primaryId: string = String(user.linkedPrimaryUserId);
      if (visited.has(primaryId) || visited.size >= 10) return false;
      visited.add(primaryId);
      user = await this.repository.one('user', { id: primaryId }, { populate: ['roles'] });
      // An orphan alias must not recover its former permissions.
      if (!user || user.loginDisabled === true) return false;
    }
    if (user.accountLinkState === 'linked-alias') return false;
    return user;
  }

  private async actor(candidate: User | null): Promise<AuthenticatedActor | false> {
    const user = await this.effectiveUser(candidate);
    if (!user) return false;
    const roles = (user.roles ?? []).flatMap(role => {
      if (!role || typeof role !== 'object') return [];
      const roleId = id(role);
      const brandId = id(Reflect.get(role, 'branding'));
      const name = Reflect.get(role, 'name');
      return roleId && brandId
        ? [Object.freeze({ id: roleId, brandId, ...(typeof name === 'string' ? { name } : {}) })]
        : [];
    });
    return Object.freeze({
      id: String(user.id),
      username: user.username,
      type: user.type,
      name: user.name,
      email: user.email,
      roles: Object.freeze(roles),
    });
  }
}
