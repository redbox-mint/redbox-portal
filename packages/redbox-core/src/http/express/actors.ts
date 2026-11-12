import type { Request, Response } from 'express';
import type { AuthenticatedActor } from './identity';
import { sendApiErrors } from './responses';
import { administratorRefusal } from '../actors';

export function requireAdministrator(
  req: Request,
  res: Response,
  actor: AuthenticatedActor | undefined,
  brandId: string
): actor is AuthenticatedActor {
  const refusal = administratorRefusal(actor, brandId);
  if (refusal) {
    sendApiErrors(req, res, refusal.status, [{ detail: refusal.detail }]);
    return false;
  }
  return true;
}

export { userFromActor } from '../actors';
