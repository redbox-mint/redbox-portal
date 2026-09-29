import { STATUS_CODES } from 'node:http';

/**
 * End an error response without invoking view resolution again. This is the
 * final fallback when no requested or default error template can be found.
 */
export function sendTerminalErrorFallback(res: Sails.Res): Sails.Res {
  const currentStatus = Number(res.statusCode);
  const status = Number.isInteger(currentStatus) && currentStatus >= 400 ? currentStatus : 404;
  const message = STATUS_CODES[status] || 'Error';

  res.status(status);
  return res.type('text/plain').send(`${status} ${message}`) as Sails.Res;
}
