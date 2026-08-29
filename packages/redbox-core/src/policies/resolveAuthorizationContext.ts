import type { AuthorizationContext } from '../authorization';
import { sendAuthorizationProblem } from './authorization-response';

interface RequestAuthorizationService {
  resolveRequestContext(req: Sails.Req): Promise<AuthorizationContext>;
}

function isRequestAuthorizationService(value: unknown): value is RequestAuthorizationService {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'resolveRequestContext') === 'function'
  );
}

export async function resolveAuthorizationContext(
  req: Sails.Req,
  res: Sails.Res,
  next: Sails.NextFunction
): Promise<void> {
  try {
    const service = sails.services.authorizationservice;
    if (!isRequestAuthorizationService(service)) throw new Error('AuthorizationService is unavailable.');
    req.authorization = await service.resolveRequestContext(req);
    next();
  } catch {
    sails.log.error('Authorization context resolution failed.', {
      requestId: req.authorizationRequestId,
      errorCode: 'resolution-failed',
    });
    sendAuthorizationProblem(req, res, 500, 'authorization-unavailable', 'Authorization is unavailable.');
  }
}

export default resolveAuthorizationContext;
