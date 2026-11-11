import type { ActionReply } from '../../actions/actionReply';
import type { HttpRequestContext, AuthenticatedActor } from '../../context';
import { buildCompanionSendTokenHtml } from './companionSendToken';

interface CompanionRequest {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}
export function companionRequestPrelude(
  req: CompanionRequest,
  res: Pick<ActionReply, 'status' | 'json'>,
  path: string
) {
  if (
    req.method === 'POST' &&
    [path + '/url/meta', path + '/url/get'].includes(req.path) &&
    (!req.body || typeof req.body !== 'object' || typeof Reflect.get(req.body, 'url') !== 'string')
  ) {
    res.status(400).json({ message: 'Invalid URL request' });
    return false;
  }
  return true;
}

/** Shared authorization-adjacent guards, canonical popup and audit ordering. */
export async function companionDispatch(
  req: CompanionRequest,
  input: {
    readonly path: string;
    readonly appUrl: string | undefined;
    context(): HttpRequestContext;
    audit(actor: AuthenticatedActor, action: string, context: { brandId: string; method: string }): Promise<unknown>;
  }
) {
  const relative = req.path.slice(input.path.length).split('/').filter(Boolean);
  if (req.method === 'GET' && input.appUrl && relative.length === 2 && relative[1] === 'send-token')
    return {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
      html: buildCompanionSendTokenHtml(input.appUrl, relative[0]!),
    };
  const { actor, brand } = input.context();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method))
    await input.audit(actor!, 'companion-request', { brandId: brand.id, method: req.method });
}
