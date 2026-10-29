/** Existing bearer API clients remain sessionless; browser mutations must spend a CSRF token. */
const csrfMiddleware: () => (
  req: Sails.Req,
  res: Sails.Res,
  next: (error?: unknown) => void
) => void = require('@sailshq/csurf');
const verify = csrfMiddleware();
export function namedQueryMutationCsrf(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  if (!req.isAuthenticated()) return next();
  verify(req, res, error => {
    if (error) {
      res.status(403).json({ error: { code: 'CSRF_MISMATCH' } });
      return;
    }
    next();
  });
}
