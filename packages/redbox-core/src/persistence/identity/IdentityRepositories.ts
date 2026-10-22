import type { UserAttributes } from '../rows';
import type { RoleAttributes } from '../rows';
import type { UserLinkAttributes } from '../rows';
import type { UserAuditAttributes } from '../rows';
import type { PathRuleAttributes } from '../rows';
import type { WorkspaceAppAttributes } from '../rows';

/** Plain data only. Credentials never leave the repository's authentication operations. */
export type Values = Record<string, unknown>;
export interface IdentityRows {
  user: Omit<UserAttributes, 'password' | 'token'> & Values & { hasApiKey?: boolean };
  role: RoleAttributes & Values;
  userlink: UserLinkAttributes & Values;
  useraudit: UserAuditAttributes & Values;
  pathrule: PathRuleAttributes & Values;
  workspaceapp: WorkspaceAppAttributes & Values;
}
export type IdentityCollection = keyof IdentityRows;
export interface IdentityRead {
  populate?: readonly string[];
  sort?: readonly Record<string, string>[];
  skip?: number;
  limit?: number;
}
export interface IdentityRepositories {
  list<K extends IdentityCollection>(entity: K, criteria?: Values, options?: IdentityRead): Promise<IdentityRows[K][]>;
  one<K extends IdentityCollection>(
    entity: K,
    criteria: Values,
    options?: IdentityRead
  ): Promise<IdentityRows[K] | null>;
  create<K extends IdentityCollection>(entity: K, values: Values): Promise<IdentityRows[K]>;
  update<K extends IdentityCollection>(entity: K, criteria: Values, values: Values): Promise<IdentityRows[K][]>;
  remove(entity: IdentityCollection, criteria: Values): Promise<void>;
  findOrCreateWorkspace(criteria: Values, values: Values): Promise<WorkspaceAppAttributes>;
  addMemberships(side: 'user' | 'role', id: string | number, members: readonly (string | number)[]): Promise<void>;
  removeMemberships(side: 'user' | 'role', id: string | number, members: readonly (string | number)[]): Promise<void>;
  replaceMemberships(side: 'user' | 'role', id: string | number, members: readonly (string | number)[]): Promise<void>;
  assignBrandRoles(brand: string, roles: readonly (string | number)[]): Promise<void>;
  verifyPassword(userId: string, password: string): Promise<boolean>;
  findByApiTokenHash(hash: string, options?: IdentityRead): Promise<IdentityRows['user'] | null>;
}

/** Bridge callback-owned Passport flows; no ORM query object escapes the boundary. */
export function identityCallback<T>(operation: Promise<T>, callback: (error: unknown, result: T) => unknown): void {
  void operation.then(
    result => callback(null, result),
    error => callback(error, undefined as T)
  );
}
