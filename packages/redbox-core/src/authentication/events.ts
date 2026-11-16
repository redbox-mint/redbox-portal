/** Select only a bounded username; credential bodies never enter security events. */
export function authenticationFailureEvent(
  req: { readonly method: string; readonly path: string; readonly body?: unknown },
  context: { brandId: string; portalId?: string },
  usernameField = 'username'
): import('../services/siem/SiemTypes').SecurityEventInput {
  const username: unknown = req.body && typeof req.body === 'object' ? Reflect.get(req.body, usernameField) : undefined;
  return {
    ...context,
    eventType: 'authentication.login.failure',
    category: 'authentication',
    source: 'Authentication',
    ...(typeof username === 'string' && username.length > 0 && username.length <= 4096
      ? { subject: { username } }
      : {}),
    requestContext: { method: req.method, path: req.path },
  };
}
