import type { Request, Response } from 'express';
import type { AuthenticatedActor } from './identity';
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

export { userFromActor } from '../actors';
