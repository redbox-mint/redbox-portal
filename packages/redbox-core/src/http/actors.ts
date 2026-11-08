import type { AuthenticatedActor } from './express/identity';
import { UserModel } from '../model/storage/UserModel';
import { BrandingModel } from '../model/storage/BrandingModel';

export function userFromActor(actor: AuthenticatedActor): UserModel {
  return Object.assign(new UserModel(), {
    id: actor.id,
    username: actor.username,
    type: actor.type ?? '',
    name: actor.name ?? '',
    email: actor.email ?? '',
    roles: actor.roles.map(role => ({
      id: role.id,
      name: role.name ?? '',
      users: [],
      branding: Object.assign(new BrandingModel(), { id: role.brandId }),
    })),
  });
}
