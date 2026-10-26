import type { Request, Response } from 'express';
import type { AuthenticatedActor } from './identity';
import { UserModel } from '../../model/storage/UserModel';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { sendApiErrors } from './responses';

export function requireAdministrator(
  req: Request,
  res: Response,
  actor: AuthenticatedActor | undefined,
  brandId: string
): actor is AuthenticatedActor {
  if (!actor) {
    sendApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
    return false;
  }
  if (!actor.roles.some(role => role.brandId === brandId && role.name === 'Admin')) {
    sendApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
    return false;
  }
  return true;
}

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
