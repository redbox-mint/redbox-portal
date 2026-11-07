import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendApiErrors } from './responses';
import { requestString } from '../requestValues';

declare module 'fastify' {
  interface Session {
    csrfToken?: string;
    langCode?: string;
  }
}
export interface NativeCsrfInput {
  readonly origins: readonly string[];
  authenticateBearer?(token: string): Promise<unknown | false>;
}

export function createNativeCsrf(input: NativeCsrfInput) {
  const origins = new Set(input.origins);
  if (
    !origins.size ||
    [...origins].some(
      value => !['http:', 'https:'].includes(URL.parse(value)?.protocol ?? '') || URL.parse(value)?.origin !== value
    )
  )
    throw new TypeError('CSRF requires explicit canonical browser origins.');
  const originAllowed = (request: FastifyRequest) =>
    !['cross-site', 'same-site'].includes(requestString(request.headers['sec-fetch-site']) ?? '') &&
    (request.headers.origin === undefined || origins.has(requestString(request.headers.origin) ?? ''));
  const protect = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!originAllowed(request)) return sendApiErrors(request, reply, 403, [{ detail: 'Cross-origin request denied' }]);
    const received = requestString(
      request.headers['x-csrf-token'] ?? (request.body as { _csrf?: unknown } | undefined)?._csrf
    );
    const stored = request.session?.get('csrfToken');
    if (
      typeof received !== 'string' ||
      received.length > 256 ||
      typeof stored !== 'string' ||
      Buffer.byteLength(received) !== Buffer.byteLength(stored) ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(stored))
    )
      return sendApiErrors(request, reply, 403, [{ detail: 'Invalid CSRF token' }]);
  };
  const apiProtect = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!originAllowed(request)) return sendApiErrors(request, reply, 403, [{ detail: 'Cross-origin request denied' }]);
    const bearer = /^Bearer ([^\s,]+)$/i.exec(requestString(request.headers.authorization) ?? '')?.[1];
    if (bearer && input.authenticateBearer && (await input.authenticateBearer(bearer))) return;
    return protect(request, reply);
  };
  const generateToken = (request: FastifyRequest, overwrite = false): string => {
    const saved = request.session.get('csrfToken');
    if (!overwrite && typeof saved === 'string') return saved;
    const token = randomBytes(32).toString('hex');
    request.session.set('csrfToken', token);
    return token;
  };
  return {
    protect,
    apiProtect,
    generateToken,
    async token(request: FastifyRequest, reply: FastifyReply) {
      if (!originAllowed(request))
        return sendApiErrors(request, reply, 403, [{ detail: 'Cross-origin request denied' }]);
      const _csrf = generateToken(request);
      await request.session.save();
      return reply.headers({ 'Cache-Control': 'no-store, private', Pragma: 'no-cache', Expires: '0' }).send({ _csrf });
    },
  };
}
