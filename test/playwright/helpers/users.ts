import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';
import { PortalApi, type ResourceLedger } from '../fixtures/resources';

export type PortalUser = { id: string; username: string; name: string; email: string; roles: Array<{ id: string; name: string }>; loginDisabled?: boolean };

export async function findUser(request: APIRequestContext, username: string): Promise<PortalUser> {
  const response = await request.get('/default/rdmp/admin/users/get?includeDisabled=true');
  if (!response.ok()) throw new Error(`Cannot read owned user (${response.status()}).`);
  const users: PortalUser[] = await response.json();
  const user = users.find(candidate => candidate.username === username);
  if (!user) throw new Error(`The portal did not return owned user ${username}.`);
  return user;
}

/** Users and roles have no deletion API. Remove assignments and disable the
 * exact owned account; its audit history and inert identity last until reset. */
export function trackUser(api: PortalApi, resources: ResourceLedger, user: PortalUser): void {
  resources.track({ kind: 'disabled-user-history', id: user.id, cleanup: async () => {
    const disabled = await api.mutate('post', `admin/users/${user.id}/disable`, {});
    expect(disabled.ok()).toBeTruthy();
    expect(((await disabled.json()) as { status: boolean }).status).toBe(true);
    const detached = await api.mutate('post', 'admin/roles/user', { userid: user.id, roles: ['Guest'] });
    expect(detached.ok()).toBeTruthy();
    expect(((await detached.json()) as { status: boolean }).status).toBe(true);
    const current = await findUser(api.request, user.username);
    expect(current.loginDisabled).toBe(true);
    expect(current.roles.map(role => role.name)).toEqual(['Guest']);
  } });
}

export async function createUser(api: PortalApi, resources: ResourceLedger, username: string, password: string): Promise<PortalUser> {
  const response = await api.mutate('post', 'admin/users/newUser', {
    username, details: { name: username, email: `${username}@example.invalid`, password, roles: ['Researcher'] },
  });
  const user = await findUser(api.request, username);
  trackUser(api, resources, user);
  expect(response.ok()).toBeTruthy();
  expect(((await response.json()) as { status: boolean }).status).toBe(true);
  return user;
}

export async function createRole(api: PortalApi, resources: ResourceLedger, name: string): Promise<{ id: string; name: string }> {
  const response = await api.mutate('post', `api/roles/${encodeURIComponent(name)}`, { roleName: name });
  const listed = await api.get('admin/roles/get');
  const roles = (await listed.json()) as Array<{ id: string; name: string }>;
  const role = roles.find(candidate => candidate.name === name);
  if (!role) throw new Error(`The portal did not return owned role ${name}.`);
  resources.track({ kind: 'unassigned-role-history', id: role.id, cleanup: async () => {
    const usersResponse = await api.get('admin/users/get?includeDisabled=true');
    expect(usersResponse.ok()).toBeTruthy();
    const users = (await usersResponse.json()) as PortalUser[];
    expect(users.filter(user => user.roles.some(assigned => assigned.id === role.id))).toEqual([]);
  } });
  expect(response.ok()).toBeTruthy();
  return role;
}
