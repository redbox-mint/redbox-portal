import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { ReportingError, resolveReportingPrincipal, type ReportingPrincipal } from '@researchdatabox/redbox-core';
import type { McpConfig } from './config';
export class McpAuthError extends Error {
  constructor(public readonly code: 'invalid_token' | 'insufficient_scope') {
    super(code);
  }
}
export type McpIdentityResolver = (username: string, brandName: string) => Promise<ReportingPrincipal>;
/** No provisioning, email matching, token passthrough, or roles from claims. */
export const resolveOidcIdentity: McpIdentityResolver = async (username, brandName) => {
  const stored = await User.findOne({ username, type: 'oidc' });
  if (!stored || typeof stored !== 'object' || typeof Reflect.get(stored, 'id') !== 'string')
    throw new McpAuthError('invalid_token');
  return resolveReportingPrincipal(brandName, String(Reflect.get(stored, 'id')));
};
export class McpAuthenticator {
  private readonly keys: JWTVerifyGetKey;
  constructor(
    private readonly config: McpConfig,
    private readonly resolve: McpIdentityResolver = resolveOidcIdentity,
    keys?: JWTVerifyGetKey
  ) {
    this.keys =
      keys ?? createRemoteJWKSet(new URL(config.jwksUrl), { timeoutDuration: 5000, cooldownDuration: 30_000 });
  }
  async authenticate(authorization: string | undefined): Promise<ReportingPrincipal> {
    if (!authorization || !/^Bearer [A-Za-z0-9._~-]+$/.test(authorization) || authorization.length > 16_384)
      throw new McpAuthError('invalid_token');
    try {
      const { payload, protectedHeader } = await jwtVerify(authorization.slice(7), this.keys, {
        issuer: this.config.issuer,
        audience: this.config.resourceUrl,
        algorithms: this.config.algorithms,
        requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat'],
      });
      // Explicitly reject ID tokens; this resource consumes access tokens only.
      if (protectedHeader.typ && !['at+jwt', 'application/at+jwt', 'JWT'].includes(protectedHeader.typ))
        throw new McpAuthError('invalid_token');
      if (
        !['at+jwt', 'application/at+jwt'].includes(protectedHeader.typ ?? '') &&
        payload.typ !== 'Bearer' &&
        payload.token_use !== 'access'
      )
        throw new McpAuthError('invalid_token');
      if (payload.nonce !== undefined || payload.token_use === 'id' || payload.iat! > Date.now() / 1000 + 30)
        throw new McpAuthError('invalid_token');
      if (typeof payload.scope !== 'string' || !payload.scope.split(' ').includes(this.config.scope))
        throw new McpAuthError('insufficient_scope');
      const identity = payload[this.config.identityClaim];
      if (typeof identity !== 'string' || !identity.trim() || identity.length > 200)
        throw new McpAuthError('invalid_token');
      return await this.resolve(this.config.usernameToLowercase ? identity.toLowerCase() : identity, this.config.brand);
    } catch (error) {
      if (error instanceof McpAuthError) throw error;
      if (error instanceof ReportingError) throw new McpAuthError('invalid_token');
      throw new McpAuthError('invalid_token');
    }
  }
}
