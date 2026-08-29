import {
  asScopeKey,
  freezeAuthorizationContext,
  type AuthorizationAuthMethod,
  type AuthorizationContext,
  type AuthorizationPrincipalCategory,
} from '../../src/authorization';

export interface AuthorizationRequestFixtureOptions {
  readonly authMethod?: AuthorizationAuthMethod;
  readonly brandId?: string;
  readonly brandName?: string;
  readonly principalCategory?: AuthorizationPrincipalCategory;
  readonly routeId?: string;
  readonly scope?: string;
  readonly userId?: string;
  readonly username?: string;
}

export interface AuthorizationRequestFixture {
  readonly authorization: AuthorizationContext;
  readonly resourceAuthorization: NonNullable<Sails.Req['resourceAuthorization']>;
}

/**
 * Models the immutable authority attached by the Phase 6 policy chain before a
 * controller is invoked. Controller unit tests should use this instead of
 * weakening resource gates or reconstructing authority from session fields.
 */
export function authorizationRequestFixture(
  options: AuthorizationRequestFixtureOptions = {}
): AuthorizationRequestFixture {
  const scope = asScopeKey(options.scope ?? 'record.read');
  const brandId = options.brandId ?? 'brand-1';
  const brandName = options.brandName ?? 'default';
  const category = options.principalCategory ?? 'authenticated';
  const authMethod = options.authMethod ?? (category === 'legacy-bearer' ? 'bearer' : 'session');
  const authorization = freezeAuthorizationContext({
    contextType: 'brand',
    principal: {
      category,
      authMethod,
      active: true,
      ...(category === 'system-process'
        ? { operationId: 'test-operation' }
        : {
            userId: options.userId ?? 'user-1',
            username: options.username ?? 'alice',
          }),
    },
    brand: {
      requestedIdentifier: brandName,
      id: brandId,
      name: brandName,
      exists: true,
      authorized: true,
    },
    grantedScopeKeys: [scope],
    effectiveScopeKeys: [scope],
  });

  return Object.freeze({
    authorization,
    resourceAuthorization: Object.freeze({
      context: authorization,
      requiredScope: scope,
      routeId: options.routeId ?? `test:${scope}`,
    }),
  });
}
